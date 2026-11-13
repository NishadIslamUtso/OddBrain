#!/usr/bin/env python3
"""Back up and restore the Memory_OB vault and ledger.

The vault is the owner's. A backup is a single timestamped archive beside the
vault, containing both halves that matter:

* the SQLite ledger (the authoritative store), and
* the markdown export (the human-readable view).

    python backup.py                 # write a timestamped archive
    python backup.py --list          # show what backups exist
    python backup.py --restore FILE  # put one back

Nothing here deletes the original. A restore writes into a fresh folder and
tells you where, so a wrong restore never overwrites a good vault.
"""

from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SRC = Path(__file__).resolve().parent
sys.path.insert(0, str(SRC.parent))

from memory_ob.config import default_db, default_vault  # noqa: E402

BACKUP_DIR = "backups"


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def backup_dir(vault: Path) -> Path:
    return Path(vault) / ".brain" / BACKUP_DIR


# Inside .brain/: the write key is never copied, and old backups are not nested.
_SKIP = (".brain/backups", ".brain/token")


def _copy_db(db: Path, target: Path) -> None:
    """A consistent copy of the database even while the app has it open."""
    src = sqlite3.connect(str(db))
    dst = sqlite3.connect(str(target))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()


def create_backup(vault: Path | None = None) -> Path:
    """Archive the ledger, the notes and the private settings into one timestamped file.

    The settings (``.brain/*.json`` — biography you edited, helper choice,
    switches) are included; the write key and earlier backups are not.
    """
    v = Path(vault) if vault else default_vault()
    db = default_db(v)
    dest_dir = backup_dir(v)
    dest_dir.mkdir(parents=True, exist_ok=True)
    archive = dest_dir / f"memory-ob-{_stamp()}"

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "memory-ob"
        (root / "vault").mkdir(parents=True)
        if db.is_file():
            _copy_db(db, root / "ledger.sqlite")
        db_rel = None
        try:
            db_rel = db.relative_to(v).as_posix()
        except ValueError:
            pass
        for path in sorted(v.rglob("*")) if v.is_dir() else []:
            if not path.is_file():
                continue
            rel = path.relative_to(v).as_posix()
            if any(rel == s or rel.startswith(s + "/") for s in _SKIP):
                continue
            if db_rel and rel in (db_rel, db_rel + "-wal", db_rel + "-shm"):
                continue      # the database goes in as ledger.sqlite
            target = root / "vault" / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
        return Path(shutil.make_archive(str(archive), "zip", root))


def list_backups(vault: Path | None = None) -> list[Path]:
    d = backup_dir(Path(vault) if vault else default_vault())
    if not d.is_dir():
        return []
    return sorted(d.glob("memory-ob-*.zip"), reverse=True)


def restore_backup(archive: Path, dest: Path | None = None) -> Path:
    """Unpack an archive into a fresh folder and return its path."""
    target = Path(dest) if dest else Path.cwd() / f"memory-ob-restore-{_stamp()}"
    target.mkdir(parents=True, exist_ok=True)
    shutil.unpack_archive(str(archive), str(target))
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description="Back up and restore Memory_OB")
    parser.add_argument("--vault", type=Path, default=None)
    parser.add_argument("--list", action="store_true", help="list backups")
    parser.add_argument("--restore", type=Path, default=None, help="archive to restore")
    parser.add_argument("--dest", type=Path, default=None, help="restore target folder")
    args = parser.parse_args()

    if args.list:
        found = list_backups(args.vault)
        if not found:
            print("no backups")
            return 0
        for path in found:
            print(f"{path.stat().st_size:>10d}  {path}")
        return 0

    if args.restore:
        if not args.restore.is_file():
            print(f"no such archive: {args.restore}")
            return 1
        target = restore_backup(args.restore, args.dest)
        print(f"restored to: {target}")
        return 0

    path = create_backup(args.vault)
    print(f"backup written: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
