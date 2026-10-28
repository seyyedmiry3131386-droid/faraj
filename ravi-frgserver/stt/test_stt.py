"""Tests for the speech service with the neural model stubbed out.

Everything except the model itself runs for real: the HTTP server, multipart
parsing, authentication, limits, cleanup of the uploaded audio, the Persian
normalisation and the WER arithmetic. The model is measured separately by
evaluate.py on real recordings.
    python -m unittest test_stt
"""
import importlib.util
import json
import os
import socket
import threading
import time
import unittest
import urllib.error
import urllib.request
import uuid
from http.server import ThreadingHTTPServer

import evaluate
import server


class StubModel:
    name = "stub"

    def __init__(self):
        self.paths = []

    def __call__(self, path):
        self.paths.append(path)
        with open(path, "rb") as f:
            data = f.read()
        if data == b"bad":
            raise ValueError("cannot decode")
        if data == b"long":
            raise server.AudioTooLong
        if data == b"broken-model":
            raise RuntimeError("internal model error")
        if data == b"silence":
            return {"text": "", "model": "stub", "duration": 1.0, "seconds": 0.01}
        # Arabic letterforms on purpose: the service must return Persian ones.
        return {"text": server.tidy("ديشب موتورم را بردند"), "model": "stub", "duration": 2.0, "seconds": 0.01}


