"""Bringing things in (ChatGPT, Claude, WhatsApp, notes) and moving an old vault."""

from __future__ import annotations

import base64
import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from memory_ob import importers  # noqa: E402


def chatgpt_export() -> bytes:
    def node(parent, role, text):
        return {"parent": parent, "message": {"author": {"role": role}, "content": {"parts": [text]}, "create_time": 1}}

    mapping = {
        "root": {"parent": None, "message": None},
        "a": node("root", "system", "You are ChatGPT"),
        "b": node("a", "user", "I am planning a bakery"),
        "c": node("b", "assistant", "Great idea"),
        "d": node("c", "user", "I will come back to it in a year"),
    }
    return json.dumps([{"title": "Bakery idea", "create_time": 1700000000, "current_node": "d",
                        "mapping": mapping}]).encode()


def claude_export() -> bytes:
    return json.dumps([{"name": "Gym plan", "created_at": "2025-01-02T03:04:05Z", "chat_messages": [
        {"sender": "human", "text": "I train three days a week"},
        {"sender": "assistant", "text": "Nice"},
    ]}]).encode()


WHATSAPP = (
    "12/03/2025, 10:15 - Riya: Are we still on for Friday?\n"
    "12/03/2025, 10:16 - Nishad: Yes, see you there\n"
    "12/03/2025, 10:17 - Riya: Great\nbring the notes\n"
    "12/03/2025, 10:18 - Riya: <Media omitted>\n"
).encode()


