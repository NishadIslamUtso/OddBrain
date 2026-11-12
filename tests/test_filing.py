"""The AI files what you say by itself — and asks only when it should.

These replace the old "every memory waits for a signature" tests. Truth is
still a signature (only ``Store.sign_record`` makes it), but the AI now signs
silently for things that are clearly new, and every change lands in the feed
where it can be undone.
"""

from __future__ import annotations

import ast
import os
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob import doubts, feed, manager  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402


class FilingCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = Path(self.tmp) / "vault"
        self.db = Path(self.tmp) / "mob.db"
        self.settings = Settings.resolve(vault=self.vault, db=self.db)
        self.settings.ensure_dirs()
        self.store = Store(self.db)

    def tearDown(self) -> None:
        self.store.close()

    def tell(self, text: str, **kw):
        return manager.capture(self.store, text=text, vault=self.vault, **kw)

    def active(self):
        return self.store.list_records(status="active")


class ColdStart(FilingCase):
    def test_an_empty_vault_can_produce_truth(self) -> None:
        out = self.tell("I do not eat dairy")
        self.assertEqual(out.saved, 1)
        rec = self.active()[0]
        self.assertTrue(rec.is_truth)
        self.assertTrue(rec.confirmed_by.startswith("ai@"), rec.confirmed_by)

    def test_the_raw_conversation_is_kept_and_linked(self) -> None:
        out = self.tell("I prefer dark mode")
        rec = self.active()[0]
        self.assertEqual(rec.source.get("conversation_id"), out.conversation_id)
        conv = self.store.get_conversation(out.conversation_id)
        self.assertIn("I prefer dark mode", conv["text"])

    def test_the_kind_comes_from_the_text(self) -> None:
        self.tell("I prefer dark mode")
        self.assertEqual(self.active()[0].kind, "profile")

    def test_every_filing_is_in_the_feed_and_credited_to_the_ai(self) -> None:
        self.tell("I always drink tea in the morning")
        item = feed.build(self.store)[0]
        self.assertEqual((item["verb"], item["by"]), ("Remembered", "AI"))
        self.assertTrue(item["can_undo"])

    def test_saying_it_twice_remembers_it_once(self) -> None:
        self.tell("I prefer dark mode")
        out = self.tell("I prefer dark mode")
        self.assertEqual((out.saved, out.duplicates), (0, 1))
        self.assertEqual(len(self.active()), 1)

    def test_a_note_lands_in_a_category_folder_in_the_vault(self) -> None:
        self.tell("I have a peanut allergy")
        notes = [p for p in (self.vault / "Health").glob("*.md") if "peanut" in p.read_text(encoding="utf-8")]
        self.assertEqual(len(notes), 1)


class SafetyNets(FilingCase):
    def test_a_password_is_never_saved(self) -> None:
        out = self.tell("My bank password is hunter2hunter2!")
        self.assertEqual(self.active(), [])
        self.assertEqual((out.saved, out.secret), (0, 1))
        self.assertIn("password", manager.describe(out))

    def test_a_password_is_not_kept_in_readable_form_anywhere(self) -> None:
        out = self.tell("I train on Mondays. My bank password is hunter2hunter2!")
        self.assertEqual(out.saved, 1)
        conv = self.store.get_conversation(out.conversation_id)
        self.assertNotIn("hunter2", conv["text"])
        for path in self.vault.rglob("*"):
            if path.is_file() and path.suffix in (".md", ".json"):
                self.assertNotIn("hunter2", path.read_text(encoding="utf-8"), str(path))

    def test_a_password_in_an_imported_chat_is_hidden_too(self) -> None:
        chats = [{"title": "x", "origin": "ChatGPT", "people": [],
                  "parts": [{"role": "user", "content": "my api key is sk-abcdefghijklmnop1234"}]}]
        manager.store_chats(self.store, chats, source_name="ChatGPT", vault=self.vault)
        self.assertNotIn("sk-abcdefghijklmnop1234", self.store.list_conversations()[0]["text"])

    def test_never_remember_words_are_respected(self) -> None:
        out = self.tell("I won the lottery last week", guardrails=["lottery"])
        self.assertEqual((out.saved, out.blocked), (0, 1))
        self.assertEqual(self.active(), [])

    def test_nothing_in_a_message_is_not_an_error(self) -> None:
        out = self.tell("   ")
        self.assertEqual(out.saved + out.asked + out.waiting, 0)
        self.assertEqual(manager.describe(out), "There was nothing in that to remember.")


