@echo off
echo === AI ASSistant - Checking Ollama + qwen2.5:3b ===
where ollama >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Ollama not found in PATH
  echo Install from https://ollama.com/
  pause
  exit /b 1
)
echo [OK] Ollama found
ollama list | findstr /i "qwen2.5:3b" >nul
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] qwen2.5:3b not found
  echo You said you have it, checking all models:
  ollama list
  echo.
  echo If missing, run: ollama pull qwen2.5:3b
  pause
  exit /b 1
)
echo [OK] qwen2.5:3b found
ollama list
echo.
echo === All good, ready to start app ===
pause