"""Move an old engine folder out of Downloads. Run it from outside that folder.

Windows will not move (or delete) a folder that a process is standing in, and
the installer is usually started from inside the old engine folder. So when
that is the case the installer starts *this* script detached: it waits for the
installer to exit, then moves the folder. The contents are never deleted.

usage: retire_folder.py <old engine folder> <hermes home> <where it was> [--wait]
"""

from __future__ import annotations

import shutil
import sys
import time
from pathlib import Path

# How long to keep retrying the move while the installer that is standing in
# the old folder is still running.
SETTLE_SECONDS = 40.0


def main(argv: list[str]) -> int:
    wait = "--wait" in argv[1:]
    args = [a for a in argv[1:] if a != "--wait"]
    if len(args) != 3:
        print("retire_folder: expected <old engine folder> <hermes home> <where it was>")
        return 2
    project = Path(args[0])
    home = Path(args[1])
    reason = args[2]
    dest = home / "_retired" / f"{project.name}-{time.strftime('%Y%m%d-%H%M%S')}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if wait:
        time.sleep(1.0)          # let the installer that stands in the folder get out
    deadline = time.time() + SETTLE_SECONDS
    while True:
        try:
            shutil.move(str(project), str(dest))
            print(f"  the old copy (was in {reason}) is retired at {dest} - never deleted")
            return 0
        except OSError as exc:
            if time.time() >= deadline:
                print(f"  could not move the old copy out of {reason}: {exc} (it is still there)")
                return 1
            time.sleep(1.0)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
