#!/usr/bin/env python3
"""
Brain pre-flight checker — verifies all dependencies, files, and config.
Run after installation to confirm everything is set up correctly.
"""
import pathlib, subprocess, sys

HOME = pathlib.Path(r"C:\Users\Nishad Islam Utso")
HERMES = HOME / "AppData" / "Local" / "hermes"
VAULT = HOME / "Documents" / "Hermes" / "Memory_OB"

def check(desc, condition, detail=""):
    status = "OK" if condition else "FAIL"
    print(f"  [{status}] {desc}" + (f" — {detail}" if detail else ""))
    return condition

def main():
    print("=== Brain Pre-flight Check ===\n")

    all_ok = True

    # 1. Python packages
    print("1. Python dependencies")
    for pkg in ['fastapi', 'uvicorn', 'yaml']:
        try:
            __import__(pkg)
            all_ok &= check(f"  {pkg}", True)
        except ImportError:
            all_ok &= check(f"  {pkg}", False, "pip install " + pkg)

    # 2. Plugin files
    print("\n2. Plugin files")
    files = [
        HERMES / "desktop-plugins" / "brain" / "plugin.js",
        HERMES / "plugins" / "brain" / "dashboard" / "manifest.json",
        HERMES / "plugins" / "brain" / "dashboard" / "plugin_api.py",
    ]
    for f in files:
        all_ok &= check(f"  {f.name}", f.exists(), str(f))

    # 3. Skills
    print("\n3. Skills")
    skills = [
        HERMES / "skills" / "brain" / "SKILL.md",
        HERMES / "skills" / "brain" / "memory-full-recall" / "SKILL.md",
        HERMES / "skills" / "brain" / "anonymous-mode" / "SKILL.md",
    ]
    for s in skills:
        all_ok &= check(f"  {s.parent.name}", s.exists(), str(s))

    # 4. Vault
    print("\n4. Vault")
    all_ok &= check("  vault exists", VAULT.exists(), str(VAULT))
    all_ok &= check("  .brain/index.json", (VAULT / ".brain" / "index.json").exists())
    all_ok &= check("  03 Memory/", (VAULT / "03 Memory").exists())
    all_ok &= check("  06 Review/proposals/", (VAULT / "06 Review" / "proposals").exists())

    # 5. Config
    print("\n5. Config")
    config = HERMES / "config.yaml"
    all_ok &= check("  config.yaml", config.exists(), str(config))
    if config.exists():
        text = config.read_text(encoding='utf-8')
        all_ok &= check("  brain in plugins.enabled", 'brain' in text and 'enabled:' in text)
        all_ok &= check("  memory_enabled: false", 'memory_enabled: false' in text)
        all_ok &= check("  user_profile_enabled: false", 'user_profile_enabled: false' in text)
        all_ok &= check("  nudge_interval: 0", 'nudge_interval: 0' in text)
        all_ok &= check("  memory removed from cli", 'memory,' not in text.split('cli:')[-1].split('\n')[0] if 'cli:' in text else True)

    # 6. Syntax checks
    print("\n6. Syntax checks")
    plugin = HERMES / "desktop-plugins" / "brain" / "plugin.js"
    if plugin.exists():
        r = subprocess.run(["node", "--check", str(plugin)], capture_output=True, text=True)
        all_ok &= check("  plugin.js syntax", r.returncode == 0, r.stderr.strip() or "OK")

    backend = HERMES / "plugins" / "brain" / "dashboard" / "plugin_api.py"
    if backend.exists():
        r = subprocess.run(["python", "-m", "py_compile", str(backend)], capture_output=True, text=True)
        all_ok &= check("  plugin_api.py syntax", r.returncode == 0, r.stderr.strip() or "OK")

    # Summary
    print("\n" + "=" * 40)
    if all_ok:
        print("ALL CHECKS PASSED — Brain is ready to use")
        print("Restart Hermes to load the plugin")
    else:
        print("SOME CHECKS FAILED — review the output above")
        sys.exit(1)

if __name__ == "__main__":
    main()
