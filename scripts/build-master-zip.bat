@echo off
REM Build master zip for GitHub — Windows version
REM Run from repo root or double-click
REM Requires PowerShell or 7-Zip or built-in tar (Windows 10+)

set REPO_DIR=%~dp0..
set OUTPUT_DIR=%USERPROFILE%\Desktop
set ZIP_NAME=AI-ASSistant-Master-Github-Repo.zip

echo Building master zip from %REPO_DIR%
echo Output to %OUTPUT_DIR%\%ZIP_NAME%

cd /d "%REPO_DIR%\.."

REM Use PowerShell Compress-Archive excluding node_modules etc
REM First create temp copy without heavy dirs

set TEMP_DIR=%TEMP%\AI-ASSistant-Master-Temp
rmdir /s /q "%TEMP_DIR%" 2>nul
mkdir "%TEMP_DIR%"
xcopy /E /I /Q "AI-ASSistant-Github-Repo" "%TEMP_DIR%\AI-ASSistant-Github-Repo"

REM Remove heavy dirs from temp
rmdir /s /q "%TEMP_DIR%\AI-ASSistant-Github-Repo\apps\01_claude-exact-pixel-clone\node_modules" 2>nul
rmdir /s /q "%TEMP_DIR%\AI-ASSistant-Github-Repo\apps\02_electron-claude-clone-v6\node_modules" 2>nul
rmdir /s /q "%TEMP_DIR%\AI-ASSistant-Github-Repo\apps\01_claude-exact-pixel-clone\dist" 2>nul
rmdir /s /q "%TEMP_DIR%\AI-ASSistant-Github-Repo\apps\02_electron-claude-clone-v6\dist" 2>nul
rmdir /s /q "%TEMP_DIR%\AI-ASSistant-Github-Repo\archive_zips" 2>nul
rmdir /s /q "%TEMP_DIR%\AI-ASSistant-Github-Repo\.git" 2>nul

REM Create zip via PowerShell
powershell -Command "Compress-Archive -Path '%TEMP_DIR%\AI-ASSistant-Github-Repo' -DestinationPath '%OUTPUT_DIR%\%ZIP_NAME%' -Force"

echo Zip created at %OUTPUT_DIR%\%ZIP_NAME%
dir "%OUTPUT_DIR%\%ZIP_NAME%"

REM Cleanup temp
rmdir /s /q "%TEMP_DIR%" 2>nul

pause
