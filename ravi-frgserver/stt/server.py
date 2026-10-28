"""Self-hosted Persian speech-to-text for the reporting app.

Runs an open-weight Whisper model with faster-whisper on your own machine, so
audio never leaves your server and no API key is needed. The app's worker
forwards recordings here when STT_URL is set.

    python server.py                       # listens on 127.0.0.1:8765
    STT_MODEL=large-v3-turbo python server.py

Environment:
    STT_MODEL     tiny | base | small | medium | large-v3 | large-v3-turbo  (default: medium)
    STT_DEVICE    auto | cpu | cuda                                        (default: auto)
    STT_COMPUTE   int8 | int8_float16 | float16 | float32                  (default: int8 on CPU, float16 on GPU)
    STT_HOST      bind address                                             (default: 127.0.0.1)
    STT_PORT      port                                                     (default: 8765)
    STT_TOKEN     if set, requests must send header  X-STT-Token: <value>
    STT_MAX_MB    upload limit in megabytes                                (default: 25)
    STT_MAX_PENDING  maximum admitted uploads/decodes combined              (default: 2)
    STT_MAX_CONNECTIONS  maximum simultaneous HTTP connections            (default: 16)
    STT_READ_TIMEOUT  socket inactivity timeout in seconds                (default: 30)
    STT_UPLOAD_TIMEOUT  total upload deadline in seconds                   (default: 120)
    STT_MAX_SECONDS  maximum decoded audio duration in seconds             (default: 185)

Only the standard library is used for the HTTP side, so the one dependency is
faster-whisper (which bundles its own audio decoder; no separate ffmpeg).
"""
from __future__ import annotations

import hmac
import io
import json
import math
import os
import re
import sys
import tempfile
import threading
import time
from email.parser import BytesParser
from email.policy import HTTP
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# A prompt in the register the app receives nudges the decoder toward Persian
# script and incident vocabulary. It never adds words of its own.
PROMPT = "گزارش یک رخداد به زبان فارسی. نام خیابان، ساعت، پلاک و شماره‌ها را همان‌طور که گفته می‌شود بنویس."

_ARABIC = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "ة": "ه", "ـ": ""})


def tidy(text: str) -> str:
    """Whisper sometimes writes Arabic ي/ك; the rest of the app expects Persian."""
    return re.sub(r"\s+", " ", text.translate(_ARABIC)).strip()


def model_label(name: str) -> str:
    # STT_MODEL can be an absolute local model directory. Never return its
    # internal path to callers or expose it through the unauthenticated health.
    short = name.rstrip("/\\").replace("\\", "/").rsplit("/", 1)[-1]
    return short if short.lower().startswith("whisper-") else f"whisper-{short}"


class AudioTooLong(Exception):
    """The decoded samples exceed the configured duration limit."""


def decode_bounded(path: str, max_seconds: float, sampling_rate: int = 16000):
    """Decode only up to the duration limit, not an unbounded compressed file.

    Counting resampled frames avoids trusting container duration metadata. Like
    faster-whisper's decoder, audio is mono float32 at 16 kHz. This limit is
    separate from the compressed upload byte limit.
    """
    import av
    import numpy as np

    if not math.isfinite(max_seconds) or max_seconds <= 0:
        raise ValueError("max_seconds must be positive and finite")
    resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=sampling_rate)
    limit, samples = int(max_seconds * sampling_rate), 0
    raw = io.BytesIO()

    def append(frame):
        nonlocal samples
        samples += frame.samples
        if samples > limit:
            raise AudioTooLong
        raw.write(frame.to_ndarray().tobytes())

    with av.open(path, mode="r", metadata_errors="ignore") as container:
        if not container.streams.audio:
            raise ValueError("no audio stream")
        for frame in container.decode(audio=0):
            # Ignore discontinuous input timestamps just like faster-whisper.
            frame.pts = None
            for converted in resampler.resample(frame):
                append(converted)
        for converted in resampler.resample(None):
            append(converted)
    if not samples:
        raise ValueError("empty audio")
    return np.frombuffer(raw.getbuffer(), dtype=np.int16).astype(np.float32) / 32768.0


