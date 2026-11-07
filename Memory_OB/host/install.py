#!/usr/bin/env python3
"""Install the Memory_OB host shell into Hermes Desktop.

Copies the two plugin halves into the Hermes home, then enables the plugin
through the official CLI (never by editing config.yaml by hand).

    python install.py            # install + enable
    python install.py --no-enable

After installing, restart Hermes Desktop (or reload the window) so the
desktop plugin is picked up.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent


def hermes_home() -> Path:
    env = os.environ.get("HERMES_HOME")
    if env:
        return Path(env)
    local = os.environ.get("LOCALAPPDATA")
    if local:
        return Path(local) / "hermes"
    return Path.home() / "AppData" / "Local" / "hermes"


def _copy_tree(src: Path, dst: Path, *, remove_stale: bool = True) -> tuple[int, int]:
    """Copy src into dst, replacing files. Returns (copied, removed)."""
    copied = 0
    for path in src.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(src)
        target = dst / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != path.read_bytes():
            shutil.copy2(path, target)
            copied += 1
    # Remove stale files that no longer exist upstream. Off for a destination
    # several sources share (the memory_ob plugin dir holds BOTH the dashboard
    # backend and the memory provider — each source would delete the other).
    removed = 0
    if remove_stale and dst.exists():
        for path in dst.rglob("*"):
            if path.is_file() and not (src / path.relative_to(dst)).exists():
                path.unlink()
                removed += 1
    return copied, removed


def _merge_into(srcs: list[Path], dst: Path) -> tuple[int, int]:
    """Copy several sources that share one destination, then prune once."""
    total = 0
    for src in srcs:
        copied, _ = _copy_tree(src, dst, remove_stale=False)
        total += copied
    removed = 0
    if dst.exists():
        for path in dst.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(dst)
            if not any((src / rel).exists() for src in srcs):
                path.unlink()
                removed += 1
    return total, removed


def install(*, enable: bool = True, startup: bool = True,
            remove_startup: bool = False) -> int:
    home = hermes_home()
    if not home.is_dir():
        print(f"Hermes home not found: {home}")
        return 1

    # The memory_ob plugin directory holds two halves: the dashboard backend
    # (screens) and the memory provider (the Hermes memory pipe). They share
    # one directory, so they merge rather than overwrite. The skills copy is
    # additive only — Hermes ships its own skills beside ours.
    groups: list[tuple[str, list[Path], Path, bool]] = [
        (
            "memory_ob",
            [SRC / "plugins" / "memory_ob", SRC.parent / "provider" / "memory_ob"],
            home / "plugins" / "memory_ob",
            True,
        ),
        (
            "memory-ob",
            [SRC / "desktop-plugins" / "memory-ob"],
            home / "desktop-plugins" / "memory-ob",
            True,
        ),
        (
            "skills",
            [SRC.parent / "skills"],
            home / "skills",
            False,
        ),
    ]

    print(f"Hermes home: {home}")
    for label, srcs, dst, prune in groups:
        for src in srcs:
            if not src.is_dir():
                print(f"  missing source: {src}")
                return 1
        if len(srcs) == 1:
            copied, removed = _copy_tree(srcs[0], dst, remove_stale=prune)
        else:
            copied, removed = _merge_into(srcs, dst)
        print(f"  {label:12s} -> {dst}  ({copied} updated, {removed} removed)")

    exe = home / "bin" / "hermes.exe"
    if enable:
        if not exe.exists():
            print(f"  hermes CLI not found at {exe}; enable it from the app.")
            return 0
        print("  enabling memory_ob ...")
        proc = subprocess.run(
            [str(exe), "plugins", "enable", "memory_ob"],
            capture_output=True,
            text=True,
        )
        if proc.returncode == 0:
            print("  enabled.")
        else:
            print(f"  enable failed: {(proc.stderr or proc.stdout).strip()[:300]}")
            return 1
    else:
        print("  (not enabled — run: hermes plugins enable memory_ob)")

    print()
    print("Restart Hermes Desktop (or reload the window) to load the shell.")

    note = _register_startup(
        SRC.parent, enable=startup and not remove_startup
    )
    print(f"  logon prompt: {note}")
    return 0


def _register_startup(project: Path, *, enable: bool = True) -> str:
    """Put the logon prompt in the Startup folder.

    A shortcut to pythonw.exe means no console window flashes at logon. The
    prompt itself is what the owner answers; the preference is stored in the
    vault, so unchecking "ask" here only removes the shortcut.
    """
    startup = (
        Path(os.environ.get("APPDATA", ""))
        / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
    )
    link = startup / "Memory_OB proxy.lnk"
    if not enable:
        try:
            link.unlink()
            return "removed the logon prompt"
        except FileNotFoundError:
            return "no logon prompt to remove"
    startup.mkdir(parents=True, exist_ok=True)

    # pythonw.exe runs with no console window
    candidates = [
        Path(sys.executable).with_name("pythonw.exe"),
        Path(sys.prefix) / "pythonw.exe",
    ]
    pythonw = next((c for c in candidates if c.is_file()), None)
    if pythonw is None:
        return "pythonw.exe not found — logon prompt not registered"

    ps = (
        "$s = New-Object -ComObject WScript.Shell; "
        f"$l = $s.CreateShortcut('{link}'); "
        f"$l.TargetPath = '{pythonw}'; "
        f"$l.Arguments = '\"{project / 'host' / 'proxy_autostart.py'}\"'; "
        f"$l.WorkingDirectory = '{project}'; "
        "$l.Description = 'Ask whether to start the Hermes memory proxy'; "
        "$l.Save()"
    )
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
        capture_output=True, text=True, timeout=30,
    )
    if proc.returncode != 0 or not link.exists():
        return f"could not create the logon prompt: {(proc.stderr or '').strip()[:200]}"
    return f"registered the logon prompt -> {link}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-enable", action="store_true",
                    help="copy files but do not enable the plugin")
    ap.add_argument("--no-startup", action="store_true",
                    help="do not put the logon prompt in the Startup folder")
    ap.add_argument("--remove-startup", action="store_true",
                    help="remove the logon prompt from the Startup folder")
    args = ap.parse_args()
    return install(enable=not args.no_enable, startup=not args.no_startup,
                   remove_startup=args.remove_startup)


if __name__ == "__main__":
    raise SystemExit(main())
