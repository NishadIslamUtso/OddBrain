@echo off
echo === Starting Vault API at 127.0.0.1:8765 ===
cd /d %~dp0
echo Using vault-api.cjs (CommonJS) to avoid ESM error
node server\vault-api.cjs
pause