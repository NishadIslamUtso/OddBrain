#!/usr/bin/env python3
"""
Brain config patcher — updates Hermes config.yaml for Brain compatibility.
Run once after installing the plugin.
"""
import pathlib, sys

CONFIG = pathlib.Path(r"C:\Users\Nishad Islam Utso\AppData\Local\hermes\config.yaml")

def patch():
    if not CONFIG.exists():
        print(f"ERROR: {CONFIG} not found")
        sys.exit(1)

    src = CONFIG.read_text(encoding='utf-8')

    # 1. Add brain to plugins.enabled
    if 'brain' not in src:
        src = src.replace('plugins:', 'plugins:\n  enabled:\n    - brain')
        print("Added brain to plugins.enabled")

    # 2. Disable Hermes built-in memory
    changes = []
    if 'memory_enabled: true' in src:
        src = src.replace('memory_enabled: true', 'memory_enabled: false')
        changes.append('memory_enabled: false')
    if 'user_profile_enabled: true' in src:
        src = src.replace('user_profile_enabled: true', 'user_profile_enabled: false')
        changes.append('user_profile_enabled: false')
    if 'nudge_interval: 10' in src:
        src = src.replace('nudge_interval: 10', 'nudge_interval: 0')
        changes.append('nudge_interval: 0')

    # 3. Remove memory from cli tools
    if 'memory, session_search' in src:
        src = src.replace('memory, session_search', 'session_search')
        changes.append('removed memory from cli tools')

    CONFIG.write_text(src, encoding='utf-8')
    print(f"Patched config: {', '.join(changes) if changes else 'no changes needed'}")
    print(f"Run 'hermes config check' to verify")

if __name__ == "__main__":
    patch()
