"""Owner list item E5: one-click corrections on each AI decision.

"Not important" removes the memory (it goes to the trash, nothing is
destroyed, and Undo brings it back), "Wrong shelf" moves it to another
category, and "Not me" marks it as about someone else so it stops counting as
the owner's own fact. Every correction is undoable and the feed never claims
the owner approved anything they did not say.
"""

from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tests.helpers import reading  # noqa: E402


class Corrections(unittest.TestCase):
    def setUp(self) -> None:
        from memory_ob import manager
        from memory_ob.config import Settings
        from memory_ob.store import Store

        self.tmp = Path(tempfile.mkdtemp())
        self.vault = self.tmp / "vault"
        self.db = self.tmp / "mob.db"
        self.settings = Settings.resolve(vault=self.vault, db=self.db)
        self.settings.ensure_dirs()
        self.store = Store(self.db)
        self.manager = manager

    def tearDown(self) -> None:
        self.store.close()
        shutil.rmtree(self.tmp, True)

    def tell(self, text: str):
        return self.manager.capture(self.store, text=text, vault=self.vault,
                                    model_call=reading())

    def feed(self):
        from memory_ob import feed as feed_mod

        return feed_mod.build(self.store, limit=50, hide_undone=True,
                              dismissed=feed_mod.dismissed(self.vault))

    def row_for(self, rid: str) -> dict:
        for item in self.feed():
            rows = item.get("items") or [item]
            for r in rows:
                if r.get("entity_id") == rid:
                    return r
        return {}

    def rid(self, text: str) -> str:
        out = self.tell(text)
        self.assertTrue(out.record_ids, f"nothing was remembered from: {text}")
        return out.record_ids[0]

    # -- "not important" ------------------------------------------------------

    def test_not_important_trashes_it_and_undo_puts_it_back(self) -> None:
        rid = self.rid("I sleep with the window open even in winter.")
        trashed = self.manager.forget_record(
            self.store, rid, vault=self.vault, reason="you said it was not important")
        self.assertIsNotNone(trashed)
        rec = self.store.get_record(rid)
        self.assertNotEqual(rec.status, "active", "the memory must leave use")
        row = self.row_for(rid)
        self.assertEqual(row.get("note"), "you said it was not important",
                         "the feed must say what the owner actually said")
        undone = self.manager.undo(self.store, row["seq"], vault=self.vault)
        self.assertEqual(undone.get("result"), "undone")
        rec = self.store.get_record(rid)
        self.assertEqual(rec.status, "active", "Undo must bring it back")

    # -- "wrong shelf" --------------------------------------------------------

    def test_wrong_shelf_moves_it_and_undo_restores_the_shelf(self) -> None:
        from memory_ob import topics

        rid = self.rid("I keep my passport in the top drawer.")
        before_cat = topics.category_of(self.store.get_record(rid).tags,
                                        self.store.get_record(rid).body)
        target = next(c for c in topics.CATEGORIES if c != before_cat)
        saved = self.manager.edit_record(
            self.store, rid, category=target, vault=self.vault,
            reason=f"you moved it to {target}")
        self.assertIsNotNone(saved)
        self.assertEqual(topics.category_of(saved.tags, saved.body), target)
        row = self.row_for(rid)
        self.assertEqual(row.get("verb"), "Moved", "a shelf move must read as Moved")
        self.assertEqual(row.get("category"), target, "the chip must show the new shelf")
        self.assertEqual(row.get("was"), "", "a shelf move has no earlier text to show")
        undone = self.manager.undo(self.store, row["seq"], vault=self.vault)
        self.assertEqual(undone.get("result"), "undone")
        rec = self.store.get_record(rid)
        self.assertEqual(topics.category_of(rec.tags, rec.body), before_cat,
                         "Undo must put the old shelf back")

    # -- "not me" -------------------------------------------------------------

    def test_not_me_marks_it_about_someone_else_and_undo_puts_it_back(self) -> None:
        rid = self.rid("Rafa is moving to Berlin in March.")
        kind_before = self.store.get_record(rid).kind
        self.assertIn(rid, [r.id for r in self.manager._comparable(self.store)],
                      "before the correction it counts as the owner's own fact")
        saved = self.manager.not_about_me(self.store, rid, vault=self.vault)
        self.assertEqual(saved.subject, "other")
        self.assertEqual(saved.kind, "profile",
                         "a fact about someone else cannot stay one of the owner's own kinds")
        self.assertNotIn(rid, [r.id for r in self.manager._comparable(self.store)],
                         "a fact about someone else must leave the owner's own facts")
        row = self.row_for(rid)
        self.assertEqual(row.get("verb"), "Marked as about someone else")
        self.assertEqual(row.get("note"), "you said it is about someone else")
        undone = self.manager.undo(self.store, row["seq"], vault=self.vault)
        self.assertEqual(undone.get("result"), "undone")
        rec = self.store.get_record(rid)
        self.assertEqual(rec.subject, "self", "Undo must put it back as about you")
        self.assertEqual(rec.kind, kind_before, "Undo must put the old kind back too")
        self.assertIn(rid, [r.id for r in self.manager._comparable(self.store)])

    def test_not_me_twice_only_logs_once(self) -> None:
        rid = self.rid("Rafa is moving to Berlin in March.")
        self.manager.not_about_me(self.store, rid, vault=self.vault)
        second = self.manager.not_about_me(self.store, rid, vault=self.vault)
        self.assertEqual(second.subject, "other")
        rows = []
        for item in self.feed():
            rows.extend(item.get("items") or [item])
        flips = [r for r in rows if r.get("entity_id") == rid
                 and r.get("verb") == "Marked as about someone else"]
        self.assertEqual(len(flips), 1, "clicking twice must not add a second change")

    # -- how the feed words the corrections -----------------------------------

    def test_feed_says_what_the_owner_actually_said(self) -> None:
        from memory_ob import feed as feed_mod

        base = {"seq": 1, "at": "2026-11-19T12:00:00Z", "entity": "record",
                "action": "update", "actor": "owner", "entity_id": "r1",
                "before": {"body": "X", "tags": ["topic/life"], "subject": "self"},
                "after": {"body": "X", "tags": ["topic/life"], "subject": "self"}}
        moved = feed_mod.describe({**base, "after": {"body": "X", "tags": ["topic/health"],
                                                     "subject": "self"},
                                   "reason": "you edited it"})
        self.assertEqual(moved["verb"], "Moved")
        self.assertEqual(moved["was"], "")
        self.assertEqual(moved.get("note", ""), "", "the generic edit reason stays quiet")
        flip = feed_mod.describe({**base, "after": {"body": "X", "tags": ["topic/life"],
                                                    "subject": "other"},
                                  "reason": "you said it is about someone else"})
        self.assertEqual(flip["verb"], "Marked as about someone else")
        self.assertEqual(flip["note"], "you said it is about someone else")
        back = feed_mod.describe({**base, "before": {"body": "X", "tags": ["topic/life"],
                                                     "subject": "other"},
                                  "reason": "you said it is about someone else"})
        self.assertEqual(back["verb"], "Marked as about you")


