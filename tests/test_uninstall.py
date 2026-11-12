"""Removing Memory_OB: memories are kept by default, a backup always comes first."""

from __future__ import annotations

import contextlib
import io
import os
import sqlite3
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))
sys.path.insert(0, str(PROJECT / "host"))

import install as installer  # noqa: E402
import uninstall  # noqa: E402

from memory_ob import manager, sync  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402


class UninstallCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.home = self.tmp / "hermes"
        self.home.mkdir()
        (self.home / "skills" / "someone-elses-skill").mkdir(parents=True)
        (self.home / "skills" / "someone-elses-skill" / "SKILL.md").write_text("theirs", encoding="utf-8")
        with mock.patch.dict(os.environ, {"HERMES_HOME": str(self.home)}), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(installer.install(enable=False, startup=False), 0)

        self.vault = self.tmp / "Documents" / "Memory_OB"
        self.settings = Settings.resolve(vault=self.vault, db=self.vault / ".brain" / "memory_ob.db")
        self.settings.ensure_dirs()
        store = Store(self.settings.db)
        manager.capture(store, text="I have a peanut allergy. I study computer science.", vault=self.vault)
        store.close()

        # Hermes's own notes: the user's text around our generated block
        self.memory_md = self.home / "MEMORY.md"
        self.memory_md.write_text(
            f"my own note\n{sync.BEGIN}\n- generated line\n{sync.END}\nanother own note\n", encoding="utf-8")

        self.said: list[str] = []
        patcher = mock.patch("memory_ob.hermes.hermes_memory_paths", return_value=(self.memory_md, None))
        patcher.start()
        self.addCleanup(patcher.stop)
        env = mock.patch.dict(os.environ, {"HERMES_HOME": str(self.home)})
        env.start()
        self.addCleanup(env.stop)

    def run_uninstall(self, **kw):
        return uninstall.uninstall(hermes_home=self.home, vault=self.vault, windows=False,
                                   say=self.said.append, **kw)

    def backups(self) -> list[Path]:
        return sorted(self.vault.parent.glob("Memory_OB-backup-*.zip"))


class Keeping(UninstallCase):
    def test_the_install_put_files_in_hermes(self) -> None:
        self.assertTrue((self.home / "plugins" / "memory_ob").is_dir())
        self.assertTrue((self.home / "desktop-plugins" / "memory-ob" / "plugin.js").is_file())
        self.assertTrue((self.home / "skills" / "brain").is_dir())

    def test_it_removes_what_the_installer_added_and_nothing_else(self) -> None:
        self.run_uninstall()
        self.assertFalse((self.home / "plugins" / "memory_ob").exists())
        self.assertFalse((self.home / "desktop-plugins" / "memory-ob").exists())
        for skill in ("brain", "anonymous-mode", "memory-full-recall"):
            self.assertFalse((self.home / "skills" / skill).exists(), skill)
        self.assertEqual((self.home / "skills" / "someone-elses-skill" / "SKILL.md").read_text(), "theirs")

    def test_memories_are_kept_by_default(self) -> None:
        report = self.run_uninstall()
        self.assertFalse(report["data_deleted"])
        self.assertTrue(self.settings.db.is_file())
        store = Store(self.settings.db)
        self.assertEqual(len(store.list_records(status="active")), 2)
        store.close()
        self.assertTrue(any(self.vault.glob("Health/*.md")))
        self.assertTrue(any("still in" in line for line in self.said))

    def test_hermes_notes_lose_only_our_block(self) -> None:
        report = self.run_uninstall()
        text = self.memory_md.read_text(encoding="utf-8")
        self.assertNotIn(sync.BEGIN, text)
        self.assertNotIn("generated line", text)
        self.assertIn("my own note", text)
        self.assertIn("another own note", text)
        self.assertEqual(report["notes"], [str(self.memory_md)])

    def test_a_backup_is_made_beside_the_vault_and_has_the_memories_but_not_the_key(self) -> None:
        from tests.helpers import token_for

        token_for(self.vault)
        report = self.run_uninstall()
        [backup] = self.backups()
        self.assertEqual(Path(report["backup"]), backup)
        self.assertFalse(str(backup).startswith(str(self.vault) + os.sep))      # not inside what it protects
        with zipfile.ZipFile(backup) as zf:
            names = zf.namelist()
            self.assertIsNone(zf.testzip())
            self.assertTrue(any(n.startswith("Health/") for n in names), names)
            self.assertFalse(any(n.endswith("/token") or n == ".brain/token" for n in names))
            db_name = next(n for n in names if n.endswith("memory_ob.db"))
            copy = self.tmp / "restored.db"
            copy.write_bytes(zf.read(db_name))
        rows = sqlite3.connect(copy).execute("SELECT COUNT(*) FROM records").fetchone()[0]
        self.assertEqual(rows, 2)

    def test_running_it_twice_is_harmless(self) -> None:
        self.run_uninstall()
        second = self.run_uninstall()
        self.assertEqual(second["removed"], [])
        self.assertTrue(self.settings.db.is_file())

    def test_a_dry_run_changes_nothing(self) -> None:
        before = self.memory_md.read_text(encoding="utf-8")
        self.run_uninstall(dry_run=True, delete_data=True)
        self.assertTrue((self.home / "plugins" / "memory_ob").is_dir())
        self.assertEqual(self.memory_md.read_text(encoding="utf-8"), before)
        self.assertTrue(self.vault.is_dir())
        self.assertEqual(self.backups(), [])


class Deleting(UninstallCase):
    def test_delete_data_removes_the_vault_but_keeps_the_backup(self) -> None:
        report = self.run_uninstall(delete_data=True)
        self.assertTrue(report["data_deleted"])
        self.assertFalse(self.vault.exists())
        [backup] = self.backups()
        with zipfile.ZipFile(backup) as zf:
            self.assertTrue(any(n.startswith("Health/") for n in zf.namelist()))

    def test_nothing_is_deleted_if_no_backup_could_be_made(self) -> None:
        with mock.patch.object(uninstall, "backup_beside", return_value=None):
            report = self.run_uninstall(delete_data=True)
        self.assertFalse(report["data_deleted"])
        self.assertTrue(self.vault.is_dir())
        self.assertTrue(any("no backup" in line for line in self.said))

    def test_no_vault_means_nothing_to_back_up_or_delete(self) -> None:
        import shutil

        shutil.rmtree(self.vault)
        report = self.run_uninstall(delete_data=True)
        self.assertIsNone(report["backup"])
        self.assertFalse(report["data_deleted"])


class Script(unittest.TestCase):
    def test_the_powershell_wrapper_asks_before_deleting_and_passes_the_switch(self) -> None:
        ps = (PROJECT / "uninstall.ps1").read_text(encoding="utf-8")
        self.assertIn("-DeleteData", ps)
        self.assertIn("Type DELETE", ps)
        self.assertIn("--delete-data", ps)
        self.assertIn("host\\uninstall.py", ps)

    def test_the_settings_screen_points_at_this_script(self) -> None:
        html = (PROJECT / "memory_ob" / "web" / "index.html").read_text(encoding="utf-8")
        self.assertIn("uninstall.ps1", html)
        self.assertTrue((PROJECT / "uninstall.ps1").is_file())


if __name__ == "__main__":
    unittest.main()
