"""The AI librarian: it files each memory into the right note, and the simple rules still work without it."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob import extract, manager, topics, vault as vault_mod  # noqa: E402
try:
    from tests.helpers import reading
except ImportError:      # running as a script from inside tests/
    from helpers import reading
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402


def jl(*items: dict) -> str:
    return "\n".join(json.dumps(i) for i in items)


class LibrarianCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = Path(self.tmp) / "vault"
        self.db = Path(self.tmp) / "mob.db"
        Settings.resolve(vault=self.vault, db=self.db).ensure_dirs()
        self.store = Store(self.db)
        self.prompts: list[str] = []

    def tearDown(self) -> None:
        self.store.close()

    def helper(self, answer: str):
        def call(prompt: str) -> str:
            self.prompts.append(prompt)
            return answer
        return call

    def tell(self, text: str, answer: str):
        return manager.capture(self.store, text=text, vault=self.vault, model_call=self.helper(answer))

    def records(self):
        return self.store.list_records(status="active")


class Filing(LibrarianCase):
    def test_the_ai_names_the_note_and_the_category(self) -> None:
        out = self.tell("I sleep badly when I drink coffee after lunch", jl(
            {"text": "I sleep badly when I drink coffee after lunch", "category": "Health",
             "note": "Sleep", "project": "", "todo": False, "moment": False}))
        self.assertEqual(out.saved, 1)
        rec = self.records()[0]
        self.assertEqual(topics.category_of(rec.tags), "Health")
        self.assertEqual(topics.note_of_tags(rec.tags), "Sleep")
        self.assertEqual(rec.source.get("filed_by"), "ai")
        self.assertTrue((self.vault / "Health" / "Sleep.md").exists())

    def test_later_memories_go_into_the_same_note(self) -> None:
        for text in ("I wake up at six every day", "I go to bed before eleven"):
            self.tell(text, jl({"text": text, "category": "Health", "note": "Sleep"}))
        notes = [p.name for p in (self.vault / "Health").glob("*.md")]
        self.assertEqual(notes, ["Sleep.md"])
        body = (self.vault / "Health" / "Sleep.md").read_text(encoding="utf-8")
        self.assertIn("wake up at six", body)
        self.assertIn("bed before eleven", body)

    def test_the_ai_can_say_it_is_a_project_a_to_do_or_a_passing_moment(self) -> None:
        self.tell("I want to open a bakery called Sweet Rise", jl(
            {"text": "I want to open a bakery called Sweet Rise", "category": "Projects & Ideas",
             "project": "Sweet Rise"}))
        self.tell("I need to ask the bank about a loan for Sweet Rise", jl(
            {"text": "I need to ask the bank about a loan for Sweet Rise", "project": "Sweet Rise",
             "todo": True, "category": "Money"}))
        self.tell("I feel tired today", jl({"text": "I feel tired today", "moment": True}))
        recs = {r.body: r for r in self.records()}
        self.assertEqual(topics.thread_of_tags(recs["I want to open a bakery called Sweet Rise"].tags), "Sweet Rise")
        todo = recs["I need to ask the bank about a loan for Sweet Rise"]
        self.assertIn(topics.TODO_TAG, todo.tags)
        self.assertEqual(topics.thread_of_tags(todo.tags), "Sweet Rise")
        self.assertEqual(recs["I feel tired today"].kind, "journal")
        self.assertTrue((self.vault / "Projects & Ideas" / "Sweet Rise" / "Sweet Rise.md").exists())

    def test_a_project_name_is_matched_to_the_one_that_exists(self) -> None:
        self.tell("My bakery business is called Sweet Rise", jl(
            {"text": "My bakery business is called Sweet Rise", "project": "Sweet Rise"}))
        self.tell("Sweet Rise will open in March next year", jl(
            {"text": "Sweet Rise will open in March next year", "project": "sweet rise"}))
        projects = {topics.thread_of_tags(r.tags) for r in self.records()}
        self.assertEqual(projects, {"Sweet Rise"})

    def test_an_unknown_category_falls_back_to_the_rules(self) -> None:
        self.tell("I take medicine for my allergy every morning", jl(
            {"text": "I take medicine for my allergy every morning", "category": "Banana", "note": ""}))
        rec = self.records()[0]
        self.assertIn(topics.category_of(rec.tags), topics.CATEGORIES)

    def test_note_names_cannot_break_file_names(self) -> None:
        self.tell("I like long walks near the lake", jl(
            {"text": "I like long walks near the lake", "category": "Interests",
             "note": "../../Windows/System32: Walks?"}))
        rec = self.records()[0]
        title = topics.note_of_tags(rec.tags)
        self.assertNotIn("/", title)
        self.assertNotIn(":", title)
        self.assertNotIn("?", title)
        found = list(self.vault.rglob("*Walks*.md"))
        self.assertTrue(found)
        for p in found:
            self.assertTrue(str(p.resolve()).startswith(str(self.vault.resolve())))

    def test_plain_lines_from_a_simple_helper_still_work(self) -> None:
        out = self.tell("I always use git for my code", "- I always use git for my code")
        self.assertEqual(out.saved, 1)
        self.assertEqual(self.records()[0].source.get("filed_by"), "rules")

    def test_a_wrapped_answer_is_read(self) -> None:
        answer = json.dumps({"claims": [{"text": "I study computer science at BRAC", "category": "Learning"}]})
        out = self.tell("I study computer science at BRAC", answer)
        self.assertEqual(out.saved, 1)
        self.assertEqual(topics.category_of(self.records()[0].tags), "Learning")

    def test_a_fenced_list_is_read(self) -> None:
        answer = "```json\n" + jl({"text": "I drink green tea every morning", "category": "Life"}) + "\n```"
        out = self.tell("I drink green tea every morning", answer)
        self.assertEqual(out.saved, 1)

    def test_none_means_nothing_was_saved(self) -> None:
        out = self.tell("ok thanks a lot", "none")
        self.assertEqual(out.saved, 0)


class WhatTheAiSees(LibrarianCase):
    def test_it_is_shown_the_notes_projects_and_people_that_exist(self) -> None:
        self.tell("My sister Mim lives in Sylhet", jl({"text": "My sister Mim lives in Sylhet", "note": "Family",
                                                       "category": "Life", "people": ["Mim"]}))
        self.tell("I want to open a bakery called Sweet Rise", jl(
            {"text": "I want to open a bakery called Sweet Rise", "project": "Sweet Rise"}))
        self.prompts.clear()
        self.tell("Mim visits on Friday", jl({"text": "Mim visits on Friday"}))
        prompt = self.prompts[0]
        self.assertIn("Family", prompt)
        self.assertIn("Sweet Rise", prompt)
        self.assertIn("Mim (sister)", prompt)

    def test_private_things_are_never_shown(self) -> None:
        self.tell("My doctor said my blood sugar is high", jl(
            {"text": "My doctor said my blood sugar is high", "category": "Health", "note": "Blood sugar"}))
        rec = self.records()[0]
        manager.make_private(self.store, rec.id, vault=self.vault)
        self.prompts.clear()
        self.tell("I like cycling in the evening", jl({"text": "I like cycling in the evening"}))
        self.assertNotIn("Blood sugar", self.prompts[0])

    def test_the_hint_is_capped(self) -> None:
        for i in range(60):
            text = f"I keep a list of things about topic number {i} in my head"
            self.tell(text, jl({"text": text, "note": f"Long note title number {i}", "category": "Interests"}))
        self.assertLessEqual(len(manager.librarian_context(self.store)), manager.HINT_LIMIT)


class Grounding(LibrarianCase):
    def test_a_name_the_owner_never_wrote_is_not_saved(self) -> None:
        out = manager.capture(
            self.store, parts=[
                {"role": "user", "content": "I want to open a bakery"},
                {"role": "assistant", "content": "A good name could be Sweet Rise."},
            ], vault=self.vault, model_call=self.helper(jl(
                {"text": "I want to open a bakery called Sweet Rise", "project": "Sweet Rise"})))
        self.assertEqual(out.saved, 0)
        self.assertEqual(out.ungrounded, 1)

    def test_a_name_from_earlier_in_what_the_owner_said_is_fine(self) -> None:
        out = manager.capture(
            self.store, parts=[
                {"role": "user", "content": "My bakery is called Sweet Rise."},
                {"role": "user", "content": "It opens in March."},
            ], vault=self.vault, model_call=self.helper(jl(
                {"text": "Sweet Rise opens in March", "project": "Sweet Rise"})))
        self.assertEqual(out.saved, 1)

    def test_support_names_rule_alone(self) -> None:
        self.assertEqual(extract._invented_names("I met Rahim at Dhaka", "i met rahim at dhaka"), [])
        self.assertEqual(extract._invented_names("I met Rahim", "i met somebody"), ["Rahim"])


class SimpleRules(LibrarianCase):
    def test_a_bakery_called_x_is_not_a_person(self) -> None:
        names = [n for n, _ in manager.people_in("I want to open a bakery called Sweet Rise")]
        self.assertNotIn("Sweet Rise", names)

    def test_called_someone_still_finds_the_person(self) -> None:
        names = [n for n, _ in manager.people_in("Yesterday I called Rahim about the trip")]
        self.assertIn("Rahim", names)

    def test_no_helper_means_rules_and_no_note_tag(self) -> None:
        out = manager.capture(self.store, text="I always drink black coffee", vault=self.vault, model_call=reading())
        self.assertEqual(out.saved, 1)
        rec = self.records()[0]
        self.assertEqual(topics.note_of_tags(rec.tags), "")
        self.assertEqual(rec.source.get("filed_by"), "rules")
        self.assertTrue(vault_mod.note_target(rec)[1])


class ChatImports(LibrarianCase):
    CHAT = {"title": "WhatsApp: Study group", "origin": "whatsapp", "people": ["Riya", "Karim"], "parts": [
        {"role": "user", "content": "I start my new course on Monday"},
        {"role": "assistant", "name": "Riya", "content": "Good luck, I start mine next week"},
        {"role": "assistant", "name": "Karim", "content": "Same here, see you both"},
    ]}

    def test_a_group_chat_keeps_who_said_what(self) -> None:
        manager.store_chats(self.store, [self.CHAT], source_name="WhatsApp", vault=self.vault)
        text = self.store.unprocessed_conversations(limit=5)[0]["text"]
        self.assertIn("Riya: Good luck", text)
        self.assertIn("Karim: Same here", text)
        self.assertNotIn("assistant:", text)

    def test_the_ai_reads_the_other_speakers_by_name(self) -> None:
        manager.store_chats(self.store, [self.CHAT], source_name="WhatsApp", vault=self.vault)
        manager.process_waiting(self.store, model_call=self.helper("none"), vault=self.vault)
        prompt = self.prompts[0]
        self.assertIn("other (Riya): Good luck", prompt)
        self.assertIn("other (Karim): Same here", prompt)
        self.assertIn("user: I start my new course on Monday", prompt)

    def test_undoing_a_chat_import_also_removes_what_was_read_from_it(self) -> None:
        manager.store_chats(self.store, [self.CHAT], source_name="WhatsApp", vault=self.vault)
        seq = self.store.list_changes(limit=1)[0]["seq"]
        out = manager.process_waiting(self.store, model_call=self.helper(jl(
            {"text": "I start my new course on Monday", "category": "Learning", "note": "Courses"})),
            vault=self.vault)
        self.assertEqual(out.saved, 1)
        self.assertEqual(len(self.records()), 1)
        manager.undo(self.store, seq, vault=self.vault)
        self.assertEqual(self.records(), [])
        self.assertEqual(self.store.count_conversations(), 0)

    def test_something_you_changed_since_is_not_taken_away(self) -> None:
        manager.store_chats(self.store, [self.CHAT], source_name="WhatsApp", vault=self.vault)
        seq = self.store.list_changes(limit=1)[0]["seq"]
        manager.process_waiting(self.store, model_call=self.helper(jl(
            {"text": "I start my new course on Monday", "category": "Learning"})), vault=self.vault)
        rec = self.records()[0]
        manager.edit_record(self.store, rec.id, body="I start my new course on Tuesday", vault=self.vault)
        manager.undo(self.store, seq, vault=self.vault)
        self.assertEqual(len(self.records()), 1)


if __name__ == "__main__":
    unittest.main()
