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
import zipfile
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


class BackupError(ValueError):
    """The archive is not a safe Memory_OB backup. The message is plain enough to show the owner."""


MAX_RESTORE_BYTES = 8 * 1024 ** 3       # nobody's notes are bigger than this; a zip bomb is


def _check_archive(zf: zipfile.ZipFile, target: Path) -> None:
    root = target.resolve()
    total = 0
    names: list[str] = []
    for info in zf.infolist():
        name = info.filename.replace("\\", "/")
        if name.startswith("/") or (len(name) > 1 and name[1] == ":") or ".." in name.split("/"):
            raise BackupError("That backup has files that point outside its own folder, so I did not open it.")
        mode = info.external_attr >> 16
        if mode and (mode & 0o170000) == 0o120000:
            raise BackupError("That backup contains a shortcut (symbolic link), so I did not open it.")
        if not (root / name).resolve().is_relative_to(root):
            raise BackupError("That backup has files that point outside its own folder, so I did not open it.")
        total += info.file_size
        names.append(name)
    if total > MAX_RESTORE_BYTES:
        raise BackupError("That backup is far larger than any real one, so I did not open it.")
    if "ledger.sqlite" not in names and not any(n.startswith("vault/") for n in names):
        raise BackupError("That file does not look like a Memory_OB backup (no notes or memory file inside).")


def restore_backup(archive: Path, dest: Path | None = None) -> Path:
    """Unpack an archive into a fresh folder and return its path.

    The archive is checked first (nothing may land outside the folder, no
    shortcuts, a sane size, and it must hold notes or the memory file), and the
    memory file is checked for damage after.
    """
    target = Path(dest) if dest else Path.cwd() / f"memory-ob-restore-{_stamp()}"
    try:
        with zipfile.ZipFile(str(archive)) as zf:
            target.mkdir(parents=True, exist_ok=True)
            _check_archive(zf, target)
            zf.extractall(str(target))
    except zipfile.BadZipFile as exc:
        raise BackupError("That file is not a readable backup (it is damaged or not a zip).") from exc
    ledger = target / "ledger.sqlite"
    if ledger.is_file():
        try:
            conn = sqlite3.connect(str(ledger))
            try:
                ok = conn.execute("PRAGMA integrity_check").fetchone()
            finally:
                conn.close()
        except sqlite3.DatabaseError:
            ok = None
        if not ok or ok[0] != "ok":
            raise BackupError(f"The memory file inside that backup is damaged. It was unpacked into {target} "
                              "for you to look at, but do not use it as your memory.")
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
        try:
            target = restore_backup(args.restore, args.dest)
        except BackupError as exc:
            print(str(exc))
            return 1
        print(f"restored to: {target}")
        return 0

    path = create_backup(args.vault)
    print(f"backup written: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
