"""The nightly backup keeps everything that is yours — and never the write key."""

from __future__ import annotations

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

import backup  # noqa: E402

from memory_ob import biography, manager  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402


class Backup(unittest.TestCase):
    def setUp(self) -> None:
        # the test runner points these at a scratch area; this test uses its own folder
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        for key in ("MEMORY_OB_VAULT", "MEMORY_OB_DB", "MEMORY_OB_TOKEN", "MEMORY_OB_MODELS"):
            os.environ.pop(key, None)
        self.tmp = Path(tempfile.mkdtemp())
        self.vault = self.tmp / "Memory_OB"
        self.settings = Settings.resolve(vault=self.vault, db=self.vault / ".brain" / "memory_ob.db")
        self.settings.ensure_dirs()
        self.store = Store(self.settings.db)
        manager.capture(self.store, text="I am allergic to penicillin", vault=self.vault)
        biography.edit(self.vault, "I wrote this biography myself.")
        (self.vault / ".brain" / "token").write_text("secret-key", encoding="utf-8")
        self.archive = backup.create_backup(self.vault)

    def tearDown(self) -> None:
        self.store.close()

    def names(self) -> list[str]:
        with zipfile.ZipFile(self.archive) as zf:
            return zf.namelist()

    def test_the_database_is_in_it_and_readable(self) -> None:
        self.assertIn("ledger.sqlite", self.names())
        out = self.tmp / "restored"
        backup.restore_backup(self.archive, out)
        con = sqlite3.connect(str(out / "ledger.sqlite"))
        try:
            self.assertGreaterEqual(con.execute("SELECT COUNT(*) FROM records").fetchone()[0], 1)
        finally:
            con.close()

    def test_a_biography_you_wrote_is_saved(self) -> None:
        self.assertIn("vault/.brain/biography.json", self.names())

    def test_the_write_key_and_old_backups_are_not(self) -> None:
        names = self.names()
        self.assertFalse([n for n in names if n.endswith("/token") or n == "token"])
        self.assertFalse([n for n in names if "/backups/" in n])
        again = backup.create_backup(self.vault)
        with zipfile.ZipFile(again) as zf:
            self.assertFalse([n for n in zf.namelist() if "/backups/" in n])


if __name__ == "__main__":
    unittest.main()