class Unsure(FilingCase):
    def test_a_hedged_statement_is_not_filed_until_you_say_so(self) -> None:
        out = self.tell("Maybe I will move to Canada next year")
        self.assertEqual((out.saved, out.unsure), (0, 1))
        self.assertEqual(self.active(), [])
        fid = self.store.list_facts(status="unsure")[0]["id"]

        manager.keep_unsure(self.store, fid, vault=self.vault)
        self.assertEqual(len(self.active()), 1)
        self.assertEqual(self.store.get_fact(fid)["status"], "promoted")

    def test_skipping_keeps_the_words_but_not_a_memory(self) -> None:
        self.tell("Maybe I will move to Canada next year")
        fid = self.store.list_facts(status="unsure")[0]["id"]
        manager.skip_unsure(self.store, fid)
        self.assertEqual(self.store.get_fact(fid)["status"], "rejected")
        self.assertIn("Canada", self.store.get_fact(fid)["text"])
        self.assertEqual(self.active(), [])

    def test_keeping_one_that_conflicts_still_asks(self) -> None:
        self.tell("I live in Dhaka")
        self.tell("Maybe I no longer live in Dhaka")
        fid = self.store.list_facts(status="unsure")[0]["id"]
        manager.keep_unsure(self.store, fid, vault=self.vault)
        self.assertEqual(len(doubts.list_doubts(self.store)), 1)


class NoHelper(FilingCase):
    """With no AI helper, plain first-person statements are filed by simple rules."""

    def test_something_it_cannot_judge_waits_for_a_helper(self) -> None:
        out = self.tell("Riya's brother is a doctor in Sylhet")
        self.assertEqual((out.saved, out.waiting), (0, 1))
        self.assertEqual(self.store.count_unprocessed_conversations(), 1)

    def test_waiting_conversations_are_read_when_a_helper_appears(self) -> None:
        self.tell("Riya's brother is a doctor in Sylhet")
        calls: list[str] = []

        def helper(prompt: str) -> str:
            calls.append(prompt)
            return ('{"claims": [{"text": "Riya\'s brother is a doctor in Sylhet.", "kind": "note", '
                    '"people": ["Riya"]}]}')

        out = manager.process_waiting(self.store, model_call=helper, vault=self.vault)
        self.assertTrue(calls)
        self.assertEqual((out.read, out.saved), (1, 1))
        self.assertEqual(self.store.count_unprocessed_conversations(), 0)

    def test_a_helper_that_is_not_answering_changes_nothing(self) -> None:
        self.tell("Riya's brother is a doctor in Sylhet")

        def broken(prompt: str) -> str:
            raise RuntimeError("down")

        out = manager.process_waiting(self.store, model_call=broken, vault=self.vault)
        self.assertEqual(out.read, 0)
        self.assertEqual(self.store.count_unprocessed_conversations(), 1)


