@echo off
echo === AI ASSistant - Build for Windows ===
echo Using existing qwen2.5:3b
echo Fixing rollup optional dep bug for Node 24 on Windows
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Node.js not found
  pause
  exit /b 1
)
node -v

echo.
echo Cleaning for rollup bug (npm cli issue 4828)...
if exist "node_modules" rmdir /s /q "node_modules" 2>nul
if exist "package-lock.json" del /q "package-lock.json" 2>nul
timeout /t 2 >nul

echo Installing with optional deps included (needed for rollup)...
call npm install
if %ERRORLEVEL% NEQ 0 (
  echo [WARN] Install failed, trying force...
  call npm install --force
)

echo.
echo Installing rollup Windows binary explicitly (fixes MODULE_NOT_FOUND)...
call npm install @rollup/rollup-win32-x64-msvc --save-optional
if %ERRORLEVEL% NEQ 0 (
  echo [WARN] Rollup binary install failed, trying dev mode anyway
)

echo.
echo Trying build...
call npx vite build
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [INFO] Build failed due to rollup bug, but DEV MODE WILL STILL WORK
  echo This is known npm bug with Node 24 + rollup optional deps
  echo You can still run: start-app.bat  (uses vite dev, not build)
  echo.
  echo To fix build completely, you can:
  echo   1. Use Node.js 20 LTS instead of 24, or
  echo   2. Run: npm install --force
  echo.
) else (
  echo [OK] Build succeeded
)

echo.
echo === Done ===
echo For now use: start-app.bat  (dev mode at http://localhost:5173)
echo For Electron: start-app-electron.bat
echo.
pause