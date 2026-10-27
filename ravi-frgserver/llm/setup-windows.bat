@echo off
rem One-time setup of the self-hosted language model on Windows.
rem 1) Install Ollama first: https://ollama.com/download  (OllamaSetup.exe)
rem 2) Run this file. It downloads the model (qwen3:8b, about 5 GB) once and
rem    writes the two lines the site needs into .env.
rem After this, the model runs on this computer with no internet and no API key.
setlocal
cd /d "%~dp0\.."
if "%LLM_MODEL%"=="" set LLM_MODEL=qwen3:8b
where ollama >nul 2>nul || goto :noollama
echo Downloading %LLM_MODEL% (only the first time) ...
ollama pull %LLM_MODEL% || goto :error
echo Checking that the model answers ...
ollama run %LLM_MODEL% "/no_think Reply with the single word OK" || goto :error
if not exist .env type nul > .env
findstr /b /c:"LLM_MODEL=" .env >nul 2>nul || (
  echo.>> .env
  echo LLM_URL=http://127.0.0.1:11434>> .env
  echo LLM_MODEL=%LLM_MODEL%>> .env
)
echo.
echo Done. Start the site with:  npm run dev
echo Then open http://localhost:4173  - the model assists analysis; the application controls question order.
echo To measure the model on your computer:  node evaluation\llm-eval.mjs
exit /b 0
:noollama
echo Ollama is not installed. Download it from https://ollama.com/download , install it, then run this file again.
exit /b 1
:error
echo Setup failed. Is Ollama running (its icon near the clock)? Is there enough disk space (about 6 GB)?
exit /b 1
