# Fix missing .ai and .gitignore dotfiles — PowerShell version
# Run this INSIDE the cloned AI-ASSistant folder
# You are in: Downloads\AI-ASSistant-Github-Complete-Testable\AI-ASSistant

Write-Host "Current dir: $PWD" -ForegroundColor Cyan

# Source is one level up: Downloads\AI-ASSistant-Github-Complete-Testable
$sourceRoot = ".."

# Check source exists
if (-not (Test-Path "$sourceRoot\.ai")) {
    Write-Host "Source .ai not found at $sourceRoot\.ai, trying visible mirror ai/" -ForegroundColor Yellow
    if (Test-Path "$sourceRoot\ai") {
        Write-Host "Found visible mirror at $sourceRoot\ai, copying to .ai" -ForegroundColor Green
        Copy-Item -Path "$sourceRoot\ai" -Destination ".ai" -Recurse -Force
        # Remove the README_VISIBLE_MIRROR.md if exists
        Remove-Item ".ai\README_VISIBLE_MIRROR.md" -ErrorAction SilentlyContinue
    } else {
        Write-Host "ERROR: Neither .ai nor ai found in $sourceRoot" -ForegroundColor Red
        Write-Host "Make sure you extracted Complete-Testable zip and cloned inside it"
        exit 1
    }
} else {
    Write-Host "Copying .ai from $sourceRoot\.ai" -ForegroundColor Green
    Copy-Item -Path "$sourceRoot\.ai" -Destination ".ai" -Recurse -Force
}

if (Test-Path "$sourceRoot\.gitignore") {
    Write-Host "Copying .gitignore" -ForegroundColor Green
    Copy-Item -Path "$sourceRoot\.gitignore" -Destination ".gitignore" -Force
} elseif (Test-Path "$sourceRoot\gitignore.txt") {
    Write-Host "Copying gitignore.txt to .gitignore" -ForegroundColor Yellow
    Copy-Item -Path "$sourceRoot\gitignore.txt" -Destination ".gitignore" -Force
}

if (Test-Path "$sourceRoot\vault\AI-Brain\.brain") {
    Write-Host "Copying .brain" -ForegroundColor Green
    Copy-Item -Path "$sourceRoot\vault\AI-Brain\.brain" -Destination "vault\AI-Brain\.brain" -Recurse -Force
} else {
    Write-Host "Creating .brain placeholder" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "vault\AI-Brain\.brain" -Force | Out-Null
    "rebuildable index.sqlite + cache, not source of truth" | Out-File "vault\AI-Brain\.brain\README.md" -Encoding utf8
}

Write-Host "`nVerifying..." -ForegroundColor Cyan
Get-ChildItem -Force | Where-Object { $_.Name -like ".*ai*" -or $_.Name -like "*gitignore*" } | Format-Table Name, Mode
Get-ChildItem -Path ".ai" -Force | Format-Table Name
Get-ChildItem -Path "vault\AI-Brain" -Force | Where-Object { $_.Name -like ".*brain*" } | Format-Table Name

Write-Host "`nNow run:" -ForegroundColor Cyan
Write-Host "git add .ai .gitignore vault/AI-Brain/.brain" -ForegroundColor White
Write-Host "git commit -m 'fix: add .ai and .gitignore dotfiles'" -ForegroundColor White
Write-Host "git push" -ForegroundColor White
