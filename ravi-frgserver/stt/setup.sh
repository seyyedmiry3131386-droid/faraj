#!/bin/sh
# One-time setup of the self-hosted speech model on Linux or macOS.
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
MODEL="${STT_MODEL:-medium}"
echo "Downloading whisper-$MODEL ..."
STT_MODEL="$MODEL" python -c "import os; from faster_whisper import WhisperModel; WhisperModel(os.environ['STT_MODEL'], device='cpu', compute_type='int8'); print('model ready')"
echo "Done. Start with:  . stt/.venv/bin/activate && python stt/server.py"
