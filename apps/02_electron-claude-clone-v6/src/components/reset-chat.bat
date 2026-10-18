@echo off
echo Clearing old chats that had Tic Tac Toe loop...
echo This will clear localStorage chat_history for http://localhost:5173
echo.
echo Close the app browser tab first
pause
echo.
echo Please manually clear: In Chrome at http://localhost:5173, press F12 -> Application -> Local Storage -> http://localhost:5173 -> Delete chat_history and current_chat_id
echo Or just open in Incognito / new port
echo.
echo Alternative: Run this in browser console at http://localhost:5173:
echo localStorage.clear(); location.reload();
echo.
pause