class Transcriber:
    """Loads the model once; one decode at a time so memory stays bounded."""

    def __init__(self, name: str, device: str, compute: str | None, max_seconds: float = 185):
        from faster_whisper import WhisperModel  # imported here so tests can stub the class

        if device == "auto":
            try:
                import ctranslate2
                device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
            except Exception:
                device = "cpu"
        compute = compute or ("float16" if device == "cuda" else "int8")
        if not math.isfinite(max_seconds) or max_seconds <= 0:
            raise ValueError("STT_MAX_SECONDS must be positive and finite")
        self.name, self.label, self.device, self.compute = name, model_label(name), device, compute
        self.max_seconds = max_seconds
        self.model = WhisperModel(name, device=device, compute_type=compute)
        self.lock = threading.Lock()

    def __call__(self, path: str) -> dict:
        started = time.perf_counter()
        with self.lock:
            audio = decode_bounded(path, self.max_seconds)
            segments, info = self.model.transcribe(
                audio, language="fa", task="transcribe", beam_size=5,
                vad_filter=True, initial_prompt=PROMPT, condition_on_previous_text=False,
            )
            text = tidy(" ".join(s.text for s in segments))
        elapsed = time.perf_counter() - started
        return {
            "text": text,
            "model": self.label,
            "duration": round(float(getattr(info, "duration", 0.0) or 0.0), 2),
            "seconds": round(elapsed, 2),
        }


def parse_multipart(content_type: str, body: bytes) -> dict[str, tuple[str, bytes]]:
    """Returns {field: (filename, bytes)} using only the standard library."""
    message = BytesParser(policy=HTTP).parsebytes(
        b"Content-Type: " + content_type.encode("latin-1") + b"\r\n\r\n" + body
    )
    parts = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if name:
            parts[name] = (part.get_filename() or "", part.get_payload(decode=True) or b"")
    return parts


class BoundedHTTPServer(ThreadingHTTPServer):
    """Bound HTTP threads, including clients which never finish their headers.

    Transcription admission is a separate, smaller limit in make_handler. A
    full connection pool is rejected before spawning another thread. This is a
    per-process limit, not a distributed rate limiter.
    """

    def __init__(self, address, handler, max_connections: int = 16):
        if max_connections < 1:
            raise ValueError("max_connections must be positive")
        self._connections = threading.BoundedSemaphore(max_connections)
        super().__init__(address, handler)

    def process_request(self, request, client_address):
        if not self._connections.acquire(blocking=False):
            # Do not read or log the request. Keep the accept loop bounded even
            # if the peer refuses to read a response.
            data = b'{"error":"server busy"}'
            try:
                request.settimeout(0.2)
                request.sendall(b"HTTP/1.0 503 Service Unavailable\r\n"
                                b"Content-Type: application/json\r\n"
                                b"Retry-After: 5\r\nConnection: close\r\n"
                                b"Content-Length: " + str(len(data)).encode() + b"\r\n\r\n" + data)
            except OSError:
                pass
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self._connections.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._connections.release()


def validate_token(token: str | None):
    # HTTP header values must be portable across browsers/Node/Python.
    if token and any(not 0x21 <= ord(ch) <= 0x7e for ch in token):
        raise ValueError("STT_TOKEN must use printable ASCII without spaces")