def post(url, payload, filename="clip.webm", token=None, raw=False):
    if raw:
        body, ctype = payload, "application/octet-stream"
    else:
        boundary = uuid.uuid4().hex
        body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
                "Content-Type: audio/webm\r\n\r\n").encode() + payload + f"\r\n--{boundary}--\r\n".encode()
        ctype = f"multipart/form-data; boundary={boundary}"
    req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": ctype})
    if token:
        req.add_header("X-STT-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


class ServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = StubModel()
        cls.httpd = server.BoundedHTTPServer(("127.0.0.1", 0), server.make_handler(cls.model, "secret", 1024))
        cls.url = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def test_transcribes_an_upload_and_returns_persian_letters(self):
        status, body = post(self.url + "/transcribe", b"audio-bytes", token="secret")
        self.assertEqual(status, 200)
        self.assertEqual(body["text"], "دیشب موتورم را بردند")
        self.assertNotIn("ي", body["text"])

    def test_the_recording_is_not_kept_on_disk(self):
        post(self.url + "/transcribe", b"audio-bytes", token="secret")
        self.assertFalse(os.path.exists(self.model.paths[-1]))

    def test_the_file_extension_reaches_the_decoder(self):
        post(self.url + "/transcribe", b"audio-bytes", filename="voice.m4a", token="secret")
        self.assertTrue(self.model.paths[-1].endswith(".m4a"))

    def test_raw_audio_body_is_accepted_too(self):
        status, body = post(self.url + "/transcribe", b"audio-bytes", token="secret", raw=True)
        self.assertEqual(status, 200)

    def test_a_wrong_or_missing_token_is_refused(self):
        self.assertEqual(post(self.url + "/transcribe", b"x", token="wrong")[0], 401)
        self.assertEqual(post(self.url + "/transcribe", b"x")[0], 401)
        raw = raw_request(self.httpd, b'POST /transcribe HTTP/1.0\r\nX-STT-Token: \xff\r\nContent-Length: 1\r\n\r\nx')
        self.assertIn(b' 401 ', raw.split(b'\r\n', 1)[0])
        with self.assertRaises(ValueError):
            server.make_handler(self.model, 'رمز', 1024)

    def test_limits_and_bad_input(self):
        self.assertEqual(post(self.url + "/transcribe", b"x" * 2048, token="secret")[0], 413)
        status, bad = post(self.url + "/transcribe", b"bad", token="secret")
        self.assertEqual((status, bad['code']), (422, 'invalid_audio'))
        status, silence = post(self.url + "/transcribe", b"silence", token="secret")
        self.assertEqual((status, silence['code']), (422, 'no_speech'))
        status, failure = post(self.url + "/transcribe", b"broken-model", token="secret")
        self.assertEqual((status, failure['code']), (500, 'model_failed'))
        self.assertNotIn('internal model error', json.dumps(failure))
        status, long = post(self.url + "/transcribe", b"long", token="secret")
        self.assertEqual((status, long['code']), (413, 'audio_too_long'))
        # HTTP response can arrive just before the handler's finally cleanup.
        for _ in range(100):
            if not os.path.exists(self.model.paths[-1]):
                break
            time.sleep(.01)
        self.assertFalse(os.path.exists(self.model.paths[-1]))
        self.assertEqual(post(self.url + "/elsewhere", b"x", token="secret")[0], 404)

    def test_health(self):
        with urllib.request.urlopen(self.url + "/health", timeout=5) as r:
            self.assertTrue(json.loads(r.read())["ok"])

    def test_invalid_and_ambiguous_content_lengths_are_rejected(self):
        for headers in (
            b"Content-Length: nonsense\r\n",
            b"Content-Length: -1\r\n",
            b"Content-Length: " + b"9" * 5000 + b"\r\n",
            b"Content-Length: 1\r\nContent-Length: 5\r\n",
            b"Transfer-Encoding: chunked\r\nContent-Length: 1\r\n",
        ):
            with self.subTest(headers=headers[:60]):
                result = raw_request(self.httpd, b"POST /transcribe HTTP/1.0\r\nX-STT-Token: secret\r\n" + headers + b"\r\n")
                self.assertIn(b" 400 ", result.split(b"\r\n", 1)[0])
        missing = raw_request(self.httpd, b"POST /transcribe HTTP/1.0\r\nX-STT-Token: secret\r\n\r\n")
        self.assertIn(b" 411 ", missing.split(b"\r\n", 1)[0])
        short = raw_request(self.httpd, b"POST /transcribe HTTP/1.0\r\nX-STT-Token: secret\r\nContent-Length: 5\r\n\r\nx", shutdown=True)
        self.assertIn(b" 400 ", short.split(b"\r\n", 1)[0])


def raw_request(httpd, data, shutdown=False):
    with socket.create_connection(httpd.server_address, timeout=3) as conn:
        conn.settimeout(3)
        conn.sendall(data)
        if shutdown:
            conn.shutdown(socket.SHUT_WR)
        response = bytearray()
        while True:
            chunk = conn.recv(4096)
            if not chunk:
                return bytes(response)
            response.extend(chunk)


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.entered = threading.Event()
        self.release = threading.Event()
        self.paths = []

        def blocking(path):
            self.paths.append(path)
            self.entered.set()
            if not self.release.wait(5):
                raise RuntimeError('test model timed out')
            return {'text': 'متن', 'model': 'stub'}

        self.httpd = server.BoundedHTTPServer(('127.0.0.1', 0),
            server.make_handler(blocking, None, 1024, max_pending=1, read_timeout=.25, upload_timeout=.6),
            max_connections=4)
        self.url = f'http://127.0.0.1:{self.httpd.server_address[1]}'
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.release.set()
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=3)

    def test_saturation_is_fast_and_health_is_still_available(self):
        first = []
        thread = threading.Thread(target=lambda: first.append(post(self.url + '/transcribe', b'audio', raw=True)))
        thread.start()
        self.assertTrue(self.entered.wait(2))
        started = time.monotonic()
        status, body = post(self.url + '/transcribe', b'audio', raw=True)
        self.assertEqual(status, 503)
        self.assertEqual(body['error'], 'server busy')
        self.assertLess(time.monotonic() - started, 1)
        with urllib.request.urlopen(self.url + '/health', timeout=2) as response:
            self.assertEqual(response.status, 200)
        self.release.set()
        thread.join(timeout=3)
        self.assertEqual(first[0][0], 200)
        self.assertFalse(os.path.exists(self.paths[0]))
        self.assertEqual(post(self.url + '/transcribe', b'audio', raw=True)[0], 200)

    def test_stalled_upload_times_out_and_releases_the_slot(self):
        data = b'POST /transcribe HTTP/1.0\r\nContent-Length: 4\r\n\r\na'
        result = raw_request(self.httpd, data)
        self.assertIn(b' 408 ', result.split(b'\r\n', 1)[0])
        self.assertEqual(self.paths, [])
        self.release.set()
        self.assertEqual(post(self.url + '/transcribe', b'audio', raw=True)[0], 200)

    def test_total_upload_deadline_even_if_bytes_keep_arriving(self):
        with socket.create_connection(self.httpd.server_address, timeout=2) as conn:
            conn.settimeout(2)
            conn.sendall(b'POST /transcribe HTTP/1.0\r\nContent-Length: 50\r\n\r\n')
            for _ in range(8):
                try:
                    conn.sendall(b'a')
                except OSError:
                    break
                time.sleep(.1)
            response = conn.recv(2048)
        self.assertIn(b' 408 ', response.split(b'\r\n', 1)[0])
        self.assertEqual(self.paths, [])


class ConnectionLimitTests(unittest.TestCase):
    def test_incomplete_headers_cannot_create_unlimited_threads(self):
        httpd = server.BoundedHTTPServer(('127.0.0.1', 0),
            server.make_handler(StubModel(), None, 1024, read_timeout=.5), max_connections=1)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            with socket.create_connection(httpd.server_address, timeout=2) as slow:
                slow.sendall(b'GET /health HTTP/1.0\r\n')
                # Ensure the first connection was accepted before opening another.
                time.sleep(.05)
                with socket.create_connection(httpd.server_address, timeout=2) as excess:
                    excess.settimeout(2)
                    self.assertIn(b' 503 ', excess.recv(2048).split(b'\r\n', 1)[0])
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=3)


