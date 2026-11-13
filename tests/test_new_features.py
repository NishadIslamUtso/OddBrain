"""Moods, "forget", secrets, privacy, projects, to-dos, imports and meaning search."""

from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

from memory_ob import embedder, importers, manager, models  # noqa: E402
from memory_ob.store import Store  # noqa: E402


class Base(unittest.TestCase):
    def setUp(self) -> None:
        for key in ("MEMORY_OB_VAULT", "MEMORY_OB_DB", "MEMORY_OB_TOKEN", "MEMORY_OB_MODELS"):
            os.environ.pop(key, None)
        self.tmp = Path(tempfile.mkdtemp())
        self.vault = self.tmp / "V"
        self.store = Store(self.tmp / "m.db")
        self.addCleanup(self.store.close)

    def say(self, text: str, **kw):
        return manager.capture(self.store, text=text, vault=self.vault, **kw)

    def records(self, **kw):
        return self.store.list_records(include_private=True, **kw)

    def bodies(self, status: str | None = "active") -> list[str]:
        return [r.body for r in self.records(status=status)]


class Moments(Base):
    def test_a_mood_is_kept_as_a_dated_journal_moment(self) -> None:
        out = self.say("I feel so tired today.")
        self.assertEqual(out.saved, 1)
        rec = self.records()[0]
        self.assertEqual(rec.kind, "journal")
        self.assertIn("moment", rec.tags)
        self.assertTrue((self.vault / "Journal").is_dir())

    def test_a_mood_never_contradicts_a_lasting_fact(self) -> None:
        self.say("I am a happy person who lives in Dhaka.")
        out = self.say("I feel sad today.")
        self.assertEqual((out.saved, out.asked), (1, 0))

    def test_a_decision_is_not_just_a_mood(self) -> None:
        self.say("I decided to start running every morning.")
        self.assertNotIn("moment", self.records()[0].tags)


class Forget(Base):
    def test_forget_in_chat_removes_that_memory(self) -> None:
        self.say("I like mangoes.")
        out = self.say("Forget that I like mangoes.")
        self.assertEqual(out.forgotten, 1)
        self.assertEqual(self.bodies("active"), [])
        self.assertEqual(self.bodies("trash"), ["I like mangoes."])        # trashed, not destroyed

    def test_forget_that_matches_nothing_says_so_and_removes_nothing(self) -> None:
        self.say("I like mangoes.")
        out = self.say("Forget that I play cricket.")
        self.assertEqual((out.forgotten, out.forget_unclear), (0, 1))
        self.assertEqual(self.bodies("active"), ["I like mangoes."])

    def test_the_forget_sentence_is_not_itself_remembered(self) -> None:
        self.say("I like mangoes.")
        self.say("Forget that I like mangoes.")
        self.assertFalse(any("forget" in b.lower() for b in self.bodies(None)))


class Secrets(Base):
    def test_a_password_is_hidden_but_the_rest_is_kept(self) -> None:
        out = self.say("My email password is hunter2xyz99 and I live in Dhaka.")
        self.assertEqual(out.secret, 1)
        everything = " ".join(self.bodies(None))
        self.assertNotIn("hunter2xyz99", everything)
        self.assertIn("I live in Dhaka.", self.bodies())
        for conv in self.store.list_conversations(limit=10):
            self.assertNotIn("hunter2xyz99", conv.get("text", ""))

    def test_a_password_typed_into_an_edit_or_journal_is_hidden(self) -> None:
        rec = manager.add_journal_entry(self.store, "Wifi password is correcthorse9battery today", vault=self.vault)
        self.assertNotIn("correcthorse9battery", rec.body)
        other = self.say("I live in Dhaka.")
        rid = other.record_ids[0]
        edited = manager.edit_record(self.store, rid, body="I live in Dhaka, card 4111 1111 1111 1111", vault=self.vault)
        self.assertNotIn("4111 1111 1111 1111", edited.body)


class Grounding(Base):
    def test_a_claim_the_owner_never_said_is_dropped(self) -> None:
        def helper(prompt: str) -> str:
            return "I live in Dhaka.\nI am a surgeon at a big hospital."

        out = self.say("I live in Dhaka.", model_call=helper)
        self.assertEqual(out.saved, 1)
        self.assertEqual(out.ungrounded, 1)
        self.assertEqual(self.bodies(), ["I live in Dhaka."])

    def test_only_the_owners_side_of_a_chat_counts(self) -> None:
        parts = [{"role": "user", "content": "Hello there."},
                 {"role": "assistant", "content": "Do you live in Dhaka and work as a surgeon?"}]

        def helper(prompt: str) -> str:
            return "I work as a surgeon in Dhaka."

        out = manager.capture(self.store, parts=parts, model_call=helper, vault=self.vault)
        self.assertEqual(out.saved, 0)
        self.assertEqual(self.bodies(), [])


