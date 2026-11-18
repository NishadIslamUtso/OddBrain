"""Move out of the way the files an older version had and this one no longer ships.

Unzipping a new release over the old folder adds and replaces files but never
removes the ones that went away, so old modules and old tests pile up and, in
the case of tests, fail. Each release carries ``RELEASE_FILES.txt``, the list of
every file it ships. Anything in the code folders that is not on that list is
moved (never deleted) to ``_retired/<date>/`` so it can be put back by hand.

With no list present nothing is touched.
"""

from __future__ import annotations

import shutil
import time
from pathlib import Path

MANIFEST = "RELEASE_FILES.txt"
SWEPT = ("memory_ob", "provider", "host", "skills", "tests")
SUFFIXES = frozenset({".py", ".html", ".md", ".json", ".txt", ".ps1", ".css", ".js", ".svg"})


def shipped(engine: Path) -> set[str] | None:
    """The files this release ships (forward-slash paths), or None when there is no list."""
    try:
        lines = (Path(engine) / MANIFEST).read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    names = {ln.strip().replace("\\", "/") for ln in lines if ln.strip()}
    return names or None


def sweep(engine: Path, *, stamp: str | None = None) -> list[str]:
    """Move every swept file that is not in the release list. Returns what was moved."""
    engine = Path(engine)
    keep = shipped(engine)
    if keep is None:
        return []
    stamp = stamp or time.strftime("%Y%m%d-%H%M%S")
    moved: list[str] = []
    for folder in SWEPT:
        root = engine / folder
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file() or "__pycache__" in path.parts or path.suffix.lower() not in SUFFIXES:
                continue
            rel = path.relative_to(engine).as_posix()
            if rel in keep:
                continue
            target = engine / "_retired" / stamp / rel
            try:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(path), str(target))
                moved.append(rel)
            except OSError:
                continue          # a file in use stays where it is; the next install tries again
    return moved
