@echo off
echo Checking if Ollama already running...
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo [OK] Ollama already running on 11434, using existing
  echo Model qwen2.5:3b is ready
  ollama list | findstr /i "qwen2.5"
  pause
  exit /b 0
)
echo Starting Ollama serve...
ollama serve
pause