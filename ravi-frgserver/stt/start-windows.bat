@echo off
rem Starts the speech server on http://127.0.0.1:8765
rem Leave this window open while the site is in use.
cd /d "%~dp0"
call .venv\Scripts\activate.bat
if "%STT_MODEL%"=="" set STT_MODEL=medium
python server.py
