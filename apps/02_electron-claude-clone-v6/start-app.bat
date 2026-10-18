@echo off
title AI ASSistant - Claude Clone + Vault Driver
echo ==========================================
echo  AI ASSistant - Starting Everything
echo  Using existing qwen2.5:3b directly
echo ==========================================
echo.

where ollama >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Ollama not found
  pause
  exit /b 1
)

echo [1/4] Checking qwen2.5:3b...
ollama list | findstr /i "qwen2.5:3b" >nul
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] qwen2.5:3b not found
  ollama list
  pause
  exit /b 1
)
echo [OK] qwen2.5:3b found

echo [2/4] Checking Ollama running...
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo [OK] Ollama already running
) else (
  start "Ollama Serve" cmd /k "ollama serve"
  timeout /t 3 >nul
)

echo [3/4] Checking node_modules...
cd /d %~dp0
if not exist "node_modules" (
  echo Installing...
  call npm install
) else (
  echo [OK] node_modules exists
)

if not exist "node_modules\.bin\vite.cmd" (
  if not exist "node_modules\vite\dist\node\cli.js" (
    echo [WARN] vite missing, installing rollup fix...
    call npm install @rollup/rollup-win32-x64-msvc --save-optional
  )
)

echo Starting Vault API at 127.0.0.1:8765...
start "Vault API" cmd /k "cd /d %~dp0 && node server\vault-api.cjs"
timeout /t 2 >nul

echo [4/4] Starting app at http://localhost:5173...
echo.
echo If you see rollup error on build, dev mode still works
echo App uses qwen2.5:3b directly via Ollama at 11434
echo.

call npx vite --host 127.0.0.1 --port 5173

pause