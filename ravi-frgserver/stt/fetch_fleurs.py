"""Downloads Persian test recordings with human transcripts, for evaluate.py.

FLEURS (Google, CC-BY 4.0) has read Persian speech with reference text. This
saves N clips of its Persian test split as clipNNN.wav + clipNNN.txt pairs.

    pip install datasets soundfile
    python fetch_fleurs.py ./samples --count 100

These are read sentences in a quiet room. Your users will be phoning in from
the street; measure on some of your own recordings too before trusting a number.
"""
import argparse
import pathlib

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--count", type=int, default=100)
    args = parser.parse_args()
    from datasets import load_dataset
    import soundfile as sf
    out = pathlib.Path(args.folder)
    out.mkdir(parents=True, exist_ok=True)
    data = load_dataset("google/fleurs", "fa_ir", split="test", streaming=True, trust_remote_code=True)
    for i, row in enumerate(data):
        if i >= args.count:
            break
        audio = row["audio"]
        sf.write(out / f"clip{i:03d}.wav", audio["array"], audio["sampling_rate"])
        (out / f"clip{i:03d}.txt").write_text(row["transcription"], encoding="utf-8")
    print(f"saved {min(i + 1, args.count)} clips to {out}")

if __name__ == "__main__":
    main()