class Conflicts(FilingCase):
    def setUp(self) -> None:
        super().setUp()
        self.tell("I live in Dhaka")

    def test_a_changed_answer_asks_and_leaves_the_old_one_alone(self) -> None:
        out = self.tell("I no longer live in Dhaka")
        self.assertEqual((out.saved, out.asked), (0, 1))
        self.assertEqual([r.body for r in self.active()], ["I live in Dhaka"])
        [d] = doubts.list_doubts(self.store)
        self.assertEqual(d["before"], "I live in Dhaka")
        self.assertEqual({o["key"] for o in d["options"]}, {"new", "old", "both"})

    def test_new_replaces_the_old_and_can_be_undone(self) -> None:
        self.tell("I no longer live in Dhaka")
        [d] = doubts.list_doubts(self.store)
        doubts.answer(self.store, d["id"], "new", vault=self.vault)
        self.assertEqual([r.body for r in self.active()], ["I no longer live in Dhaka"])

        change = next(i for i in feed.build(self.store) if i["verb"] == "Updated")
        self.assertEqual(change["was"], "I live in Dhaka")
        manager.undo(self.store, change["seq"], vault=self.vault)
        self.assertEqual([r.body for r in self.active()], ["I live in Dhaka"])

    def test_old_keeps_things_as_they_were(self) -> None:
        self.tell("I no longer live in Dhaka")
        [d] = doubts.list_doubts(self.store)
        doubts.answer(self.store, d["id"], "old", vault=self.vault)
        self.assertEqual([r.body for r in self.active()], ["I live in Dhaka"])
        self.assertEqual(doubts.list_doubts(self.store), [])
        # and it does not ask again about the same words
        out = self.tell("I no longer live in Dhaka")
        self.assertEqual(out.saved, 0)

    def test_both_keeps_both(self) -> None:
        self.tell("I live in Chittagong during term and I no longer live in Dhaka")
        [d] = doubts.list_doubts(self.store)
        doubts.answer(self.store, d["id"], "both", vault=self.vault)
        self.assertEqual(len(self.active()), 2)

    def test_two_clauses_about_the_same_thing_are_one_question(self) -> None:
        out = self.tell("I moved to Chittagong and I no longer live in Dhaka")
        self.assertEqual(out.asked, 1)
        [d] = doubts.list_doubts(self.store)
        self.assertIn("Chittagong", d["after"])
        self.assertIn("no longer live in Dhaka", d["after"])

    def test_a_question_is_answered_once(self) -> None:
        self.tell("I no longer live in Dhaka")
        [d] = doubts.list_doubts(self.store)
        doubts.answer(self.store, d["id"], "old", vault=self.vault)
        self.assertEqual(doubts.answer(self.store, d["id"], "new", vault=self.vault)["result"], "gone")
        self.assertEqual([r.body for r in self.active()], ["I live in Dhaka"])

    def test_a_bad_answer_or_unknown_question_is_refused(self) -> None:
        self.tell("I no longer live in Dhaka")
        [d] = doubts.list_doubts(self.store)
        with self.assertRaises(ValueError):
            doubts.answer(self.store, d["id"], "maybe", vault=self.vault)
        with self.assertRaises(LookupError):
            doubts.answer(self.store, "nope", "new", vault=self.vault)

    def test_unrelated_statements_never_ask(self) -> None:
        out = self.tell("I enjoy chess and I study computer science")
        self.assertEqual(out.asked, 0)
        self.assertEqual(doubts.list_doubts(self.store), [])


class OwnerControl(FilingCase):
    def test_edit_forget_and_undo(self) -> None:
        self.tell("I prefer dark mode")
        rec = self.active()[0]
        manager.edit_record(self.store, rec.id, body="I prefer light mode", vault=self.vault)
        self.assertEqual(self.store.get_record(rec.id).body, "I prefer light mode")

        manager.forget_record(self.store, rec.id, vault=self.vault)
        self.assertEqual(self.active(), [])
        removed = next(i for i in feed.build(self.store) if i["verb"] == "Removed")
        manager.undo(self.store, removed["seq"], vault=self.vault)
        self.assertEqual(self.store.get_record(rec.id).status, "active")

    def test_a_change_cannot_be_undone_after_a_later_change(self) -> None:
        self.tell("I prefer dark mode")
        rec = self.active()[0]
        created = feed.build(self.store)[0]
        manager.edit_record(self.store, rec.id, body="I prefer light mode", vault=self.vault)
        self.assertEqual(manager.undo(self.store, created["seq"], vault=self.vault)["result"], "changed_since")

    def test_undo_of_something_unknown_is_a_lookup_error(self) -> None:
        with self.assertRaises(LookupError):
            manager.undo(self.store, 99999, vault=self.vault)

    def test_a_journal_entry_keeps_its_own_date(self) -> None:
        rec = manager.add_journal_entry(self.store, "Started my first job", day="2024-03-01", vault=self.vault)
        self.assertEqual(rec.event_time, "2024-03-01")
        self.assertEqual(rec.kind, "journal")


