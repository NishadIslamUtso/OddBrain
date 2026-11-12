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
#   3. creates the private write key the screens use (stored only inside your
#      memories folder, never shipped);
#   4. registers the nightly run with Task Scheduler;
#   5. takes a first backup.
#
# Nothing here edits Hermes's config.yaml by hand — the CLI does that.
# To remove it again, run uninstall.ps1.

[CmdletBinding()]
param(
    [string]$ReleaseZip = "",
    [string]$HermesHome = "",
    [string]$Token = "",
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
    $scriptDir,
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

# --- 1b. clear out files the older version had and this one no longer uses ---
$retired = @(
    "memory_ob\appearance.py", "memory_ob\consistency.py", "memory_ob\dream.py", "memory_ob\owner.py",
    "tests\test_appearance.py", "tests\test_owner.py"
)
foreach ($r in $retired) {
    $old = Join-Path $engine $r
    if (Test-Path $old) { Remove-Item $old -Force; Write-Ok "removed old file $r" }
}

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

# --- 3. the private write key -----------------------------------------------
# The screens send this key back on every change so nothing else on the computer
# can write to your memories. It is created here once and kept inside the
# memories folder (.brain\token); it is never shipped or committed.
Write-Step "private write key"
$keyScript = @"
import sys
sys.path.insert(0, r'$engine')
from memory_ob.auth import load_or_create
from memory_ob.config import Settings
p = Settings.resolve().token_path
if len(sys.argv) > 1 and sys.argv[1]:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(sys.argv[1], encoding='ascii')
else:
    load_or_create(p)
print(p)
"@
$tokenFile = & $python -c $keyScript $Token
if ($LASTEXITCODE -ne 0) { Write-Host "could not create the write key" -ForegroundColor Red; exit 1 }
Write-Ok "stored in $tokenFile"

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
Write-Host "Open Memory_OB from the sidebar and just start telling it things." -ForegroundColor Green
Write-Host "To remove it later: run uninstall.ps1 (your memories are kept)." -ForegroundColor Green
