#!/usr/bin/env python3
"""Register the nightly run with Windows Task Scheduler.

    python schedule.py            # install the daily task
    python schedule.py --remove   # take it out
    python schedule.py --status   # is it registered?

The task runs ``host/nightly.py`` — dream, consistency sweep, vault export,
manifest refresh, and the opt-in standing-layer sync. It runs whether or not
Hermes Desktop is open, and it never raises a window.

Task Scheduler is the Windows-native scheduler; no new service, no new
dependency. Windows is the target (§15 rule 11), so this is the mechanism.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent
TASK_NAME = "MemoryOB_Nightly"
PYTHON = sys.executable
NIGHTLY = SRC / "nightly.py"


def _run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["schtasks", *args], capture_output=True, text=True, timeout=60
    )


def status() -> bool:
    proc = _run("/Query", "/TN", TASK_NAME)
    return proc.returncode == 0


def register(*, hour: int = 4, minute: int = 23) -> bool:
    """Create or replace the daily task. Returns True on success."""
    if not NIGHTLY.is_file():
        print(f"nightly runner not found: {NIGHTLY}")
        return False
    command = f'"{PYTHON}" "{NIGHTLY}"'
    proc = _run(
        "/Create",
        "/TN", TASK_NAME,
        "/TR", command,
        "/SC", "DAILY",
        "/ST", f"{hour:02d}:{minute:02d}",
        "/F",
    )
    if proc.returncode != 0:
        print((proc.stdout or "") + (proc.stderr or ""))
        return False
    print(f"registered {TASK_NAME}: daily at {hour:02d}:{minute:02d}")
    print(f"  {command}")
    return True


def remove() -> bool:
    proc = _run("/Delete", "/TN", TASK_NAME, "/F")
    if proc.returncode != 0:
        print((proc.stdout or "") + (proc.stderr or ""))
        return False
    print(f"removed {TASK_NAME}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Schedule the nightly run")
    parser.add_argument("--remove", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--hour", type=int, default=4)
    parser.add_argument("--minute", type=int, default=23)
    args = parser.parse_args()

    if args.remove:
        return 0 if remove() else 1
    if args.status:
        print(f"{TASK_NAME}: {'registered' if status() else 'not registered'}")
        return 0
    return 0 if register(hour=args.hour, minute=args.minute) else 1


if __name__ == "__main__":
    raise SystemExit(main())
