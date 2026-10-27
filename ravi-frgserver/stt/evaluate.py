"""Measures speech-to-text accuracy on Persian recordings with known transcripts.

Put pairs in a folder:  clip01.wav + clip01.txt, clip02.m4a + clip02.txt, …
(any audio format the model can read; the .txt holds what was actually said).

    python evaluate.py ./samples                      # uses the running server
    python evaluate.py ./samples --url http://127.0.0.1:8765

Reports word error rate (WER) and character error rate (CER) per clip and in
total. Arabic/Persian letter variants and digit shapes are folded; a half-space
and a regular space are equivalent. Dropping the space entirely or writing a
number as words instead of digits can still increase WER. Failed requests are
counted as empty in end-to-end WER and reported separately from successful-only
WER, so service outages are not confused with recognition quality.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys
import time
import unicodedata
import urllib.request
import uuid

AUDIO = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".flac", ".mp4", ".opus"}
_FOLD = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "ة": "ه", "أ": "ا", "إ": "ا", "آ": "ا", "ؤ": "و", "ئ": "ی",
                       "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
                       "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"})


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).translate(_FOLD)
    text = re.sub(r"[ً-ٰٟـ]", "", text)          # harakat, tatweel
    text = text.replace("‌", " ").replace("‏", "").replace("‎", "")
    text = re.sub(r"[^\w\s]", " ", text)                               # punctuation
    return re.sub(r"\s+", " ", text).strip().lower()


def edit_distance(a: list, b: list) -> int:
    previous = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        current = [i]
        for j, y in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (x != y)))
        previous = current
    return previous[-1]


def error_rates(reference: str, hypothesis: str) -> tuple[int, int, int, int]:
    """(word errors, reference words, character errors, reference characters)."""
    ref, hyp = normalise(reference), normalise(hypothesis)
    rw, hw = ref.split(), hyp.split()
    rc, hc = list(ref.replace(" ", "")), list(hyp.replace(" ", ""))
    return edit_distance(rw, hw), len(rw), edit_distance(rc, hc), len(rc)


def transcribe_via(url: str, path: pathlib.Path, token: str | None) -> dict:
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\n"
            f"Content-Type: application/octet-stream\r\n\r\n").encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(url.rstrip("/") + "/transcribe", data=body, method="POST",
                                     headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    if token:
        request.add_header("X-STT-Token", token)
    with urllib.request.urlopen(request, timeout=600) as response:
        return json.loads(response.read().decode("utf-8"))


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    parser.add_argument("--token", default=os.environ.get("STT_TOKEN"), help="speech token (or set STT_TOKEN in the environment)")
    parser.add_argument("--json", default=None, help="also write the full results here")
    args = parser.parse_args(argv)

    clips = sorted(p for p in pathlib.Path(args.folder).iterdir() if p.suffix.lower() in AUDIO and p.with_suffix(".txt").exists())
    if not clips:
        sys.exit("no audio files with a matching .txt transcript in that folder")

    totals = [0, 0, 0, 0]
    successful_totals = [0, 0, 0, 0]
    audio_seconds = compute_seconds = 0.0
    rows = []
    for clip in clips:
        reference = clip.with_suffix(".txt").read_text(encoding="utf-8").strip()
        started = time.perf_counter()
        try:
            result = transcribe_via(args.url, clip, args.token)
            hypothesis = result.get("text", "")
            if not isinstance(hypothesis, str) or not hypothesis.strip():
                raise ValueError("empty transcription")
            succeeded = True
        except Exception as error:
            result, hypothesis, succeeded = {"error": str(error)}, "", False
        elapsed = time.perf_counter() - started
        we, rw, ce, rc = error_rates(reference, hypothesis)
        for i, v in enumerate((we, rw, ce, rc)):
            totals[i] += v
            if succeeded:
                successful_totals[i] += v
        if succeeded:
            audio_seconds += float(result.get("duration") or 0)
            compute_seconds += elapsed
        rows.append({"clip": clip.name, "ok": succeeded, "error": result.get("error", ""),
                     "wer": we / max(rw, 1), "cer": ce / max(rc, 1),
                     "reference": reference, "hypothesis": hypothesis, "seconds": round(elapsed, 2)})
        print(f"{clip.name:28s}  WER {we / max(rw, 1):6.1%}  CER {ce / max(rc, 1):6.1%}  {elapsed:5.1f}s" + ("  FAILED" if not succeeded else ""))

    wer, cer = totals[0] / max(totals[1], 1), totals[2] / max(totals[3], 1)
    ok_count = sum(row["ok"] for row in rows)
    success_wer = successful_totals[0] / successful_totals[1] if successful_totals[1] else None
    success_cer = successful_totals[2] / successful_totals[3] if successful_totals[3] else None
    print("-" * 64)
    print(f"{len(clips)} clips, {ok_count} successful, {len(clips) - ok_count} failed")
    print(f"End-to-end (failed clips count as empty): WER {wer:.1%}, CER {cer:.1%}")
    if success_wer is not None and success_cer is not None:
        print(f"Successful clips only: WER {success_wer:.1%}, CER {success_cer:.1%}")
    if audio_seconds:
        print(f"Successful clips: real-time factor {compute_seconds / audio_seconds:.2f} (below 1 is faster than speech)")
    if args.json:
        pathlib.Path(args.json).write_text(json.dumps({"wer": wer, "cer": cer, "success_wer": success_wer,
            "success_cer": success_cer, "successful": ok_count, "failed": len(clips) - ok_count,
            "clips": rows}, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
