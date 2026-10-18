@echo off
title AI ASSistant - production build
cd /d "%~dp0"

echo Building the app into dist\ (no installer, just static files)
echo.

if not exist "node_modules" (
  echo [..] installing dependencies
  call npm install
)

echo [..] making sure the Windows rollup binary is present
call npm install @rollup/rollup-win32-x64-msvc --save-optional

echo [..] building
call npx vite build

if errorlevel 1 (
  echo.
  echo [X] build failed - scroll up for the error
) else (
  echo.
  echo [ok] built into dist\
  echo      Serve it with:  npx vite preview --host 127.0.0.1 --port 5173
  echo      Note: the /ollama proxy only exists in the dev server, so a static
  echo      build talks to Ollama directly and needs OLLAMA_ORIGINS set to "*".
)

echo.
pause
