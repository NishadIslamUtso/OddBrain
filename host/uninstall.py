#!/usr/bin/env python3
"""Take Memory_OB out of Hermes Desktop.

    python uninstall.py                 # remove it, keep every memory
    python uninstall.py --delete-data   # also delete the memories (a backup is made first)
    python uninstall.py --dry-run       # show what would happen, change nothing

What it does, in order:

1. Makes a backup zip of your memories *beside* the vault folder, so even
   "delete everything" can be undone. (Skipped only if there is nothing yet.)
2. Takes Memory_OB's block out of Hermes's own memory notes, if you had turned
   that on. Everything else in those notes is left exactly as it was.
3. Removes the startup item and the nightly task, and stops the helper link
   if it is running.
4. Switches the plugin off in Hermes (through Hermes's own command, never by
   editing its config file) and removes the plugin and skill files it copied.
5. Only with ``--delete-data``: deletes the vault folder.

Your memories are plain markdown files in the vault folder, so keeping them is
the safe default: Obsidian (or anything else) can still open them.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

SRC = Path(__file__).resolve().parent
sys.path.insert(0, str(SRC.parent))
sys.path.insert(0, str(SRC))

PLUGIN_DIRS = (("plugins", "memory_ob"), ("desktop-plugins", "memory-ob"))
SKIP_IN_BACKUP = {".brain/backups", ".brain/token"}


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def backup_beside(vault: Path, db: Path) -> Path | None:
    """A zip of the vault next to it (not inside it). None when there is nothing to save."""
    vault = Path(vault)
    if not vault.is_dir():
        return None
    target = vault.parent / f"{vault.name}-backup-{_stamp()}.zip"
    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
        db = Path(db)
        db_rel = None
        try:
            db_rel = db.relative_to(vault).as_posix()
        except ValueError:
            pass
        if db.is_file():
            copy = Path(tmp) / "memory_ob.db"
            src = sqlite3.connect(str(db))
            dst = sqlite3.connect(str(copy))
            try:
                src.backup(dst)      # a consistent copy even if the app is open
            finally:
                dst.close()
                src.close()
            zf.write(copy, db_rel or ".brain/memory_ob.db")
        for path in sorted(vault.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(vault).as_posix()
            if any(rel == s or rel.startswith(s + "/") for s in SKIP_IN_BACKUP):
                continue
            if rel == db_rel or (db_rel and rel in (db_rel + "-wal", db_rel + "-shm")):
                continue
            zf.write(path, rel)
    return target


def strip_hermes_notes(paths: list[Path | None]) -> list[str]:
    """Remove Memory_OB's generated block from Hermes's memory notes. Returns files changed."""
    from memory_ob import sync

    changed: list[str] = []
    for path in paths:
        if not path or not Path(path).is_file():
            continue
        text = Path(path).read_text(encoding="utf-8")
        before, block, after = sync._split(text)
        if not block:
            continue
        sync._write_if_changed(Path(path), (before + after).rstrip() + "\n")
        changed.append(str(path))
    return changed


def _remove_tree(path: Path) -> bool:
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)
        return True
    return False


def uninstall(
    *, hermes_home: Path | None = None, vault: Path | None = None, delete_data: bool = False,
    dry_run: bool = False, windows: bool | None = None, say=print,
) -> dict[str, object]:
    """Do the uninstall. Returns what happened (used by the tests)."""
    from memory_ob.config import Settings

    import install as installer

    windows = (os.name == "nt") if windows is None else windows
    home = Path(hermes_home) if hermes_home else installer.hermes_home()
    settings = Settings.resolve(vault=vault) if vault else Settings.resolve()
    report: dict[str, object] = {"backup": None, "removed": [], "notes": [], "data_deleted": False}
    prefix = "would " if dry_run else ""

    # 1. backup first
    if settings.vault.is_dir():
        if dry_run:
            say(f"  {prefix}back up {settings.vault} to a zip beside it")
        else:
            report["backup"] = backup_beside(settings.vault, settings.db)
            say(f"  backup: {report['backup']}")

    # 2. Hermes's own notes
    try:
        from memory_ob.hermes import hermes_memory_paths

        paths = list(hermes_memory_paths())
    except Exception:  # noqa: BLE001
        paths = []
    if dry_run:
        say(f"  {prefix}take Memory_OB's block out of Hermes's memory notes (if present)")
    else:
        report["notes"] = strip_hermes_notes(paths)
        if report["notes"]:
            say(f"  cleaned Hermes memory notes: {', '.join(report['notes'])}")  # type: ignore[arg-type]

    # 3. startup item, nightly task, helper link
    if windows:
        if dry_run:
            say(f"  {prefix}remove the startup item and the nightly task")
        else:
            say(f"  startup item: {installer._register_startup(SRC.parent, enable=False)}")
            try:
                import schedule as scheduler

                if scheduler.status():
                    scheduler.remove()
                else:
                    say("  nightly task: not registered")
            except Exception as exc:  # noqa: BLE001
                say(f"  nightly task: could not check ({exc})")
    try:
        from memory_ob import proxy

        if not dry_run and proxy.running():
            proxy.stop()
            say("  stopped the helper link")
    except Exception:  # noqa: BLE001
        pass

    # 4. Hermes: switch off, then remove the files we copied
    exe = home / "bin" / ("hermes.exe" if windows else "hermes")
    if exe.exists() and not dry_run:
        proc = subprocess.run([str(exe), "plugins", "disable", "memory_ob"],
                              capture_output=True, text=True, timeout=60)
        say("  switched the plugin off in Hermes" if proc.returncode == 0
            else f"  could not switch it off through Hermes ({(proc.stderr or proc.stdout).strip()[:160]}); "
                 "the files are being removed anyway")
    removed: list[str] = report["removed"]  # type: ignore[assignment]
    for group, name in PLUGIN_DIRS:
        target = home / group / name
        if target.is_dir():
            removed.append(str(target))
            if not dry_run:
                _remove_tree(target)
    skills_src = SRC.parent / "skills"
    if skills_src.is_dir():
        for skill in sorted(p for p in skills_src.iterdir() if p.is_dir()):
            target = home / "skills" / skill.name
            if target.is_dir():
                removed.append(str(target))
                if not dry_run:
                    _remove_tree(target)
    for item in removed:
        say(f"  {prefix}removed {item}")
    if not removed:
        say("  no Memory_OB files were found in Hermes")

    try:
        from memory_ob.hermes import config_get

        if (config_get("memory.provider") or "") == "memory_ob":
            say("  note: Hermes is still set to use Memory_OB as its memory provider. "
                "Pick another memory (or none) in Hermes before using it again.")
    except Exception:  # noqa: BLE001
        pass

    # 5. the memories themselves
    if delete_data:
        if not settings.vault.is_dir():
            say("  no memories folder to delete")
        elif dry_run:
            say(f"  {prefix}delete {settings.vault}")
        elif report["backup"] is None:
            say("  not deleting anything: no backup could be made")
        else:
            _remove_tree(settings.vault)
            report["data_deleted"] = not settings.vault.exists()
            say(f"  deleted {settings.vault} (the backup zip is kept beside it)")
    else:
        say(f"  your memories are still in {settings.vault}")
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="Remove Memory_OB from Hermes Desktop")
    ap.add_argument("--delete-data", action="store_true",
                    help="also delete the memories folder (a backup zip is made first)")
    ap.add_argument("--dry-run", action="store_true", help="show what would happen, change nothing")
    args = ap.parse_args()
    print("Removing Memory_OB ...")
    uninstall(delete_data=args.delete_data, dry_run=args.dry_run)
    if not args.dry_run:
        print()
        print("Done. Restart Hermes Desktop so the Memory_OB tab goes away.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
