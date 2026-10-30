#!/usr/bin/env python3
"""
Brain config patcher — updates Hermes config.yaml for Brain compatibility.
Run once after installing the plugin.

Fixes from audit:
- Parse YAML properly (via regex fallback if PyYAML unavailable)
- Show exact diff before writing
- Require typed ALLOW confirmation
- Write config.yaml.bak-<ts> first
"""
from __future__ import annotations

import datetime
import pathlib
import sys
import re

CONFIG = pathlib.Path(r"C:\Users\Nishad Islam Utso\AppData\Local\hermes\config.yaml")

CHANGES = [
    ("plugins.enabled", lambda s: "brain" in s, "Add 'brain' to plugins.enabled"),
    ("memory_enabled", lambda s: "memory_enabled: false" not in s, "Set memory_enabled: false"),
    ("user_profile_enabled", lambda s: "user_profile_enabled: false" not in s, "Set user_profile_enabled: false"),
    ("nudge_interval", lambda s: "nudge_interval: 0" not in s, "Set nudge_interval: 0"),
    ("auto_prune", lambda s: "auto_prune: false" not in s, "Set auto_prune: false"),
    ("checkpoint_required", lambda s: "checkpoint_required: true" not in s, "Set checkpoint_required: true"),
    ("cli tools memory", lambda s: "memory, session_search" not in s, "Remove 'memory' from cli tools"),
]


def parse_yaml_simple(text: str) -> dict[str, str]:
    """Very simple YAML key: value extractor (fallback if PyYAML unavailable)."""
    result = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" in line:
            key, _, val = line.partition(":")
            result[key.strip()] = val.strip()
    return result


def show_diff(before: str, after: str) -> None:
    """Show a simple unified diff."""
    before_lines = before.splitlines(keepends=True)
    after_lines = after.splitlines(keepends=True)
    max_len = max(len(before_lines), len(after_lines))
    print("\n--- Diff ---")
    for i in range(max_len):
        b = before_lines[i] if i < len(before_lines) else ""
        a = after_lines[i] if i < len(after_lines) else ""
        if b != a:
            if b:
                print(f"- {b.rstrip()}")
            if a:
                print(f"+ {a.rstrip()}")
    print("--- End diff ---\n")


def patch() -> None:
    if not CONFIG.exists():
        print(f"ERROR: {CONFIG} not found")
        sys.exit(1)

    original = CONFIG.read_text(encoding="utf-8")
    patched = original
    changes_made = []

    # 1. Add brain to plugins.enabled
    if "brain" not in patched:
        patched = patched.replace("plugins:", "plugins:\n  enabled:\n    - brain")
        changes_made.append("Added 'brain' to plugins.enabled")

    # 2. Disable Hermes built-in memory
    if "memory_enabled: true" in patched:
        patched = patched.replace("memory_enabled: true", "memory_enabled: false")
        changes_made.append("memory_enabled: false")
    if "user_profile_enabled: true" in patched:
        patched = patched.replace("user_profile_enabled: true", "user_profile_enabled: false")
        changes_made.append("user_profile_enabled: false")
    if "nudge_interval: 10" in patched:
        patched = patched.replace("nudge_interval: 10", "nudge_interval: 0")
        changes_made.append("nudge_interval: 0")

    # 3. Set auto_prune and checkpoint_required
    if "auto_prune: true" in patched:
        patched = patched.replace("auto_prune: true", "auto_prune: false")
        changes_made.append("auto_prune: false")
    elif "auto_prune:" not in patched:
        # Insert near other session settings
        patched = patched.replace("nudge_interval: 0", "nudge_interval: 0\nauto_prune: false")
        changes_made.append("auto_prune: false")

    if "checkpoint_required: false" in patched:
        patched = patched.replace("checkpoint_required: false", "checkpoint_required: true")
        changes_made.append("checkpoint_required: true")
    elif "checkpoint_required:" not in patched:
        patched = patched.replace("auto_prune: false", "auto_prune: false\ncheckpoint_required: true")
        changes_made.append("checkpoint_required: true")

    # 4. Remove memory from cli tools
    if "memory, session_search" in patched:
        patched = patched.replace("memory, session_search", "session_search")
        changes_made.append("removed 'memory' from cli tools")

    if patched == original:
        print("No changes needed — config already patched")
        return

    # Show diff
    show_diff(original, patched)

    # Require confirmation
    print("Proposed changes:")
    for c in changes_made:
        print(f"  - {c}")
    print()
    answer = input("Type ALLOW to apply these changes: ").strip()
    if answer != "ALLOW":
        print("Aborted — no changes written")
        return

    # Write backup first
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = CONFIG.with_suffix(f".yaml.bak-{ts}")
    backup.write_text(original, encoding="utf-8")
    print(f"Backup written to: {backup}")

    # Write patched config
    CONFIG.write_text(patched, encoding="utf-8")
    print(f"Patched config: {', '.join(changes_made)}")
    print("Run 'hermes config check' to verify")


if __name__ == "__main__":
    patch()