def make_handler(transcribe, token: str | None, max_bytes: int,
                 max_pending: int = 2, read_timeout: float = 30,
                 upload_timeout: float = 120):
    validate_token(token)
    if max_pending < 1 or max_bytes < 1 or read_timeout <= 0 or upload_timeout <= 0 or not all(math.isfinite(n) for n in (read_timeout, upload_timeout)):
        raise ValueError("STT limits must be positive and finite")
    # Covers the upload, multipart parsing, temp file and model wait. The model
    # itself stays single-threaded; excess work is refused instead of queueing
    # unlimited 25 MB recordings and timing out later.
    admitted = threading.BoundedSemaphore(max_pending)

    class Handler(BaseHTTPRequestHandler):
        server_version = "ravi-stt/1"

        def setup(self):
            super().setup()
            self.connection.settimeout(read_timeout)

        def _json(self, status: int, payload: dict):
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            try:
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                if status == 503:
                    self.send_header("Retry-After", "5")
                self.end_headers()
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError, TimeoutError):
                # A caller may disconnect while a long decode is running.
                self.close_connection = True

        def log_message(self, fmt, *args):  # no audio, query string, or text in the log
            route = self.path.split("?", 1)[0]
            route = route if route in ("/health", "/transcribe") else "other"
            method = self.command if self.command in ("GET", "POST") else "other"
            sys.stderr.write("stt %s %s\n" % (method, route))

        def do_GET(self):
            if self.path == "/health":
                return self._json(200, {"ok": True, "model": getattr(transcribe, "label", "stub")})
            self._json(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/transcribe":
                return self._json(404, {"error": "not found"})
            if token and not hmac.compare_digest(self.headers.get("X-STT-Token", "").encode("utf-8"), token.encode("utf-8")):
                return self._json(401, {"error": "unauthorized"})
            lengths = self.headers.get_all("Content-Length", [])
            # This server does not decode chunked bodies. Reject ambiguous
            # framing rather than reading one interpretation of the request.
            if self.headers.get("Transfer-Encoding") is not None or len(lengths) > 1:
                return self._json(400, {"error": "invalid request framing"})
            if not lengths:
                return self._json(411, {"error": "content length required"})
            value = lengths[0]
            if len(value) > 20 or not re.fullmatch(r"[0-9]+", value):
                return self._json(400, {"error": "invalid content length"})
            length = int(value)
            if length <= 0:
                return self._json(400, {"error": "empty body"})
            if length > max_bytes:
                return self._json(413, {"error": "too large"})
            if not admitted.acquire(blocking=False):
                return self._json(503, {"error": "server busy"})
            try:
                try:
                    deadline = time.monotonic() + upload_timeout
                    chunks, remaining = [], length
                    while remaining:
                        left = deadline - time.monotonic()
                        if left <= 0:
                            raise TimeoutError
                        self.connection.settimeout(min(read_timeout, left))
                        chunk = self.rfile.read1(min(65536, remaining))
                        if not chunk:
                            break
                        chunks.append(chunk)
                        remaining -= len(chunk)
                    self.connection.settimeout(read_timeout)
                except TimeoutError:
                    self.close_connection = True
                    return self._json(408, {"error": "upload timed out"})
                except OSError:
                    # The peer can disconnect mid-upload; release admission
                    # without logging a traceback or retaining partial audio.
                    self.close_connection = True
                    return
                if remaining:
                    return self._json(400, {"error": "incomplete body"})
                body = b"".join(chunks)
                del chunks
                content_type = self.headers.get("Content-Type", "")
                if content_type.lower().startswith("multipart/form-data"):
                    file = parse_multipart(content_type, body).get("file")
                    if not file or not file[1]:
                        return self._json(400, {"error": "missing file"})
                    filename, audio = file
                else:
                    filename, audio = "audio", body
                suffix = os.path.splitext(filename)[1][:8]
                if not re.fullmatch(r"\.[a-zA-Z0-9]{1,7}", suffix):
                    suffix = ".audio"
                fd, path = tempfile.mkstemp(suffix=suffix)
                try:
                    with os.fdopen(fd, "wb") as out:
                        out.write(audio)
                    try:
                        result = transcribe(path)
                    except AudioTooLong:
                        return self._json(413, {"error": "audio duration exceeds limit", "code": "audio_too_long"})
                    except Exception as error:
                        # Do not tell the caller their recording is corrupt
                        # when the model/GPU failed internally. PyAV decoder
                        # errors and input ValueErrors are bad audio; other
                        # exceptions are service failures. Never log details.
                        sys.stderr.write(f"stt decode failed: {type(error).__name__}\n")
                        if isinstance(error, (ValueError, EOFError)) or type(error).__module__.startswith("av."):
                            return self._json(422, {"error": "could not decode audio", "code": "invalid_audio"})
                        return self._json(500, {"error": "transcription unavailable", "code": "model_failed"})
                finally:
                    try:
                        os.remove(path)  # the recording is not kept
                    except OSError:
                        pass
                if not result.get("text"):
                    return self._json(422, {"error": "no speech recognised", "code": "no_speech"})
                self._json(200, result)
            finally:
                admitted.release()

    return Handler


def main():
    name = os.environ.get("STT_MODEL", "medium")
    device = os.environ.get("STT_DEVICE", "auto")
    compute = os.environ.get("STT_COMPUTE") or None
    host = os.environ.get("STT_HOST", "127.0.0.1")
    port = int(os.environ.get("STT_PORT", "8765"))
    token = os.environ.get("STT_TOKEN") or None
    validate_token(token)  # fail before loading a large model if configuration is invalid
    max_bytes = int(float(os.environ.get("STT_MAX_MB", "25")) * 1024 * 1024)
    max_pending = int(os.environ.get("STT_MAX_PENDING", "2"))
    max_connections = int(os.environ.get("STT_MAX_CONNECTIONS", "16"))
    read_timeout = float(os.environ.get("STT_READ_TIMEOUT", "30"))
    upload_timeout = float(os.environ.get("STT_UPLOAD_TIMEOUT", "120"))
    # Five seconds of headroom for the browser's nominal 3-minute recorder.
    max_seconds = float(os.environ.get("STT_MAX_SECONDS", "185"))
    if min(max_bytes, max_pending, max_connections, read_timeout, upload_timeout, max_seconds) <= 0 or not all(math.isfinite(n) for n in (read_timeout, upload_timeout, max_seconds)):
        raise ValueError("STT limits must be positive and finite")
    print(f"loading whisper-{name} …", flush=True)
    transcribe = Transcriber(name, device, compute, max_seconds)
    handler = make_handler(transcribe, token, max_bytes, max_pending, read_timeout, upload_timeout)
    print(f"ready: whisper-{name} on {transcribe.device} ({transcribe.compute}) at http://{host}:{port}", flush=True)
    BoundedHTTPServer((host, port), handler, max_connections).serve_forever()


if __name__ == "__main__":
    main()
