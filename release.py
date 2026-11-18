#!/usr/bin/env python3
"""Build a release zip: python release.py ../Memory_OB-update-N.zip

Writes RELEASE_FILES.txt (every file the release ships) and zips the project.
The installer uses that list to move out of the way files an older version had.
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = "RELEASE_FILES.txt"
SKIP_DIRS = {"__pycache__", ".git", ".brain", "vault", "_retired", ".venv", "venv", "node_modules", "shots"}
SKIP_SUFFIXES = (".pyc", ".db", ".db-wal", ".db-shm", ".bak", ".mob-tmp")


def _skip(rel: Path) -> bool:
    """Build artefacts and private state never belong in a release."""
    return (
        any(part in SKIP_DIRS or part.endswith(".egg-info") for part in rel.parts)
        or rel.name in ("token", ".token", MANIFEST)
    )


def release_files(root: Path = ROOT) -> list[str]:
    out: list[str] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if _skip(rel) or path.name.endswith(SKIP_SUFFIXES):
            continue
        out.append(rel.as_posix())
    return out


def build(dest: Path, root: Path = ROOT) -> list[str]:
    files = release_files(root)
    (root / MANIFEST).write_text("\n".join(sorted([*files, MANIFEST])) + "\n", encoding="utf-8")
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for rel in [*files, MANIFEST]:
            zf.write(root / rel, rel)
    return [*files, MANIFEST]


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python release.py <output.zip>")
    names = build(Path(sys.argv[1]).resolve())
    print(f"{len(names)} files -> {sys.argv[1]}")
