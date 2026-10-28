@echo off
rem One-time setup of the self-hosted speech model on Windows.
rem Needs Python 3.10+ from python.org ("Add python.exe to PATH" ticked).
rem The first run downloads the model (medium: about 1.5 GB). After that it
rem works with no internet at all.
cd /d "%~dp0"
python -m venv .venv || goto :error
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt || goto :error
if "%STT_MODEL%"=="" set STT_MODEL=medium
echo Downloading whisper-%STT_MODEL% ...
python -c "import os; from faster_whisper import WhisperModel; WhisperModel(os.environ['STT_MODEL'], device='cpu', compute_type='int8'); print('model ready')" || goto :error
echo.
echo Done. Start the speech server with:  stt\start-windows.bat
exit /b 0
:error
echo Setup failed. Check that Python 3.10 or newer is installed and on PATH.
exit /b 1
