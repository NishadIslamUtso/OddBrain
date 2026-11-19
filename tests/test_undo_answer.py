"""Undoing an answer to "which one is right?" puts the question back, with the memories as they were."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))
sys.path.insert(0, str(PROJECT / "tests" / "browser"))

import fake_ai  # noqa: E402
from memory_ob import doubts, feed, manager  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402


class Case(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.vault, db = self.tmp / "vault", self.tmp / "m.db"
        Settings.resolve(vault=self.vault, db=db).ensure_dirs()
        self.store = Store(db)
        for text in ("I live in Dhaka.", "I live in Chittagong now."):
            manager.capture(self.store, text=text, vault=self.vault, model_call=fake_ai.fake)

    def tearDown(self) -> None:
        self.store.close()

    def active(self) -> list[str]:
        return sorted(r.body for r in self.store.list_records(status="active"))

    def answer(self, choice: str) -> None:
        card = doubts.list_doubts(self.store)[0]
        doubts.answer(self.store, card["id"], choice, vault=self.vault)

    def undo_line(self, verb: str) -> dict:
        item = next(i for i in feed.build(self.store, hide_undone=True) if i["verb"] == verb)
        self.assertTrue(item["can_undo"], f"{verb} has no Undo")
        return manager.undo(self.store, item["seq"], vault=self.vault)

    def asked(self) -> int:
        return len(doubts.list_doubts(self.store))


class TheQuestionComesBack(Case):
    def test_the_new_one_is_right_then_undo(self) -> None:
        self.answer("new")
        self.assertEqual(self.active(), ["I live in Chittagong now."])
        got = self.undo_line("Updated")
        self.assertTrue(got["reopened"])
        self.assertEqual((self.active(), self.asked()), (["I live in Dhaka."], 1))

    def test_the_old_one_is_right_then_undo(self) -> None:
        self.answer("old")
        self.assertEqual(self.asked(), 0)
        self.assertTrue(self.undo_line("Kept your earlier answer")["reopened"])
        self.assertEqual(self.asked(), 1)
        self.answer("new")                                              # and it can be answered again
        self.assertEqual(self.active(), ["I live in Chittagong now."])

    def test_neither_is_right_then_undo_brings_the_old_one_back_and_asks_again(self) -> None:
        self.answer("neither")
        self.assertEqual(self.active(), [])
        feed_verbs = [i["verb"] for i in feed.build(self.store, hide_undone=True)]
        self.assertIn("Discarded both", feed_verbs)
        self.assertNotIn("Removed", feed_verbs, "one line, with one Undo, for one answer")
        self.assertNotIn("Kept your earlier answer", feed_verbs)
        self.assertTrue(self.undo_line("Discarded both")["reopened"])
        self.assertEqual((self.active(), self.asked()), (["I live in Dhaka."], 1))

    def test_an_undone_answer_does_not_show_up_to_be_undone_twice(self) -> None:
        self.answer("old")
        self.undo_line("Kept your earlier answer")
        self.assertNotIn("Kept your earlier answer", [i["verb"] for i in feed.build(self.store, hide_undone=True)])

    def test_both_are_true_is_undone_by_taking_the_new_one_away_again(self) -> None:
        self.answer("both")
        self.assertEqual(len(self.active()), 2)

    def test_it_can_be_undone_through_the_api_and_says_the_question_is_back(self) -> None:
        from memory_ob import api
        from tests.helpers import AuthedClient

        db = self.tmp / "m.db"
        api.settings = api.Settings.resolve(vault=self.vault, db=db, models_path=self.tmp / "models.json")
        client = AuthedClient.create(api.create_app(), self.vault)
        card = client.get("/api/doubts").json()["doubts"][0]
        client.post(f"/api/doubts/{card['id']}/answer", json={"answer": "old"})
        top = client.get("/api/feed").json()["feed"][0]
        self.assertEqual(top["verb"], "Kept your earlier answer")
        got = client.post(f"/api/undo/{top['seq']}").json()
        self.assertEqual((got["result"], got["reopened"]), ("undone", True))
        self.assertEqual(len(client.get("/api/doubts").json()["doubts"]), 1)


if __name__ == "__main__":
    unittest.main()
