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


# D1: with no AI helper these tests would keep captures aside; they exercise
# filing, so the API gets the stand-in helper.
from memory_ob import api  # noqa: E402
try:
    from tests.helpers import api_uses_reading_helper
except ImportError:      # running as a script from inside tests/
    from helpers import api_uses_reading_helper
api_uses_reading_helper(api)

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


class TestHermesFolder(SyncCase):
    """Hermes keeps MEMORY.md and USER.md in a ``memories`` folder. That is where we must look."""

    def _client(self):
        from memory_ob import api
        from tests.helpers import AuthedClient

        api.settings = api.Settings.resolve(vault=self.vault, db=self.db, models_path=self.tmp / "models.json")
        return AuthedClient.create(api.create_app(), self.vault)

    def _home(self, *, memories: bool = False) -> Path:
        home = self.tmp / "hermes-home"
        (home / "memories").mkdir(parents=True) if memories else home.mkdir()
        return home

    def _add_text(self, rid: str, text: str, *, tags: list[str] | None = None, kind: str = "profile",
                  importance: int = 0, never_send: bool = False) -> None:
        from tests.helpers import sign

        sign(self.store, Record(id=rid, kind=kind, subject="self", speaker="user", trust=0.9, title=text,
                                body=text, tags=tags or [], importance=importance, never_send=never_send))

    def test_finds_the_memories_folder(self) -> None:
        from unittest import mock

        from memory_ob import hermes

        home = self._home(memories=True)
        with mock.patch.object(hermes, "HERMES_HOME", home):
            memory, user = hermes.hermes_memory_paths()
        self.assertEqual(memory, home / "memories" / "MEMORY.md")
        self.assertEqual(user, home / "memories" / "USER.md")

    def test_hermes_installed_but_never_saved_anything_still_works(self) -> None:
        """No memories folder yet: it is made, the files are not looked for in the wrong place."""
        from unittest import mock

        from memory_ob import hermes

        home = self._home()
        self._add_text("a", "I am a student at BRAC University")
        client = self._client()
        with mock.patch.object(hermes, "HERMES_HOME", home):
            self.assertTrue(client.get("/api/settings").json()["hermes_files"])
            r = client.post("/api/settings", json={"sync_hermes": True})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("Turned on", r.json()["message"])
        self.assertIn("BRAC University", (home / "memories" / "USER.md").read_text(encoding="utf-8"))
        self.assertIn("memory_ob_search", (home / "memories" / "MEMORY.md").read_text(encoding="utf-8"))
        self.assertFalse((home / "MEMORY.md").exists())

    def test_the_block_is_its_own_entry(self) -> None:
        """Hermes splits its notes on a line holding only the section sign."""
        self.user.write_text("Likes tea\n\u00a7\nDislikes noise\n", encoding="utf-8")
        self._add_text("a", "I live in Dhaka")
        sync.sync_file(self.store, self.user, heading=sync.USER_HEADING, enabled=True)
        entries = [e.strip() for e in self.user.read_text(encoding="utf-8").split(sync.DELIM) if e.strip()]
        self.assertEqual(entries[0], "Likes tea")
        self.assertEqual(entries[1], "Dislikes noise")
        self.assertEqual(len(entries), 3)
        self.assertTrue(entries[2].startswith(sync.BEGIN) and entries[2].endswith(sync.END))

    def test_a_long_list_never_passes_its_share_or_hermes_limit(self) -> None:
        for i in range(80):
            self._add_text(f"r{i}", f"I have fact number {i} and it is written out in a reasonably long way to take room")
        self.user.write_text("Owner wrote this entry\n", encoding="utf-8")
        report = sync.sync_all(self.store, memory_path=self.memory, user_path=self.user, enabled=True,
                               memory_limit=2200, user_limit=1375)
        for path, limit in ((self.user, 1375), (self.memory, 2200)):
            text = path.read_text(encoding="utf-8")
            joined = sync.DELIM.join(e.strip() for e in text.split(sync.DELIM) if e.strip())
            self.assertLessEqual(len(joined), limit, path.name)
            block = text[text.index(sync.BEGIN): text.index(sync.END) + len(sync.END)]
            self.assertLessEqual(len(block), int(limit * sync.SHARE), path.name)
            for entry in joined.split(sync.DELIM):
                self.assertLessEqual(len(entry), limit)
        self.assertIn("Owner wrote this entry", self.user.read_text(encoding="utf-8"))
        self.assertLess(report["shown"], report["synced"])
        self.assertIn("more: memory_ob_search", self.user.read_text(encoding="utf-8"))

    def test_what_does_not_fit_in_user_md_goes_to_memory_md(self) -> None:
        for i in range(30):
            self._add_text(f"r{i}", f"Fact {i}: the owner has some detail number {i} worth keeping around")
        report = sync.sync_all(self.store, memory_path=self.memory, user_path=self.user, enabled=True)
        self.assertGreater(report["user"]["shown"], 0)
        self.assertGreater(report["memory"]["shown"], 0)
        self.assertEqual(report["shown"], report["user"]["shown"] + report["memory"]["shown"])

    def test_most_important_come_first(self) -> None:
        for i in range(40):
            self._add_text(f"r{i}", f"Ordinary thing {i} that is somewhat long so that not everything fits here")
        self._add_text("big", "Decided to finish the thesis by March", importance=2)
        self._add_text("mem", "Important learning about sleep", kind="learning", importance=1)
        sync.sync_all(self.store, memory_path=self.memory, user_path=self.user, enabled=True)
        text = self.memory.read_text(encoding="utf-8")
        self.assertIn("Decided to finish the thesis by March", text)
        self.assertIn("Important learning about sleep", self.user.read_text(encoding="utf-8"))

    def test_no_room_means_nothing_is_written_and_hermes_is_left_alone(self) -> None:
        original = "x" * 1300
        self.user.write_text(original, encoding="utf-8")
        self._add_text("a", "I live in Dhaka")
        result = sync.sync_file(self.store, self.user, heading=sync.USER_HEADING, enabled=True, limit=1375)
        self.assertEqual(result.get("note"), "no room")
        self.assertEqual(self.user.read_text(encoding="utf-8"), original)

    def test_a_block_that_no_longer_fits_is_taken_out(self) -> None:
        self._add_text("a", "I live in Dhaka")
        sync.sync_file(self.store, self.user, heading=sync.USER_HEADING, enabled=True)
        self.assertIn(sync.BEGIN, self.user.read_text(encoding="utf-8"))
        grown = self.user.read_text(encoding="utf-8").replace(sync.BEGIN, "y" * 1300 + sync.DELIM + sync.BEGIN)
        self.user.write_text(grown, encoding="utf-8")
        sync.sync_file(self.store, self.user, heading=sync.USER_HEADING, enabled=True, limit=1375)
        self.assertNotIn(sync.BEGIN, self.user.read_text(encoding="utf-8"))

    def test_section_signs_and_new_lines_in_a_memory_cannot_split_an_entry(self) -> None:
        self._add_text("a", "first line\n\u00a7\nsecond line")
        sync.sync_file(self.store, self.user, heading=sync.USER_HEADING, enabled=True)
        entries = [e for e in self.user.read_text(encoding="utf-8").split(sync.DELIM) if e.strip()]
        self.assertEqual(len(entries), 1)

    def test_only_the_first_change_makes_a_backup(self) -> None:
        self.user.write_text("my notes\n", encoding="utf-8")
        for i in range(6):
            self._add_text(f"r{i}", f"Fact {i}")
            sync.sync_file(self.store, self.user, heading=sync.USER_HEADING, enabled=True)
        self.assertEqual(len(list(self.tmp.glob("USER.md.*.bak"))), 1)

    def test_old_style_blocks_are_replaced_and_removed(self) -> None:
        old = f"mine\n\n{sync._OLD_BEGIN}\n\n# User (confirmed)\n\n- old line\n\n{sync._OLD_END}\n"
        self.user.write_text(old, encoding="utf-8")
        self._add_text("a", "I live in Dhaka")
        sync.sync_file(self.store, self.user, heading=sync.USER_HEADING, enabled=True)
        text = self.user.read_text(encoding="utf-8")
        self.assertNotIn("old line", text)
        self.assertIn("mine", text)
        self.assertEqual(text.count(sync.BEGIN), 1)
        sync.sync_file(self.store, self.user, heading=sync.USER_HEADING, enabled=False)
        self.assertEqual(self.user.read_text(encoding="utf-8").strip(), "mine")

    def test_switching_off_leaves_an_empty_file_when_it_was_only_ours(self) -> None:
        self._add_text("a", "I live in Dhaka")
        sync.sync_file(self.store, self.user, heading=sync.USER_HEADING, enabled=True)
        sync.sync_file(self.store, self.user, heading=sync.USER_HEADING, enabled=False)
        self.assertEqual(self.user.read_text(encoding="utf-8").strip(), "")

    def test_moments_finished_to_dos_private_and_empty_stay_out(self) -> None:
        self._add_text("moment", "Felt tired this morning", tags=["moment"])
        self._add_text("done", "Buy milk", tags=["todo", "done"])
        self._add_text("secret", "My private thing", never_send=True)
        self._add_text("open", "Call the dentist", tags=["todo"])
        self._add_text("keep", "I study CSE")
        sync.sync_all(self.store, memory_path=self.memory, user_path=self.user, enabled=True)
        both = self.memory.read_text(encoding="utf-8") + self.user.read_text(encoding="utf-8")
        for gone in ("Felt tired", "Buy milk", "My private thing"):
            self.assertNotIn(gone, both)
        self.assertIn("Call the dentist", self.memory.read_text(encoding="utf-8"))
        self.assertIn("I study CSE", self.user.read_text(encoding="utf-8"))

    def test_limits_come_from_hermes_config(self) -> None:
        from unittest import mock

        from memory_ob import hermes

        home = self._home()
        (home / "config.yaml").write_text("memory:\n  memory_char_limit: 5000\n  user_char_limit: 3000\n", encoding="utf-8")
        with mock.patch.object(hermes, "HERMES_HOME", home):
            self.assertEqual(hermes.memory_limits(), (5000, 3000))
        with mock.patch.object(hermes, "HERMES_HOME", self.tmp / "none"):
            self.assertEqual(hermes.memory_limits(), (2200, 1375))

    def test_notes_follow_a_save_and_a_chat_without_waiting_for_the_nightly_run(self) -> None:
        from unittest import mock

        from memory_ob import hermes, nightshift, settings as settings_mod

        home = self._home(memories=True)
        self.store.close()
        self.store = Store(self.db)
        with mock.patch.object(hermes, "HERMES_HOME", home):
            # Off: nothing is written.
            self._add_text("a", "I live in Dhaka")
            self.assertIsNone(nightshift.refresh_hermes_notes(self.store, self.vault))
            self.assertFalse((home / "memories" / "USER.md").exists())
            # On: the next refresh writes it, and the one after a new memory updates it.
            self.vault.mkdir(parents=True, exist_ok=True)
            settings_mod.update(self.vault, sync_hermes=True)
            nightshift.refresh_hermes_notes(self.store, self.vault)
            self.assertIn("I live in Dhaka", (home / "memories" / "USER.md").read_text(encoding="utf-8"))
            self._add_text("b", "I have a sister called Mim")
            nightshift.refresh_hermes_notes(self.store, self.vault)
            self.assertIn("sister called Mim", (home / "memories" / "USER.md").read_text(encoding="utf-8"))

    def test_saving_in_the_app_updates_the_notes(self) -> None:
        from unittest import mock

        from memory_ob import hermes

        home = self._home(memories=True)
        client = self._client()
        with mock.patch.object(hermes, "HERMES_HOME", home):
            self.assertEqual(client.post("/api/settings", json={"sync_hermes": True}).status_code, 200)
            r = client.post("/api/tell", json={"text": "I live in Dhaka."})
            self.assertEqual(r.status_code, 200, r.text)
            self.assertIn("live in Dhaka", (home / "memories" / "USER.md").read_text(encoding="utf-8"))

    def test_a_windows_file_with_crlf_and_a_bom_is_still_read_as_entries(self) -> None:
        self.user.write_bytes("\ufeffLikes tea\r\n\u00a7\r\nDislikes noise\r\n".encode("utf-8"))
        self._add_text("a", "I live in Dhaka")
        sync.sync_file(self.store, self.user, heading=sync.USER_HEADING, enabled=True)
        raw = self.user.read_bytes()
        self.assertNotIn(b"\r\n", raw.split(sync.BEGIN.encode())[1])  # our entry is written with plain \n
        entries = [e.strip() for e in self.user.read_text(encoding="utf-8-sig").split(sync.DELIM) if e.strip()]
        self.assertEqual(entries[:2], ["Likes tea", "Dislikes noise"])


if __name__ == "__main__":
    unittest.main()
