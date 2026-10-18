@echo off
title AI ASSistant - service check
echo ============================================================
echo   Checking the three things the app needs
echo ============================================================
echo.

echo --- Ollama 127.0.0.1:11434 ---
curl -s -m 3 http://127.0.0.1:11434/api/tags >nul 2>&1
if errorlevel 1 (echo   OFFLINE - run "ollama serve") else (echo   OK)
echo.

echo --- Models ---
where ollama >nul 2>&1
if errorlevel 1 (echo   ollama.exe not in PATH) else (ollama list)
echo.

echo --- Vault API 127.0.0.1:8765 ---
curl -s -m 3 http://127.0.0.1:8765/status
if errorlevel 1 echo   OFFLINE - run "node server\vault-api.cjs"
echo.

echo --- Node ---
node -v
npm -v
echo.
pause
