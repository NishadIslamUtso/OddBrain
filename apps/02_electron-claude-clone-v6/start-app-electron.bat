@echo off
title AI ASSistant Electron
echo ==========================================
echo  AI ASSistant Electron Desktop
echo  Using qwen2.5:3b directly
echo ==========================================
echo.

where ollama >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Ollama not found
  pause
  exit /b 1
)

ollama list | findstr /i "qwen2.5:3b" >nul
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] qwen2.5:3b not found
  ollama list
  pause
  exit /b 1
)

echo Checking Ollama already running...
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo [OK] Ollama already running
) else (
  echo Starting Ollama serve...
  start "Ollama Serve" cmd /k "ollama serve"
  timeout /t 3 >nul
)

echo Checking node_modules...
cd /d %~dp0
if not exist "node_modules" (
  echo Installing...
  call npm install --no-optional
)

echo Starting Vault API...
start "Vault API" cmd /k "cd /d %~dp0 && node server\vault-api.cjs"
timeout /t 2 >nul

echo Starting Electron...
call npx concurrently "node server/vault-api.cjs" "npx wait-on http://localhost:5173 && npx electron ."

pause