class People(FilingCase):
    def test_a_named_person_gets_a_profile_and_the_same_person_can_be_joined(self) -> None:
        self.store.upsert_person("Riya")
        self.store.upsert_person("Riya Rahman")
        a, b = self.store.find_person("Riya"), self.store.find_person("Riya Rahman")
        info = manager.merge_people(self.store, a["id"], b["id"], vault=self.vault)
        self.assertIsNotNone(info)
        self.assertEqual(len(self.store.list_people()), 1)
        self.assertIn("Riya Rahman", self.store.get_person(a["id"])["aliases"])

        merge = next(i for i in feed.build(self.store) if i["verb"] == "Joined two profiles")
        manager.undo(self.store, merge["seq"], vault=self.vault)
        self.assertEqual(len(self.store.list_people()), 2)


class Importing(FilingCase):
    def test_imported_notes_are_filed_and_repeats_skipped(self) -> None:
        res = manager.import_notes(self.store, ["I speak Bangla", "I speak English"], source_name="notes.md",
                                   vault=self.vault)
        self.assertEqual(res["saved"], 2)
        again = manager.import_notes(self.store, ["I speak Bangla"], source_name="notes.md", vault=self.vault)
        self.assertEqual((again["saved"], again["duplicates"]), (0, 1))

    def test_import_skips_secrets_and_never_remember_words(self) -> None:
        res = manager.import_notes(
            self.store, ["my password is hunter2hunter2!", "I love the lottery", "I like tea"],
            source_name="x", vault=self.vault, guardrails=["lottery"],
        )
        self.assertEqual((res["saved"], res["skipped"]), (1, 2))

    def test_an_import_can_be_undone_as_one_step(self) -> None:
        manager.import_notes(self.store, ["I speak Bangla", "I speak English"], source_name="notes.md",
                             vault=self.vault)
        item = next(i for i in feed.build(self.store) if i["verb"] == "Brought in")
        self.assertIn("2 memories", item["text"])
        manager.undo(self.store, item["seq"], vault=self.vault)
        self.assertEqual(self.active(), [])

    def test_chats_are_kept_raw_with_the_people_in_them(self) -> None:
        chats = [{"title": "Trip plans", "origin": "WhatsApp", "people": ["Riya"],
                  "parts": [{"role": "user", "content": "Let us go to Cox's Bazar"},
                            {"role": "assistant", "content": "Sounds good"}]}]
        res = manager.store_chats(self.store, chats, source_name="WhatsApp", vault=self.vault)
        self.assertEqual((res["conversations"], res["people"]), (1, ["Riya"]))
        conv = self.store.list_conversations()[0]
        self.assertIn("Cox's Bazar", conv["text"])
        self.assertEqual(self.store.count_unprocessed_conversations(), 1)
        self.assertTrue((self.vault / "People").glob("*.md"))


class AgentCannotSign(unittest.TestCase):
    def test_the_provider_exposes_no_signature_tool(self) -> None:
        """The agent's tools import the library; there is no remember/sign tool."""
        src = (PROJECT / "provider" / "memory_ob" / "__init__.py").read_text(encoding="utf-8")
        names: list[str] = []
        for node in ast.walk(ast.parse(src)):
            if isinstance(node, ast.Assign):
                for t in node.targets:
                    if isinstance(t, ast.Name) and t.id.endswith("_SCHEMA"):
                        names.append(t.id)
        self.assertTrue(names)
        for n in names:
            for bad in ("REMEMBER", "SIGN", "CONFIRM", "ANSWER", "MERGE"):
                self.assertNotIn(bad, n)

    def test_the_store_has_no_cardless_approval(self) -> None:
        """The trap law: sign_record is the only thing that makes truth."""
        self.assertFalse(hasattr(Store, "approve_without_card"))
        self.assertTrue(hasattr(Store, "sign_record"))


