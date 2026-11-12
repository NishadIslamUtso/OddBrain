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
        from tests.helpers import sign

        rec = Record(
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
        # Only active, confirmed-tier records are signed; a retracted or
        # low-trust one stays below the line so the quarantine tests mean
        # something.
        if trust >= 0.9 and status == "active":
            sign(self.store, rec)
        else:
            self.store.add_record(rec)


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


class TestApi(SyncCase):
    """Hermes memory sync is a Settings switch: off until you turn it on."""

    def _client(self):
        from memory_ob import api
        from tests.helpers import AuthedClient

        api.settings = api.Settings.resolve(vault=self.vault, db=self.db, models_path=self.tmp / "models.json")
        return AuthedClient.create(api.create_app(), self.vault)

    def test_off_by_default(self) -> None:
        body = self._client().get("/api/settings").json()
        self.assertFalse(body["options"]["sync_hermes"])

    def test_turning_it_on_without_hermes_files_is_refused(self) -> None:
        from unittest import mock

        from memory_ob import hermes

        with mock.patch.object(hermes, "HERMES_HOME", self.tmp / "no-hermes"):
            r = self._client().post("/api/settings", json={"sync_hermes": True})
        # No Hermes install here -> refused with a plain reason, never a silent write.
        self.assertEqual(r.status_code, 400, r.text)
        self.assertIn("Hermes", r.json()["detail"])
        self.assertFalse(self._client().get("/api/settings").json()["options"]["sync_hermes"])

    def test_on_then_off_adds_and_removes_only_our_block(self) -> None:
        from unittest import mock

        from memory_ob import hermes

        home = self.tmp / "hermes"
        home.mkdir()
        (home / "MEMORY.md").write_text("my own memory notes\n", encoding="utf-8")
        (home / "USER.md").write_text("my own user notes\n", encoding="utf-8")
        self._add("ok", trust=0.9)
        client = self._client()
        with mock.patch.object(hermes, "HERMES_HOME", home):
            on = client.post("/api/settings", json={"sync_hermes": True})
            self.assertEqual(on.status_code, 200, on.text)
            text = (home / "MEMORY.md").read_text(encoding="utf-8")
            self.assertIn(sync.BEGIN, text)
            self.assertIn("my own memory notes", text)

            off = client.post("/api/settings", json={"sync_hermes": False})
            self.assertEqual(off.status_code, 200, off.text)
            text = (home / "MEMORY.md").read_text(encoding="utf-8")
            self.assertNotIn(sync.BEGIN, text)
            self.assertIn("my own memory notes", text)


if __name__ == "__main__":
    unittest.main()