class Parsing(unittest.TestCase):
    def test_chatgpt_follows_the_branch_you_actually_had_and_skips_the_system_prompt(self) -> None:
        parsed = importers.parse("conversations.json", chatgpt_export())
        self.assertEqual(parsed.source, "ChatGPT")
        chat = parsed.chats[0]
        self.assertEqual(chat["title"], "Bakery idea")
        self.assertEqual([p["role"] for p in chat["parts"]], ["user", "assistant", "user"])
        self.assertNotIn("You are ChatGPT", json.dumps(chat))

    def test_claude(self) -> None:
        parsed = importers.parse("conversations.json", claude_export())
        self.assertEqual((parsed.source, parsed.chats[0]["title"]), ("Claude", "Gym plan"))

    def test_the_official_zip_is_understood(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("export/conversations.json", chatgpt_export())
            zf.writestr("export/chat.html", "<html></html>")
        parsed = importers.parse("export.zip", buf.getvalue())
        self.assertEqual(len(parsed.chats), 1)

    def test_whatsapp_needs_your_name_and_finds_the_other_people(self) -> None:
        with self.assertRaises(importers.ImportError_) as ctx:
            importers.parse("WhatsApp Chat with Riya.txt", WHATSAPP)
        self.assertIn("Riya", str(ctx.exception))                # tells you the names it found
        with self.assertRaises(importers.ImportError_):
            importers.parse("WhatsApp Chat with Riya.txt", WHATSAPP, me="Someone Else")
        parsed = importers.parse("WhatsApp Chat with Riya.txt", WHATSAPP, me="nishad")
        chat = parsed.chats[0]
        self.assertEqual(chat["people"], ["Riya"])
        self.assertEqual(chat["title"], "WhatsApp: Riya")
        texts = [p["content"] for p in chat["parts"]]
        self.assertIn("Great\nbring the notes", texts)             # a wrapped line stays in its message
        self.assertFalse(any("omitted" in t for t in texts))
        self.assertEqual(chat["parts"][1]["role"], "user")

    def test_notes_files(self) -> None:
        parsed = importers.parse("notes.md", b"# Notes\n- I speak Bangla\n- I speak English\n- hi\n")
        self.assertEqual(parsed.notes, ["I speak Bangla", "I speak English"])
        memory = importers.parse("MEMORY.md", "I like tea\n§\nI study CSE at BRAC University\n".encode())
        self.assertEqual(memory.source, "a memory file")
        self.assertEqual(len(memory.notes), 2)

    def test_pasted_text(self) -> None:
        self.assertEqual(importers.parse_text("I like tea\n\nI study CSE at BRAC").notes,
                         ["I like tea", "I study CSE at BRAC"])

    def test_every_bad_file_gets_a_plain_message(self) -> None:
        cases = {
            "empty": ("a.txt", b""),
            "damaged json": ("a.json", b"{not json"),
            "unknown json": ("a.json", b'[{"hello": 1}]'),
            "bad zip": ("a.zip", b"PK\x03\x04garbage"),
            "zip without chats": ("a.zip", self._zip({"readme.txt": "x"})),
            "nothing to remember": ("a.txt", b"ok\n\nhi"),
        }
        for label, (name, data) in cases.items():
            with self.assertRaises(importers.ImportError_, msg=label) as ctx:
                importers.parse(name, data)
            self.assertTrue(str(ctx.exception).endswith((".", "?")), f"{label}: {ctx.exception}")

    def test_oversized_files_are_refused(self) -> None:
        with mock.patch.object(importers, "MAX_FILE_BYTES", 10):
            with self.assertRaises(importers.ImportError_):
                importers.parse("a.txt", b"x" * 11)

    @staticmethod
    def _zip(files: dict[str, str]) -> bytes:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            for k, v in files.items():
                zf.writestr(k, v)
        return buf.getvalue()


class Importing(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = os.path.join(self.tmp, "vault")
        self.db = os.path.join(self.tmp, "mob.db")
        from memory_ob import api

        self._prev = api.settings
        api.configure(api.Settings.resolve(
            vault=self.vault, db=self.db, models_path=os.path.join(self.tmp, "models.json")))
        from tests.helpers import AuthedClient

        self.client = AuthedClient.create(api.create_app(), self.vault)

    def tearDown(self) -> None:
        from memory_ob import api

        api.configure(self._prev)

    def upload(self, name: str, data: bytes, **extra):
        return self.client.post("/api/import", json={"name": name, "data_b64": base64.b64encode(data).decode(), **extra})

    def test_a_whatsapp_chat_becomes_a_person_with_a_raw_conversation(self) -> None:
        r = self.upload("WhatsApp Chat with Riya.txt", WHATSAPP, me="Nishad")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["chats"]["people"], ["Riya"])
        [person] = self.client.get("/api/people").json()["people"]
        self.assertEqual(person["name"], "Riya")
        detail = self.client.get(f"/api/people/{person['id']}").json()
        self.assertEqual(detail["conversation_list"][0]["platform"], "WhatsApp")
        raw = self.client.get(f"/api/conversations/{detail['conversation_list'][0]['id']}").json()
        self.assertIn("Are we still on for Friday?", raw["text"])

    def test_the_original_file_is_kept_untouched(self) -> None:
        self.upload("conversations.json", chatgpt_export())
        kept = list((Path(self.vault) / "Sources" / "Files").iterdir())
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0].read_bytes(), chatgpt_export())

    def test_importing_the_same_export_twice_adds_nothing(self) -> None:
        first = self.upload("conversations.json", chatgpt_export()).json()
        second = self.upload("conversations.json", chatgpt_export()).json()
        self.assertEqual(first["chats"]["conversations"], 1)
        self.assertEqual((second["chats"]["conversations"], second["chats"]["already"]), (0, 1))
        self.assertEqual(self.client.get("/api/conversations").json()["total"], 1)
        self.assertIn("already here", second["message"])

    def test_a_chat_export_is_not_read_when_there_is_no_helper_but_is_kept(self) -> None:
        r = self.upload("conversations.json", claude_export()).json()
        self.assertIn("read once an AI helper", r["message"])
        self.assertEqual(self.client.get("/api/status").json()["waiting"], 1)

    def test_a_bad_file_is_refused_and_nothing_is_stored(self) -> None:
        r = self.upload("broken.json", b"{nope")
        self.assertEqual(r.status_code, 400)
        self.assertIn("damaged", r.json()["detail"])
        self.assertEqual(self.client.get("/api/conversations").json()["total"], 0)

    def test_importing_while_paused_is_refused(self) -> None:
        self.client.post("/api/anonymous", json={"anonymous": True})
        r = self.upload("notes.md", b"- I speak Bangla\n- I speak English\n")
        self.assertEqual(r.status_code, 409)
        self.assertIn("paused", r.json()["detail"])