class Private(Base):
    def test_private_memories_vanish_everywhere_and_come_back(self) -> None:
        self.say("I need to renew my passport.")
        self.say("I live in Dhaka.")
        rid = next(r.id for r in self.records() if "passport" in r.body)
        self.assertTrue(manager.make_private(self.store, rid, vault=self.vault))
        self.assertNotIn(rid, [r.id for r in self.store.list_records()])
        self.assertEqual([h.id for h in self.store.search_all("passport")], [])
        self.assertEqual(manager.reminders(self.store), [])
        for note in self.vault.rglob("*.md"):
            self.assertNotIn("passport", note.read_text(encoding="utf-8").lower(), note)
        self.assertTrue(manager.bring_back(self.store, rid, vault=self.vault))
        self.assertTrue(any("passport" in r.body for r in self.store.list_records()))

    def test_never_send_text_is_not_in_reminders_or_meaning_embeddings(self) -> None:
        self.say("I need to renew my passport.")
        rid = self.records()[0].id
        manager.make_private(self.store, rid, vault=self.vault)
        self.assertEqual(self.store.missing_embeddings(model="nomic-embed-text"), [])


class ToDo(Base):
    def test_a_todo_is_listed_until_ticked_off(self) -> None:
        self.say("I need to renew my passport.")
        self.assertEqual([r["kind"] for r in manager.reminders(self.store)], ["todo"])
        rid = self.records()[0].id
        manager.mark_done(self.store, rid, vault=self.vault)
        self.assertEqual(manager.reminders(self.store), [])
        manager.mark_done(self.store, rid, done=False, vault=self.vault)
        self.assertEqual(len(manager.reminders(self.store)), 1)

    def test_a_revisit_day_that_has_come_is_listed(self) -> None:
        self.say("I'm thinking about starting a bakery business. I'll come back to this bakery idea in 2 weeks.")
        self.assertEqual(manager.reminders(self.store, today="2020-01-01"), [])
        items = manager.reminders(self.store, today="2099-01-01")
        self.assertEqual([i["kind"] for i in items], ["revisit"])


class Projects(Base):
    def test_a_project_gets_its_own_folder_and_hub_note(self) -> None:
        self.say("I'm thinking about starting a bakery business. I'll come back to this bakery idea in 2 weeks.")
        folder = self.vault / "Projects & Ideas" / "Bakery"
        self.assertTrue((folder / "Bakery.md").is_file())
        self.assertEqual(len(list(folder.glob("*.md"))), 2)
        self.say("The bakery budget is now 8 lakh.")
        self.assertEqual(len(list(folder.glob("*.md"))), 3)

    def test_a_changed_budget_is_asked_about(self) -> None:
        self.say("My budget for the bakery business is 5 lakh taka.")
        out = self.say("The bakery budget is now 8 lakh.")
        self.assertEqual(out.asked, 1)


class People(Base):
    def _chat(self, with_names: list[str]):
        parts = [{"role": "user", "content": "Hi, can you pay on Friday?"}]
        for n in with_names:
            parts.append({"role": "assistant", "name": n, "content": "Yes, I can pay on Friday."})
        return {"title": "WhatsApp: " + ", ".join(with_names), "when": "", "parts": parts,
                "people": with_names, "origin": "whatsapp"}

    def test_deleting_a_person_can_take_their_chats_and_undo_brings_all_back(self) -> None:
        manager.store_chats(self.store, [self._chat(["Karim"]), self._chat(["Karim", "Rina"])],
                            source_name="WhatsApp", vault=self.vault)
        karim = self.store.find_person("Karim")
        self.assertEqual(self.store.count_conversations(), 2)
        out = manager.delete_person(self.store, karim["id"], vault=self.vault, chats=True)
        self.assertEqual(out["chats_removed"], 1)                  # the group chat with Rina stays
        self.assertEqual(self.store.count_conversations(), 1)
        self.assertIsNone(self.store.find_person("Karim"))
        seq = self.store.list_changes(limit=1)[0]["seq"]
        manager.undo(self.store, seq, vault=self.vault)
        self.assertEqual(self.store.count_conversations(), 2)
        self.assertIsNotNone(self.store.find_person("Karim"))

    def test_deleting_a_person_alone_keeps_the_chats(self) -> None:
        manager.store_chats(self.store, [self._chat(["Karim"])], source_name="WhatsApp", vault=self.vault)
        manager.delete_person(self.store, self.store.find_person("Karim")["id"], vault=self.vault)
        self.assertEqual(self.store.count_conversations(), 1)

    def test_undoing_an_import_removes_its_chats_and_people(self) -> None:
        manager.store_chats(self.store, [self._chat(["Karim"])], source_name="WhatsApp", vault=self.vault)
        self.assertIsNotNone(self.store.find_person("Karim"))
        seq = self.store.list_changes(limit=1)[0]["seq"]
        manager.undo(self.store, seq, vault=self.vault)
        self.assertEqual(self.store.count_conversations(), 0)
        self.assertIsNone(self.store.find_person("Karim"))

    def test_chats_with_other_people_never_reach_recall_or_search(self) -> None:
        manager.store_chats(self.store, [self._chat(["Karim"])], source_name="WhatsApp", vault=self.vault)
        self.assertEqual(self.store.search_all("Friday pay"), [])      # a chat is not the owner's memory
        self.assertEqual(self.store.list_records(), [])


