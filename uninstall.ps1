# Memory_OB — remove it from Hermes (Windows).
#
#   Right-click > Run with PowerShell, or:
#   powershell -ExecutionPolicy Bypass -File uninstall.ps1
#   powershell -ExecutionPolicy Bypass -File uninstall.ps1 -DeleteData
#
# Your memories are KEPT unless you pass -DeleteData. Either way a backup zip is
# made first, next to the Memory_OB memories folder.
#
# It takes out the startup item and nightly task, switches the plugin off in
# Hermes through Hermes's own command, and removes the files the installer copied.

[CmdletBinding()]
param(
    [switch]$DeleteData,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$uninstaller = Join-Path $scriptDir "host\uninstall.py"
if (-not (Test-Path $uninstaller)) {
    Write-Host "host\uninstall.py not found next to this script." -ForegroundColor Red
    exit 1
}
$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) {
    Write-Host "python not found on PATH." -ForegroundColor Red
    exit 1
}

if (-not $Yes) {
    if ($DeleteData) {
        Write-Host "This removes Memory_OB from Hermes AND deletes your memories folder." -ForegroundColor Yellow
        Write-Host "A backup zip is made first and kept beside it."
        $answer = Read-Host "Type DELETE to go ahead"
        if ($answer -ne "DELETE") { Write-Host "Nothing was changed."; exit 0 }
    } else {
        $answer = Read-Host "Remove Memory_OB from Hermes? Your memories are kept. (y/N)"
        if ($answer -notmatch '^(y|yes)$') { Write-Host "Nothing was changed."; exit 0 }
    }
}

$argsList = @($uninstaller)
if ($DeleteData) { $argsList += "--delete-data" }
& $python @argsList
exit $LASTEXITCODE