class Migration(unittest.TestCase):
    """An old numbered-folder vault is moved to the new layout, losing nothing."""

    def setUp(self) -> None:
        from memory_ob.config import Settings
        from memory_ob.store import Store
        from tests.test_laws import make_record

        self.tmp = Path(tempfile.mkdtemp())
        self.vault = self.tmp / "vault"
        self.settings = Settings.resolve(vault=self.vault, db=self.vault / ".brain" / "memory_ob.db")
        for name in ("01 Inbox", "03 Memory", "07 Sharing Receipts", "10 People", "08 Journal"):
            (self.vault / name).mkdir(parents=True)
        (self.vault / ".brain").mkdir(exist_ok=True)
        (self.vault / "01 Inbox" / "resume.pdf").write_bytes(b"%PDF original bytes")
        (self.vault / "03 Memory" / "old-note.md").write_text("---\nid: x\n---\nold", encoding="utf-8")
        (self.vault / "07 Sharing Receipts" / "r1.md").write_text("receipt", encoding="utf-8")
        (self.vault / "MANIFEST.json").write_text("{}", encoding="utf-8")
        self.store = Store(self.settings.db)
        self.rec = make_record(title="I have a peanut allergy", body="I have a peanut allergy")
        self.store.add_record(self.rec)

    def tearDown(self) -> None:
        self.store.close()

    def test_nothing_is_lost_and_a_backup_comes_first(self) -> None:
        from memory_ob import vault

        self.assertTrue(vault.is_legacy(self.vault))
        info = vault.migrate_legacy(self.store, self.vault)
        self.assertTrue(info["migrated"])

        with zipfile.ZipFile(info["backup"]) as zf:                 # the safety copy is complete
            names = set(zf.namelist())
            self.assertIsNone(zf.testzip())
        self.assertIn("01 Inbox/resume.pdf", names)
        self.assertIn("03 Memory/old-note.md", names)

        self.assertEqual((self.vault / "Sources" / "Files" / "resume.pdf").read_bytes(), b"%PDF original bytes")
        self.assertTrue((self.vault / ".brain" / "receipts" / "r1.md").is_file())
        self.assertTrue((self.vault / ".brain" / "old-layout" / "03 Memory" / "old-note.md").is_file())
        self.assertFalse(vault.is_legacy(self.vault))
        self.assertEqual(self.store.get_record(self.rec.id).body, "I have a peanut allergy")   # the data itself
        self.assertEqual(len(list((self.vault / "Health").glob("*.md"))), 1)                  # and its new note

    def test_a_second_run_does_nothing(self) -> None:
        from memory_ob import vault

        vault.migrate_legacy(self.store, self.vault)
        self.assertEqual(vault.migrate_legacy(self.store, self.vault), {"migrated": False})

    def test_if_the_backup_cannot_be_made_nothing_moves(self) -> None:
        from memory_ob import vault

        with mock.patch.object(vault, "_backup", side_effect=RuntimeError("disk full")):
            with self.assertRaises(RuntimeError):
                vault.migrate_legacy(self.store, self.vault)
        self.assertTrue((self.vault / "01 Inbox" / "resume.pdf").is_file())
        self.assertTrue((self.vault / "03 Memory" / "old-note.md").is_file())
        self.assertTrue(vault.is_legacy(self.vault))

    def test_startup_does_it_and_a_fresh_vault_is_left_alone(self) -> None:
        from memory_ob import startup
        from memory_ob.config import Settings

        startup.prepare(self.settings)
        self.assertTrue((self.vault / "Sources" / "Files" / "resume.pdf").is_file())
        fresh = Settings.resolve(vault=self.tmp / "fresh", db=self.tmp / "fresh" / ".brain" / "m.db")
        startup.prepare(fresh)
        self.assertFalse((self.tmp / "fresh" / ".brain" / "old-layout").exists())


if __name__ == "__main__":
    unittest.main()