@unittest.skipUnless(importlib.util.find_spec('av') and importlib.util.find_spec('numpy'), 'install stt requirements for real decoder tests')
class BoundedDecodeTests(unittest.TestCase):
    def test_decoded_samples_are_bounded_before_inference(self):
        import tempfile
        import wave
        with tempfile.NamedTemporaryFile(suffix='.wav') as f:
            with wave.open(f.name, 'wb') as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(16000)
                audio.writeframes(b'\0' * (2 * 16000 * 2))
            self.assertEqual(len(server.decode_bounded(f.name, 2)), 32000)
            with self.assertRaises(server.AudioTooLong):
                server.decode_bounded(f.name, 1.9)


class MeasurementTests(unittest.TestCase):
    def test_local_model_path_is_not_exposed(self):
        self.assertEqual(server.model_label('medium'), 'whisper-medium')
        self.assertEqual(server.model_label('/private/models/whisper-small-int8'), 'whisper-small-int8')
        self.assertEqual(server.model_label(r'C:\private\models\medium'), 'whisper-medium')

    def test_spelling_variants_are_not_errors(self):
        # Arabic ي/ك, a half-space, harakat and Persian digits are the same words.
        self.assertEqual(evaluate.error_rates("ساعت ۱۱ در خیابان‌ کریمخان", "ساعت 11 در خيابان كريمخان")[0], 0)
        self.assertEqual(evaluate.error_rates("مِی‌رفتم", "می رفتم")[0], 0)
        # WER still distinguishes a completely joined word; CER ignores spaces.
        we, _, ce, _ = evaluate.error_rates("می‌روم", "میروم")
        self.assertGreater(we, 0)
        self.assertEqual(ce, 0)

    def test_wer_counts_substitutions_insertions_and_deletions(self):
        we, rw, _, _ = evaluate.error_rates("دیشب موتورم را بردند", "دیشب ماشینم را بردند")
        self.assertEqual((we, rw), (1, 4))
        we, rw, _, _ = evaluate.error_rates("دیشب موتورم را بردند", "دیشب موتورم را")
        self.assertEqual((we, rw), (1, 4))
        we, rw, _, _ = evaluate.error_rates("موتورم را بردند", "دیشب موتورم را بردند")
        self.assertEqual((we, rw), (1, 3))

    def test_cer_is_finer_than_wer(self):
        we, rw, ce, rc = evaluate.error_rates("بردند", "بردن")
        self.assertEqual(we / rw, 1.0)
        self.assertLess(ce / rc, 0.25)

    def test_evaluation_distinguishes_service_failures_from_success_only_wer(self):
        import pathlib, tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            for name in ('a', 'b'):
                (root / (name + '.wav')).write_bytes(b'x')
                (root / (name + '.txt')).write_text('دو کلمه', encoding='utf8')
            with patch.object(evaluate, 'transcribe_via', side_effect=[{'text': 'دو کلمه', 'duration': 1}, OSError('offline')]):
                evaluate.main([folder, '--json', str(root / 'result.json')])
            result = json.loads((root / 'result.json').read_text(encoding='utf8'))
            self.assertEqual((result['successful'], result['failed']), (1, 1))
            self.assertEqual(result['wer'], .5)
            self.assertEqual(result['success_wer'], 0)
            self.assertFalse(result['clips'][1]['ok'])
            self.assertEqual(result['clips'][1]['error'], 'offline')


if __name__ == "__main__":
    unittest.main()


class CompareTests(unittest.TestCase):
    """The comparison runner, with the models replaced by fakes of known quality."""

    def test_models_are_ranked_by_what_they_get_wrong(self):
        import pathlib, tempfile, compare
        folder = pathlib.Path(tempfile.mkdtemp())
        refs = ["دیشب موتورم را بردند", "در خیابان بهار دعوا شد"]
        for i, text in enumerate(refs):
            (folder / f"c{i}.wav").write_bytes(b"x")
            (folder / f"c{i}.txt").write_text(text, encoding="utf-8")

        class Fake:
            def __init__(self, name, device, compute):
                self.name = name
            def __call__(self, path):
                ref = pathlib.Path(path).with_suffix(".txt").read_text(encoding="utf-8")
                # «big» is perfect; «small» gets one word wrong in every clip
                text = ref if self.name == "big" else ref.replace(ref.split()[0], "غلط", 1)
                return {"text": text, "duration": 2.0}

        out = compare.main([str(folder), "--models", "small", "big", "--out", str(folder / "r.json")], load=Fake)
        by = {r["model"]: r for r in out}
        self.assertEqual(by["big"]["wer"], 0.0)
        self.assertAlmostEqual(by["small"]["wer"], 2 / 9)   # one wrong word in each clip: 4 + 5 reference words
        self.assertTrue((folder / "r.json").exists())