class CorrectionsApi(unittest.TestCase):
    def setUp(self) -> None:
        import os

        self.tmp = tempfile.TemporaryDirectory()
        self.vault = os.path.join(self.tmp.name, "vault")
        self.db = os.path.join(self.tmp.name, "state.db")
        os.environ["MEMORY_OB_VAULT"] = self.vault
        os.environ["MEMORY_OB_DB"] = self.db
        from memory_ob import api
        from tests.helpers import api_uses_reading_helper

        api.settings = api.Settings.resolve(vault=self.vault, db=self.db)
        api.settings.ensure_dirs()
        api_uses_reading_helper(api)
        self.api = api
        from fastapi.testclient import TestClient

        self.client = TestClient(api.create_app())
        from memory_ob.auth import load_or_create

        self.token = load_or_create(api.settings.token_path)
        self.headers = {"x-memory-ob-token": self.token}
        from memory_ob import manager
        from memory_ob.store import Store

        self.manager = manager
        self.store = Store(self.db)
        out = manager.capture(self.store, text="Rafa is moving to Berlin in March.",
                              vault=Path(self.vault), model_call=reading())
        self.rid = out.record_ids[0]
        self.store.close()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_not_important_route_trashes_the_memory(self) -> None:
        r = self.client.post(f"/api/records/{self.rid}/not-important", headers=self.headers)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse(r.json().get("ok") is not True)
        from memory_ob.store import Store

        st = Store(self.db)
        try:
            self.assertNotEqual(st.get_record(self.rid).status, "active")
        finally:
            st.close()

    def test_not_me_route_marks_it_about_someone_else(self) -> None:
        r = self.client.post(f"/api/records/{self.rid}/not-me", headers=self.headers)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json().get("subject"), "other")

    def test_shelf_move_route_reaches_the_same_place(self) -> None:
        r = self.client.put(f"/api/records/{self.rid}", headers=self.headers,
                            json={"category": "Health"})
        self.assertEqual(r.status_code, 200, r.text)

    def test_corrections_on_a_missing_memory_say_so_plainly(self) -> None:
        for path in ("not-important", "not-me"):
            r = self.client.post(f"/api/records/no-such-memory/{path}", headers=self.headers)
            self.assertEqual(r.status_code, 404, r.text)
            self.assertIn("no longer exists", r.text)


class OnlyWhereACorrectionCanWork(Corrections):
    """The buttons are offered on an AI decision only while it is still the latest word on that memory."""

    def rows(self, text: str):
        def walk(items):
            for i in items:
                yield i
                yield from walk(i.get("items") or [])
        return [i for i in walk(self.feed()) if text in (i.get("text") or "") and not i.get("group")]

    def test_a_fresh_ai_memory_can_be_corrected(self) -> None:
        self.tell("My knee hurts when I run.")
        self.assertTrue(all(r["can_fix"] for r in self.rows("knee")))

    def test_after_it_is_removed_the_old_row_no_longer_offers_corrections(self) -> None:
        self.tell("My knee hurts when I run.")
        rec = [r for r in self.store.list_records() if "knee" in r.body][0]
        self.manager.forget_record(self.store, rec.id, vault=self.vault, reason="you said it was not important")
        ai_rows = [r for r in self.rows("knee") if r["by"] == "AI"]
        self.assertTrue(ai_rows)
        self.assertFalse(any(r["can_fix"] for r in ai_rows), "a click there would only say it no longer exists")

    def test_what_you_did_yourself_is_never_offered_corrections(self) -> None:
        self.manager.add_journal_entry(self.store, "Started building the memory plugin today.", vault=self.vault)
        self.assertFalse(any(r.get("can_fix") for r in self.feed()))


if __name__ == "__main__":
    unittest.main()
