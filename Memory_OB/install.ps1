# Memory_OB — one-paste install for Windows.
#
#   irm <this-url>/install.ps1 | iex
#
# Or, from a downloaded release folder:
#
#   powershell -ExecutionPolicy Bypass -File install.ps1
#
# What it does, in order:
#   1. finds the engine (or unpacks the release zip beside this script);
#   2. runs host/install.py, which copies the plugin halves and skills into
#      the Hermes home and enables the plugin through the official CLI;
#   3. asks you to TYPE an ALLOW token (it is never written to a file in the
#      repo, never committed, and never shipped);
#   4. registers the nightly run with Task Scheduler;
#   5. takes a first backup.
#
# Nothing here edits Hermes's config.yaml by hand — the CLI does that.

[CmdletBinding()]
param(
    [string]$ReleaseZip = "",
    [string]$HermesHome = "",
    [switch]$NoSchedule,
    [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Write-Ok([string]$text)   { Write-Host "    $text" -ForegroundColor Green }

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- 1. locate the engine --------------------------------------------------
$engine = $null
$candidates = @(
    (Join-Path $scriptDir "Memory_OB"),
    (Join-Path $scriptDir ".."),
    (Join-Path $env:USERPROFILE "Documents\Hermes\Workspace\Memory_OB"),
    (Join-Path $env:USERPROFILE "Documents\Hermes\Memory_OB")
)
foreach ($c in $candidates) {
    if (Test-Path (Join-Path $c "memory_ob\__init__.py")) { $engine = Resolve-Path $c; break }
}

if (-not $engine -and $ReleaseZip -and (Test-Path $ReleaseZip)) {
    Write-Step "unpacking $ReleaseZip"
    $dest = Join-Path $env:TEMP ("memory-ob-release-" + [guid]::NewGuid().ToString("N"))
    Expand-Archive -Path $ReleaseZip -DestinationPath $dest -Force
    foreach ($c in @((Join-Path $dest "Memory_OB"), $dest)) {
        if (Test-Path (Join-Path $c "memory_ob\__init__.py")) { $engine = $c; break }
    }
}

if (-not $engine) {
    Write-Host "Memory_OB engine not found. Pass -ReleaseZip <path>." -ForegroundColor Red
    exit 1
}
Write-Ok "engine: $engine"

$hostDir = Join-Path $engine "host"
if (-not (Test-Path (Join-Path $hostDir "install.py"))) {
    Write-Host "host/install.py not found under $engine" -ForegroundColor Red
    exit 1
}

# --- 2. install into Hermes ------------------------------------------------
if ($HermesHome) { $env:HERMES_HOME = $HermesHome }

Write-Step "installing into Hermes"
$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) {
    Write-Host "python not found on PATH." -ForegroundColor Red
    exit 1
}
& $python (Join-Path $hostDir "install.py")
if ($LASTEXITCODE -ne 0) { Write-Host "install.py failed ($LASTEXITCODE)" -ForegroundColor Red; exit $LASTEXITCODE }

# --- 3. the typed ALLOW token ---------------------------------------------
# This IS the write token. It is typed here, stored in the vault's private
# .brain/token, never committed, never shipped, and the pages send it back on
# every write. Typing your own means the credential is yours, not ours.
Write-Step "ALLOW token"
$token = Read-Host -Prompt "Type an ALLOW token (press Enter to generate one)"
if ([string]::IsNullOrWhiteSpace($token)) {
    $token = -join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
    Write-Ok "generated: $token"
} else {
    Write-Ok "accepted the token you typed"
}
$brainDir = Join-Path $env:USERPROFILE "Documents\Hermes\Memory_OB\.brain"
New-Item -ItemType Directory -Force -Path $brainDir | Out-Null
Set-Content -Path (Join-Path $brainDir "token") -Value $token -NoNewline -Encoding ascii
Write-Ok "stored in $brainDir\token — this is what the pages send on every write"

# --- 4. nightly schedule ---------------------------------------------------
if (-not $NoSchedule) {
    Write-Step "registering the nightly run"
    & $python (Join-Path $hostDir "schedule.py")
    if ($LASTEXITCODE -ne 0) { Write-Host "schedule.py failed ($LASTEXITCODE)" -ForegroundColor Yellow }
}

# --- 5. first backup -------------------------------------------------------
if (-not $NoBackup) {
    Write-Step "taking a first backup"
    & $python (Join-Path $hostDir "backup.py")
    if ($LASTEXITCODE -ne 0) { Write-Host "backup.py failed ($LASTEXITCODE)" -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "Done. Restart Hermes Desktop (or reload the window) to load the shell." -ForegroundColor Green
Write-Host "Open Memory_OB from the sidebar, then check the Review tab." -ForegroundColor Green
