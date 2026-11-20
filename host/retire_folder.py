"""Move an old engine folder out of Downloads. Run it from outside that folder.

Windows will not move (or delete) a folder that a process is standing in, and
the installer is usually started from inside the old engine folder. So when
that is the case the installer starts *this* script detached: it waits for the
installer to exit, then moves the folder. The contents are never deleted.

usage: retire_folder.py <old engine folder> <hermes home> <where it was> [--wait]
"""

from __future__ import annotations

import os
import shutil
import sys
import time
from pathlib import Path

# How long to keep retrying the move while the installer that is standing in
# the old folder is still running. The tests shrink it.
SETTLE_SECONDS = float(os.environ.get("MEMORY_OB_RETIRE_SETTLE") or 40.0)


def main(argv: list[str]) -> int:
    wait = "--wait" in argv[1:]
    args = [a for a in argv[1:] if a != "--wait"]
    if len(args) != 3:
        print("retire_folder: expected <old engine folder> <hermes home> <where it was>")
        return 2
    project = Path(args[0])
    home = Path(args[1])
    reason = args[2]
    stamp = time.strftime("%Y%m%d-%H%M%S")
    base = home / "_retired"
    base.mkdir(parents=True, exist_ok=True)
    if not project.exists():
        return 0                     # someone already moved it: nothing to do, nothing to say
    if wait:
        time.sleep(1.0)          # let the installer that stands in the folder get out
    deadline = time.time() + SETTLE_SECONDS
    last_exc: OSError | None = None
    while True:
        # A fresh name per attempt: if a previous attempt left half-copied
        # debris at the destination we must never merge into it or delete it.
        dest = base / f"{project.name}-{stamp}"
        n = 1
        while dest.exists():
            n += 1
            dest = base / f"{project.name}-{stamp}-{n}"
        try:
            shutil.move(str(project), str(dest))
            return 0
        except OSError as exc:
            if not project.exists():
                return 0             # it went away mid-retry: done
            last_exc = exc
            if time.time() >= deadline:
                break
            time.sleep(1.0)
    # Nobody can see this console (the helper is detached), so the failure is
    # left where the owner will find it: next to the retired copies.
    note = base / f"{project.name}-NOT-MOVED.txt"
    note.write_text(
        f"The old copy in {reason} could not be moved out of the way: {last_exc}\n"
        f"It is still at {project}. You can move or delete it yourself - the\n"
        f"program no longer uses it. Nothing was deleted.\n",
        encoding="utf-8")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
