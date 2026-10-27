"""Measures several Whisper sizes on the same Persian recordings, side by side.

    python compare.py samples                               # medium, large-v3-turbo, large-v3
    python compare.py samples --models small medium large-v3
    python compare.py samples --limit 30                    # quicker first look

Each model is loaded in turn (no server needed), run on every clip, and scored
with the same Persian normalisation as evaluate.py. Prints WER, CER and speed
per model, and writes the full per-clip results to compare-results.json so
individual mistakes can be read, not just averaged.

Parameter counts, for reference: small 244M, medium 769M, large-v3-turbo 809M,
large-v3 1.55B. The first run of each downloads it once.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

from evaluate import AUDIO, error_rates
from server import Transcriber

PARAMS = {"tiny": "39M", "base": "74M", "small": "244M", "medium": "769M",
          "large-v3-turbo": "809M", "turbo": "809M", "large-v2": "1.55B", "large-v3": "1.55B"}


def clips_in(folder: pathlib.Path, limit: int | None):
    found = sorted(p for p in folder.iterdir() if p.suffix.lower() in AUDIO and p.with_suffix(".txt").exists())
    return found[:limit] if limit else found


def measure(name: str, clips, device: str, compute: str | None, load=Transcriber):
    started = time.perf_counter()
    model = load(name, device, compute)
    loaded = time.perf_counter() - started
    totals, audio_s, compute_s, rows = [0, 0, 0, 0], 0.0, 0.0, []
    for clip in clips:
        reference = clip.with_suffix(".txt").read_text(encoding="utf-8").strip()
        t0 = time.perf_counter()
        try:
            out = model(str(clip))
            hypothesis = out.get("text", "")
            audio_s += float(out.get("duration") or 0)
        except Exception as error:  # a clip the decoder cannot read counts as all-wrong
            out, hypothesis = {"error": type(error).__name__}, ""
        compute_s += time.perf_counter() - t0
        we, rw, ce, rc = error_rates(reference, hypothesis)
        for i, v in enumerate((we, rw, ce, rc)):
            totals[i] += v
        rows.append({"clip": clip.name, "wer": we / max(rw, 1), "reference": reference, "hypothesis": hypothesis})
    return {
        "model": name, "params": PARAMS.get(name, "?"), "clips": len(clips),
        "wer": totals[0] / max(totals[1], 1), "cer": totals[2] / max(totals[3], 1),
        "rtf": (compute_s / audio_s) if audio_s else None, "load_seconds": round(loaded, 1), "rows": rows,
    }


def main(argv=None, load=Transcriber):
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--models", nargs="+", default=["medium", "large-v3-turbo", "large-v3"])
    parser.add_argument("--device", default="auto")
    parser.add_argument("--compute", default=None)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--out", default="compare-results.json")
    args = parser.parse_args(argv)

    clips = clips_in(pathlib.Path(args.folder), args.limit)
    if not clips:
        sys.exit("no audio files with a matching .txt transcript in that folder")
    results = []
    for name in args.models:
        print(f"… whisper-{name} on {len(clips)} clips", flush=True)
        results.append(measure(name, clips, args.device, args.compute, load))

    print()
    print(f"{'model':18s} {'params':>7s} {'WER':>7s} {'CER':>7s} {'speed':>9s}")
    for r in results:
        speed = f"{r['rtf']:.2f}×" if r["rtf"] else "—"
        print(f"{r['model']:18s} {r['params']:>7s} {r['wer']:7.1%} {r['cer']:7.1%} {speed:>9s}")
    print("\nspeed = seconds of computing per second of audio; below 1 is faster than speech.")
    pathlib.Path(args.out).write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"per-clip results: {args.out}")
    return results


if __name__ == "__main__":
    main()
