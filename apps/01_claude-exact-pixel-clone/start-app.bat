@echo off
setlocal enabledelayedexpansion
title AI ASSistant - Exact Claude
cd /d "%~dp0"

echo ============================================================
echo   AI ASSistant  -  exact Claude clone, local, no cloud
echo   Model: qwen2.5:3b (already on this machine, no download)
echo ============================================================
echo.

REM ── 1. Is Ollama installed? ──────────────────────────────────────
where ollama >nul 2>&1
if errorlevel 1 (
  echo [X] Ollama is not in PATH.
  echo     Install it from https://ollama.com/download, then run this again.
  echo.
  pause
  exit /b 1
)

REM ── 2. Let the browser talk to Ollama ────────────────────────────
REM The Vite dev server proxies /api/ollama so this is normally not needed,
REM but set it anyway so the direct connection works too.
setx OLLAMA_ORIGINS "*" >nul 2>&1

REM ── 3. Start Ollama ONLY if it is not already running ────────────
netstat -ano | findstr "LISTENING" | findstr ":11434" >nul 2>&1
if errorlevel 1 (
  echo [..] Ollama not running - starting "ollama serve" in its own window...
  start "Ollama" cmd /k "ollama serve"
  echo [..] waiting for Ollama to come up
  timeout /t 6 >nul
) else (
  echo [ok] Ollama is already running on 127.0.0.1:11434
)

REM ── 4. Is the model there? ───────────────────────────────────────
ollama list | findstr /i "qwen2.5:3b" >nul
if errorlevel 1 (
  echo [!] qwen2.5:3b is not pulled on this machine yet.
  echo     Everything else in this app is already local - this is the only
  echo     download, about 2 GB. You can skip it and pull it later with:
  echo         ollama pull qwen2.5:3b
  choice /c YN /n /m "     Pull qwen2.5:3b now? [Y/N] "
  if not errorlevel 2 (
    ollama pull qwen2.5:3b
  ) else (
    echo [..] skipped - the app will start, replies will fail until a model exists
  )
) else (
  echo [ok] qwen2.5:3b present
)

REM ── 5. Node modules ──────────────────────────────────────────────
if not exist "node_modules" (
  echo [..] first run - installing dependencies (about a minute)
  call npm install
  echo [..] adding the Windows rollup binary Vite needs
  call npm install @rollup/rollup-win32-x64-msvc --save-optional
)

REM ── 6. Vault API on 8765 (only if nothing is listening) ──────────
netstat -ano | findstr "LISTENING" | findstr ":8765" >nul 2>&1
if errorlevel 1 (
  echo [..] starting the vault API on 127.0.0.1:8765
  start "Vault API" cmd /k "cd /d "%~dp0" && node server\vault-api.cjs"
  timeout /t 2 >nul
) else (
  echo [ok] vault API already running on 127.0.0.1:8765
)

REM ── 7. Open the app ──────────────────────────────────────────────
echo.
echo [ok] opening http://127.0.0.1:5173
start "" http://127.0.0.1:5173

REM ── 8. Dev server (stays in this window) ─────────────────────────
echo.
echo ============================================================
echo   Keep this window open. Close it to stop the app.
echo   Alt+T today   Ctrl+comma settings   Ctrl+B collapse sidebar
echo ============================================================
echo.
call npx vite --host 127.0.0.1 --port 5173

echo.
echo [stopped] press any key to close
pause >nul
