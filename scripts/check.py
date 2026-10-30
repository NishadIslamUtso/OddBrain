#!/usr/bin/env python3
"""
Brain pre-flight checker — verifies dependencies, files, config, and syntax.
Run after installing to confirm the plugin is ready.
"""
from __future__ import annotations

import pathlib
import sys

REQUIRED_FILES = [
    "desktop-plugins/brain/plugin.js",
    "plugins/brain/dashboard/plugin_api.py",
    "plugins/brain/dashboard/config.py",
    "plugins/brain/dashboard/manifest.json",
    "skills/brain/SKILL.md",
    "skills/brain/memory-full-recall/SKILL.md",
    "skills/brain/anonymous-mode/SKILL.md",
    "README.md",
    "docs/SETUP.md",
    "docs/ARCHITECTURE.md",
    "docs/CONFLICTS.md",
    "docs/DEPENDENCIES.md",
]

REQUIRED_FOLDERS = [
    "desktop-plugins/brain",
    "plugins/brain/dashboard",
    "skills/brain",
    "skills/brain/memory-full-recall",
    "skills/brain/anonymous-mode",
]

VAULT_FOLDERS = [
    "00 System", "01 Inbox", "02 Sources", "03 Memory",
    "04 Working Memory", "05 Knowledge", "06 Review",
    "06 Review/proposals", "07 Sharing Receipts", "08 Journal",
    "09 Activity & Undo", "10 People", "90 Archive",
]

BASE = pathlib.Path(__file__).resolve().parent.parent

errors = []
warnings = []

print("=== Brain Pre-flight Check ===\n")

# Check files
print("1. Required files:")
for f in REQUIRED_FILES:
    path = BASE / f
    if path.exists():
        print(f"  [OK] {f}")
    else:
        print(f"  [MISSING] {f}")
        errors.append(f"Missing file: {f}")

# Check folders
print("\n2. Required folders:")
for d in REQUIRED_FOLDERS:
    path = BASE / d
    if path.exists() and path.is_dir():
        print(f"  [OK] {d}/")
    else:
        print(f"  [MISSING] {d}/")
        errors.append(f"Missing folder: {d}/")

# Check Python syntax
print("\n3. Python syntax:")
plugin_api = BASE / "plugins/brain/dashboard/plugin_api.py"
if plugin_api.exists():
    try:
        compile(plugin_api.read_text(encoding="utf-8"), str(plugin_api), "exec")
        print("  [OK] plugin_api.py syntax valid")
    except SyntaxError as e:
        print(f"  [FAIL] plugin_api.py syntax error: {e}")
        errors.append(f"Syntax error in plugin_api.py: {e}")
else:
    print("  [SKIP] plugin_api.py not found")

# Check config.py
print("\n4. Config module:")
config_py = BASE / "plugins/brain/dashboard/config.py"
if config_py.exists():
    try:
        compile(config_py.read_text(encoding="utf-8"), str(config_py), "exec")
        print("  [OK] config.py syntax valid")
    except SyntaxError as e:
        print(f"  [FAIL] config.py syntax error: {e}")
        errors.append(f"Syntax error in config.py: {e}")
else:
    print("  [MISSING] config.py")

# Check JS syntax (basic)
print("\n5. JavaScript syntax (basic check):")
plugin_js = BASE / "desktop-plugins/brain/plugin.js"
if plugin_js.exists():
    text = plugin_js.read_text(encoding="utf-8")
    if "function BrainPage" in text and "ctx.rest" in text:
        print("  [OK] plugin.js contains expected exports")
    else:
        print("  [WARN] plugin.js may be missing expected exports")
        warnings.append("plugin.js missing expected exports")
else:
    print("  [SKIP] plugin.js not found")

# Check manifest
print("\n6. Plugin manifest:")
manifest = BASE / "plugins/brain/dashboard/manifest.json"
if manifest.exists():
    try:
        import json
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if "config" in data and "brain_path" in data.get("config", {}):
            print(f"  [OK] manifest.json has brain_path config")
        else:
            print("  [WARN] manifest.json missing brain_path config")
            warnings.append("manifest.json missing brain_path config")
    except Exception as e:
        print(f"  [FAIL] manifest.json invalid: {e}")
        errors.append(f"Invalid manifest.json: {e}")
else:
    print("  [MISSING] manifest.json")

# Check vault structure
print("\n7. Vault structure:")
vault_path = pathlib.Path(r"C:\Users\Nishad Islam Utso\Documents\Hermes\Memory_OB")
if vault_path.exists():
    print(f"  [OK] Vault exists at: {vault_path}")
    missing_folders = []
    for d in VAULT_FOLDERS:
        if not (vault_path / d).exists():
            missing_folders.append(d)
    if missing_folders:
        print(f"  [WARN] Missing vault folders: {', '.join(missing_folders)}")
        warnings.append(f"Missing vault folders: {', '.join(missing_folders)}")
    else:
        print("  [OK] All 12 vault folders present")
    
    # Check .brain/index.json
    index = vault_path / ".brain" / "index.json"
    if index.exists():
        print("  [OK] .brain/index.json exists")
    else:
        print("  [WARN] .brain/index.json missing (will be created on first run)")
else:
    print(f"  [MISSING] Vault not found at: {vault_path}")
    print("  Run init_vault.py to create it")
    errors.append(f"Vault not found at {vault_path}")

# Summary
print("\n=== Summary ===")
if errors:
    print(f"FAILED: {len(errors)} error(s), {len(warnings)} warning(s)")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
elif warnings:
    print(f"PASSED with warnings: {len(warnings)} warning(s)")
    for w in warnings:
        print(f"  - {w}")
    sys.exit(0)
else:
    print("ALL CHECKS PASSED")
    sys.exit(0)