class Questions(FilingCase):
    """Two waiting facts that are really the same thing can be joined by a question."""

    def test_merging_two_facts_actually_does_something(self) -> None:
        from memory_ob.review import MERGE_IT, CardStore

        a = self.store.add_fact("I prefer dark mode", trust=0.45)
        b = self.store.add_fact("I prefer dark mode on every machine", trust=0.45)
        cards = CardStore(self.store)
        card = cards.propose_merge(record_id=a, other_id=b, title="Duplicate")
        cards.resolve(card.id, MERGE_IT, by="owner")
        self.assertEqual(self.store.get_fact(b)["status"], "merged")
        self.assertEqual(self.store.get_fact(a)["status"], "candidate")

    def test_merging_two_records_still_works(self) -> None:
        from memory_ob.records import Record
        from memory_ob.review import MERGE_IT, CardStore

        a = Record(id="rec-a", kind="note", subject="self", speaker="user", body="a", trust=0.9)
        b = Record(id="rec-b", kind="note", subject="self", speaker="user", body="b", trust=0.9)
        self.store.add_record(a, changed_by="owner")
        self.store.add_record(b, changed_by="owner")
        cards = CardStore(self.store)
        card = cards.propose_merge(record_id="rec-a", other_id="rec-b")
        cards.resolve(card.id, MERGE_IT, by="owner")
        self.assertEqual(self.store.get_record("rec-b").status, "superseded")
        self.assertIn("rec-b", self.store.get_record("rec-a").links.get("merged", []))


class HttpCase(unittest.TestCase):
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

    def test_an_unsure_statement_is_listed_and_can_be_kept(self) -> None:
        self.client.post("/api/tell", json={"text": "Maybe I will move to Canada next year"})
        unsure = self.client.get("/api/unsure").json()["unsure"]
        self.assertEqual(len(unsure), 1)
        r = self.client.post(f"/api/unsure/{unsure[0]['id']}/keep")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.client.get("/api/unsure").json()["unsure"], [])
        self.assertEqual(len(self.client.get("/api/records").json()), 1)

    def test_an_unsure_statement_can_be_skipped(self) -> None:
        self.client.post("/api/tell", json={"text": "Maybe I will move to Canada next year"})
        fid = self.client.get("/api/unsure").json()["unsure"][0]["id"]
        self.assertEqual(self.client.post(f"/api/unsure/{fid}/skip").status_code, 200)
        self.assertEqual(self.client.get("/api/unsure").json()["unsure"], [])
        self.assertEqual(self.client.get("/api/records").json(), [])

    def test_keeping_needs_the_key(self) -> None:
        self.client.post("/api/tell", json={"text": "Maybe I will move to Canada next year"})
        fid = self.client.get("/api/unsure").json()["unsure"][0]["id"]
        self.assertEqual(self.client._client.post(f"/api/unsure/{fid}/keep").status_code, 401)

    def test_keeping_something_that_is_not_there_is_harmless(self) -> None:
        r = self.client.post("/api/unsure/fact-nope/keep")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["result"], "gone")

    def test_the_home_view_bundles_what_needs_attention(self) -> None:
        self.client.post("/api/tell", json={"text": "I live in Dhaka"})
        self.client.post("/api/tell", json={"text": "I no longer live in Dhaka"})
        self.client.post("/api/tell", json={"text": "Maybe I will move to Canada next year"})
        home = self.client.get("/api/home").json()
        self.assertEqual(len(home["doubts"]), 1)
        self.assertEqual(len(home["unsure"]), 1)
        self.assertTrue(home["feed"])


if __name__ == "__main__":
    unittest.main()
