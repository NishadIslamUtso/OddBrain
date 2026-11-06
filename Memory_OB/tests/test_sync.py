"""Standing-layer sync (§7, §15 rule 6): opt-in, confirmed-only, idempotent."""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest
import warnings
from pathlib import Path

from memory_ob import sync
from memory_ob.records import Record
from memory_ob.store import Store


class SyncCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.vault = self.tmp / "vault"
        self.db = self.tmp / "mob.db"
        os.environ["MEMORY_OB_VAULT"] = str(self.vault)
        os.environ["MEMORY_OB_DB"] = str(self.db)
        self.store = Store(self.db)
        self.memory = self.tmp / "MEMORY.md"
        self.user = self.tmp / "USER.md"

    def tearDown(self) -> None:
        self.store.close()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ResourceWarning)
            shutil.rmtree(self.tmp, ignore_errors=True)

    def _add(self, rid: str, *, trust: float, status: str = "active",
             never_send: bool = False, tags: list[str] | None = None) -> None:
        self.store.add_record(
            Record(
                id=rid,
                kind="profile",
                subject="self",
                speaker="user",
                trust=trust,
                title=f"title {rid}",
                body=f"body of {rid}",
                status=status,
                never_send=never_send,
                tags=tags or [],
            )
        )


class TestConfirmedOnly(SyncCase):
    def test_unconfirmed_never_syncs(self) -> None:
        self._add("low", trust=0.3)
        self.assertEqual(sync.confirmed_records(self.store), [])

    def test_non_active_never_syncs(self) -> None:
        self._add("old", trust=0.9, status="retracted")
        self.assertEqual(sync.confirmed_records(self.store), [])

    def test_never_send_never_syncs(self) -> None:
        self._add("priv", trust=0.9, never_send=True)
        self.assertEqual(sync.confirmed_records(self.store), [])

    def test_confirmed_syncs(self) -> None:
        self._add("ok", trust=0.9)
        self.assertEqual([r.id for r in sync.confirmed_records(self.store)], ["ok"])


class TestSyncFile(SyncCase):
    def test_writes_a_marked_block(self) -> None:
        self._add("ok", trust=0.9)
        sync.sync_file(self.store, self.memory, heading="# Memory", enabled=True)
        text = self.memory.read_text(encoding="utf-8")
        self.assertIn(sync.BEGIN, text)
        self.assertIn(sync.END, text)
        self.assertIn("body of ok", text)

    def test_owner_text_outside_the_block_never_moves(self) -> None:
        self.memory.write_text(
            "# My notes\n\nI wrote this myself.\n", encoding="utf-8"
        )
        self._add("ok", trust=0.9)
        sync.sync_file(self.store, self.memory, heading="# Memory", enabled=True)
        text = self.memory.read_text(encoding="utf-8")
        self.assertIn("I wrote this myself.", text)
        self.assertLess(text.index("I wrote this"), text.index(sync.BEGIN))

    def test_second_run_changes_nothing(self) -> None:
        self._add("ok", trust=0.9)
        sync.sync_file(self.store, self.memory, heading="# Memory", enabled=True)
        first = self.memory.read_text(encoding="utf-8")
        result = sync.sync_file(self.store, self.memory, heading="# Memory", enabled=True)
        self.assertEqual(result["result"], "unchanged")
        self.assertEqual(self.memory.read_text(encoding="utf-8"), first)

    def test_backup_written_before_a_change(self) -> None:
        self.memory.write_text("original\n", encoding="utf-8")
        self._add("ok", trust=0.9)
        sync.sync_file(self.store, self.memory, heading="# Memory", enabled=True)
        backups = list(self.tmp.glob("MEMORY.md.*.bak"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(encoding="utf-8"), "original\n")

    def test_no_backup_when_nothing_changes(self) -> None:
        self._add("ok", trust=0.9)
        sync.sync_file(self.store, self.memory, heading="# Memory", enabled=True)
        sync.sync_file(self.store, self.memory, heading="# Memory", enabled=True)
        self.assertEqual(list(self.tmp.glob("MEMORY.md.*.bak")), [])

    def test_switching_off_removes_our_block_only(self) -> None:
        self.memory.write_text("my own text\n", encoding="utf-8")
        self._add("ok", trust=0.9)
        sync.sync_file(self.store, self.memory, heading="# Memory", enabled=True)
        result = sync.sync_file(self.store, self.memory, heading="# Memory", enabled=False)
        self.assertTrue(result["removed"])
        text = self.memory.read_text(encoding="utf-8")
        self.assertNotIn(sync.BEGIN, text)
        self.assertIn("my own text", text)

    def test_absent_file_is_created(self) -> None:
        self._add("ok", trust=0.9)
        sync.sync_file(self.store, self.memory, heading="# Memory", enabled=True)
        self.assertTrue(self.memory.is_file())


class TestSyncAll(SyncCase):
    def test_both_files(self) -> None:
        self._add("ok", trust=0.9)
        report = sync.sync_all(
            self.store,
            memory_path=self.memory,
            user_path=self.user,
            enabled=True,
        )
        self.assertEqual(report["synced"], 1)
        self.assertEqual(report["memory"]["result"], "written")
        self.assertEqual(report["user"]["result"], "written")

    def test_disabled_by_default_in_settings(self) -> None:
        from memory_ob.config import Settings

        self.assertFalse(Settings.resolve(vault=self.vault, db=self.db).sync_enabled)


class TestApi(SyncCase):
    def _client(self):
        from memory_ob import api
        from tests.helpers import AuthedClient

        api.settings = api.Settings.resolve(vault=self.vault, db=self.db)
        return AuthedClient.create(api.create_app(), self.vault)

    def test_status_is_opt_in(self) -> None:
        body = self._client().get("/api/sync").json()
        self.assertFalse(body["enabled"])

    def test_sync_endpoint_requires_hermes_files(self) -> None:
        r = self._client().post("/api/sync", json={"enabled": True})
        # No Hermes install in the test sandbox -> refused, never a silent write.
        self.assertEqual(r.status_code, 400, r.text)


if __name__ == "__main__":
    unittest.main()
