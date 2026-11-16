"""One message with many facts shows up as one summary card; everything in it is still saved on its own."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob import api, feed, manager  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402
from tests.helpers import AuthedClient  # noqa: E402

DUMP = "I live in Dhaka. I study CSE at BRAC University. I need to renew my passport. My sister Riya lives in Chittagong."
CLAIMS = [
    {"text": "I live in Dhaka", "category": "Life"},
    {"text": "I study CSE at BRAC University", "category": "Learning"},
    {"text": "I need to renew my passport", "category": "Plans", "todo": True},
    {"text": "My sister Riya lives in Chittagong", "category": "Life", "people": ["Riya"]},
]


class Case(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.vault, db = self.tmp / "vault", self.tmp / "m.db"
        Settings.resolve(vault=self.vault, db=db).ensure_dirs()
        self.store = Store(db)
        api.settings = api.Settings.resolve(vault=self.vault, db=db, models_path=self.tmp / "models.json")
        self.client = AuthedClient.create(api.create_app(), self.vault)

    def tearDown(self) -> None:
        self.store.close()

    def tell(self, text: str, claims: list[dict]):
        answer = "\n".join(json.dumps(c) for c in claims)
        return manager.capture(self.store, text=text, vault=self.vault, model_call=lambda _p: answer)

    def active(self) -> list[str]:
        return sorted(r.body for r in self.store.list_records(status="active"))


class Grouping(Case):
    def test_a_dump_is_one_card_with_every_memory_inside(self) -> None:
        out = self.tell(DUMP, CLAIMS)
        self.assertEqual(out.saved, 4)
        items = feed.build(self.store)
        self.assertEqual(len(items), 1)
        card = items[0]
        self.assertTrue(card["group"])
        self.assertEqual(card["verb"], "Saved 4 things from your message")
        self.assertEqual(len(card["items"]), 4)
        self.assertEqual(len(card["undo_seqs"]), 4)
        self.assertEqual({c["name"] for c in card["categories"]}, {"Life", "Learning", "Plans"})

    def test_everything_is_still_saved_as_separate_memories(self) -> None:
        self.tell(DUMP, CLAIMS)
        self.assertEqual(len(self.active()), 4)

    def test_one_fact_is_a_plain_item_like_before(self) -> None:
        self.tell("I live in Dhaka.", CLAIMS[:1])
        items = feed.build(self.store)
        self.assertEqual(len(items), 1)
        self.assertFalse(items[0].get("group"))
        self.assertEqual(items[0]["verb"], "Remembered")

    def test_two_messages_stay_two_cards(self) -> None:
        self.tell(DUMP, CLAIMS)
        self.tell("I like mangoes. I drink black coffee.",
                  [{"text": "I like mangoes"}, {"text": "I drink black coffee"}])
        items = feed.build(self.store)
        self.assertEqual([i["count"] for i in items], [2, 4])

    def test_a_conflict_is_still_its_own_question_not_hidden_in_the_card(self) -> None:
        self.tell("I live in Dhaka.", CLAIMS[:1])
        out = self.tell("I live in Sylhet now. I like mangoes. I study CSE at BRAC University.",
                        [{"text": "I live in Sylhet now"}, {"text": "I like mangoes"},
                         {"text": "I study CSE at BRAC University"}])
        self.assertEqual(out.asked, 1)
        self.assertEqual(out.saved, 2)
        card = feed.build(self.store)[0]
        self.assertEqual(card["count"], 2)
        self.assertEqual(len(self.client.get("/api/home").json()["doubts"]), 1)


class UndoAll(Case):
    def test_undo_all_puts_every_one_back(self) -> None:
        self.tell(DUMP, CLAIMS)
        card = feed.build(self.store)[0]
        r = self.client.post("/api/undo-many", json={"seqs": card["undo_seqs"]})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json(), {"undone": 4, "skipped": 0})
        self.assertEqual(self.active(), [])
        again = feed.build(self.store)[0]
        self.assertTrue(again["undone"])
        self.assertEqual(again["undo_seqs"], [])

    def test_one_line_can_be_undone_on_its_own(self) -> None:
        self.tell(DUMP, CLAIMS)
        card = feed.build(self.store)[0]
        one = card["items"][0]["seq"]
        self.assertEqual(self.client.post(f"/api/undo/{one}").json()["result"], "undone")
        self.assertEqual(len(self.active()), 3)
        self.assertEqual(len(feed.build(self.store)[0]["undo_seqs"]), 3)

    def test_a_changed_one_is_left_alone_and_counted(self) -> None:
        self.tell(DUMP, CLAIMS)
        card = feed.build(self.store)[0]
        rid = self.store.list_records(status="active")[0].id
        r = self.client.put(f"/api/records/{rid}", json={"text": "I live in Dhaka, Bangladesh"})
        self.assertEqual(r.status_code, 200, r.text)
        card = next(i for i in feed.build(self.store) if i.get("group"))
        result = self.client.post("/api/undo-many", json={"seqs": [i["seq"] for i in card["items"]]}).json()
        self.assertEqual(result["undone"] + result["skipped"], 4)
        self.assertGreaterEqual(result["skipped"], 1)

    def test_bad_requests_are_refused(self) -> None:
        for body in ({}, {"seqs": []}, {"seqs": ["a"]}, {"seqs": list(range(600))}):
            self.assertEqual(self.client.post("/api/undo-many", json=body).status_code, 400)

    def test_the_card_needs_the_write_key(self) -> None:
        from fastapi.testclient import TestClient

        bare = TestClient(api.create_app())
        self.assertIn(bare.post("/api/undo-many", json={"seqs": [1]}).status_code, (401, 403))


if __name__ == "__main__":
    unittest.main()