class Importing(unittest.TestCase):
    def test_binary_files_are_refused_in_plain_words(self) -> None:
        for name, data, word in [("a.pdf", b"%PDF-1.4 abc", "PDF"), ("a.png", b"\x89PNG\r\n\x1a\n....", "picture"),
                                 ("a.txt", b"abc\x00\x01\x02def", "not text")]:
            with self.assertRaises(importers.ImportError_) as ctx:
                importers.parse(name, data)
            self.assertIn(word, str(ctx.exception))

    def test_a_word_file_is_refused(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("word/document.xml", "<x/>")
        with self.assertRaises(importers.ImportError_) as ctx:
            importers.parse("a.docx", buf.getvalue())
        self.assertIn("Word", str(ctx.exception))

    def test_telegram(self) -> None:
        data = json.dumps({"name": "Karim", "type": "personal_chat", "messages": [
            {"id": 1, "type": "message", "from": "Karim", "text": "I can pay 20k for the website"},
            {"id": 2, "type": "message", "from": "Me", "text": ["deal ", {"type": "bold", "text": "thanks"}]},
            {"id": 3, "type": "service", "actor": "Me", "text": ""}]}).encode()
        parsed = importers.parse("result.json", data, me="Me")
        chat = parsed.chats[0]
        self.assertEqual((parsed.source, chat["origin"], chat["people"]), ("Telegram", "telegram", ["Karim"]))
        self.assertEqual([p["role"] for p in chat["parts"]], ["assistant", "user"])
        self.assertEqual(chat["parts"][1]["content"], "deal thanks")
        with self.assertRaises(importers.ImportError_):
            importers.parse("result.json", data, me="")               # asks who "you" are
        with self.assertRaises(importers.ImportError_):
            importers.parse("result.json", data, me="Someone Else")

    def _messenger(self, name: str = "Nishād Islam") -> bytes:
        def mangled(s: str) -> str:                       # Meta writes UTF-8 as if it were Latin-1
            return s.encode("utf-8").decode("latin-1")
        return json.dumps({"title": mangled("Karim"), "messages": [
            {"sender_name": mangled(name), "timestamp_ms": 2000, "content": mangled("আমি ঢাকায় থাকি")},
            {"sender_name": "Karim", "timestamp_ms": 1000, "content": "hi"}]}).encode()

    def test_messenger_text_is_repaired_and_put_in_order(self) -> None:
        parsed = importers.parse("message_1.json", self._messenger(), me="Nishād Islam")
        chat = parsed.chats[0]
        self.assertEqual(parsed.source, "Messenger")
        self.assertEqual([p["content"] for p in chat["parts"]], ["hi", "আমি ঢাকায় থাকি"])   # oldest first
        self.assertEqual(chat["people"], ["Karim"])

    def test_an_instagram_zip_is_read(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("your_instagram_activity/messages/inbox/karim_1/message_1.json", self._messenger())
        parsed = importers.parse("instagram.zip", buf.getvalue(), me="Nishād Islam")
        self.assertEqual((parsed.source, parsed.chats[0]["origin"]), ("Instagram", "instagram"))

    def test_a_long_note_is_split_not_dropped(self) -> None:
        long = " ".join(f"On day {i} I walked by the river and thought about things." for i in range(60))
        pieces = importers.split_notes(long + "\n\nA short note is fine.")
        self.assertGreater(len(pieces), 2)
        self.assertTrue(all(len(p) <= 1000 for p in pieces))
        self.assertIn("A short note is fine.", pieces)
        self.assertEqual(" ".join(pieces[:-1]).count("by the river"), 60)           # nothing was lost


class FakeBackend:
    name = "fake"

    def __init__(self) -> None:
        self.calls: list[str] = []

    def chat(self, slot, messages):  # pragma: no cover
        return ""

    def embed(self, slot, text):
        self.calls.append(text)
        return [1.0, 0.0, 0.0] if "tea" in text.lower() else [0.0, 1.0, 0.0]


class Meaning(Base):
    def test_prefixes_follow_the_model(self) -> None:
        self.assertEqual(models.embed_prefix("nomic-embed-text-v2-moe", "document"), "search_document: ")
        self.assertEqual(models.embed_prefix("hf.co/nomic-ai/nomic-embed-text-v2-moe-GGUF:F16", "query"),
                         "search_query: ")
        self.assertEqual(models.embed_prefix("nomic-embed-text", "query"), "search_query: ")
        self.assertTrue(models.embed_prefix("mxbai-embed-large", "query"))
        self.assertEqual(models.embed_prefix("mxbai-embed-large", "document"), "")
        self.assertEqual(models.embed_prefix("bge-m3", "query"), "")

    def test_records_and_questions_are_sent_with_the_prefix(self) -> None:
        self.say("I love green tea.")
        backend = FakeBackend()
        slot = models.ModelSlot(provider="ollama", model="nomic-embed-text-v2-moe")
        embedder.ensure_embeddings(self.store, backend=backend, slot=slot)
        self.assertTrue(backend.calls[0].startswith("search_document: "))
        embedder.combined_search(self.store, "tea", backend=backend, slot=slot)
        self.assertTrue(backend.calls[-1].startswith("search_query: "))

    def test_switching_the_model_redoes_the_numbers_and_ignores_the_old_ones(self) -> None:
        self.say("I love green tea.")
        a = models.ModelSlot(provider="ollama", model="nomic-embed-text")
        b = models.ModelSlot(provider="ollama", model="nomic-embed-text-v2-moe")
        backend = FakeBackend()
        self.assertEqual(embedder.ensure_embeddings(self.store, backend=backend, slot=a), 1)
        self.assertEqual(embedder.ensure_embeddings(self.store, backend=backend, slot=a), 0)
        self.assertEqual(self.store.count_embeddings("nomic-embed-text-v2-moe"), 0)
        self.assertFalse(embedder.semantic_available(self.store, backend=backend, slot=b))
        self.assertEqual(embedder.ensure_embeddings(self.store, backend=backend, slot=b), 1)
        self.assertEqual(self.store.count_embeddings("nomic-embed-text-v2-moe"), 1)
        self.assertTrue(embedder.semantic_available(self.store, backend=backend, slot=b))

    def test_an_edited_memory_is_embedded_again(self) -> None:
        out = self.say("I love green tea.")
        backend = FakeBackend()
        slot = models.ModelSlot(provider="ollama", model="nomic-embed-text")
        embedder.ensure_embeddings(self.store, backend=backend, slot=slot)
        import time
        time.sleep(1.1)                                       # timestamps are in whole seconds
        manager.edit_record(self.store, out.record_ids[0], body="I love black coffee.", vault=self.vault)
        self.assertEqual(self.store.missing_embeddings(model="nomic-embed-text"), out.record_ids)

    def test_long_text_is_cut_before_it_is_sent(self) -> None:
        self.assertLessEqual(len(embedder.embedding_text(type("R", (), {"title": "t", "body": "x" * 9000})())), 1500)

    def test_the_night_shift_prepares_meaning_search(self) -> None:
        from unittest import mock
        from memory_ob import nightshift
        from memory_ob.config import Settings

        self.say("I love green tea.")
        self.store.close()
        settings = Settings(vault=self.vault, db=self.tmp / "m.db", token_path=self.tmp / "token",
                            models_path=self.tmp / "models.json")
        with mock.patch.object(models, "resolve_backend", lambda cfg=None: FakeBackend()), \
                mock.patch.object(models, "helper", lambda cfg, name: None):
            steps = {s["step"]: s for s in nightshift.run(settings, skip=("hermes", "biography"))}
        self.assertEqual(steps["embed"]["ok"], "yes", steps["embed"])
        self.assertIn("1 prepared", steps["embed"]["detail"])
        with Store(self.tmp / "m.db") as st:
            self.assertEqual(st.count_embeddings("nomic-embed-text"), 1)
        self.store = Store(self.tmp / "m.db")


if __name__ == "__main__":
    unittest.main()
