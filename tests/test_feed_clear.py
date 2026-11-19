"""Clearing the "recently remembered" list (owner decision D2).

"Got it" clears one item, "Clear all" clears the list. Clearing only hides
items from that list - the memories and the full history never change.
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from memory_ob import feed as feed_mod, manager  # noqa: E402
from memory_ob.store import Store  # noqa: E402


class FeedClear(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = Path(self.tmp.name) / "V"
        self.store = Store(Path(self.tmp.name) / "s.db")
        manager.capture(self.store, text="My knee hurts when I run. My bakery budget is 5 lakh.",
                        model_call=lambda p: json.dumps(
                            [{"text": "My knee hurts when I run."},
                             {"text": "My bakery budget is 5 lakh."}]),
                        vault=self.vault)

    def tearDown(self) -> None:
        self.store.close()
        self.tmp.cleanup()

    def _feed(self):
        return feed_mod.build(self.store, hide_undone=True,
                              dismissed=feed_mod.dismissed(self.vault))

    @staticmethod
    def _seqs(items):
        return [s for item in items for s in (item.get("seqs") or [item["seq"]])]

    def test_got_it_clears_one_item(self) -> None:
        full = self._feed()
        self.assertTrue(full)
        one = (full[0].get("seqs") or [full[0]["seq"]])[:1]
        self.assertEqual(feed_mod.dismiss(self.vault, one), len(one))
        after = self._feed()
        self.assertLess(len(self._seqs(after)), len(self._seqs(full)))

    def test_clear_all_empties_the_list_but_keeps_memories(self) -> None:
        feed_mod.dismiss(self.vault, self._seqs(self._feed()))
        self.assertEqual(self._feed(), [])
        self.assertEqual(len(self.store.list_records()), 2, "memories stay saved")

    def test_new_captures_appear_again_after_clearing(self) -> None:
        feed_mod.dismiss(self.vault, self._seqs(self._feed()))
        manager.capture(self.store, text="I like tea in the morning.",
                        model_call=lambda p: '[{"text": "I like tea in the morning."}]', vault=self.vault)
        self.assertTrue(self._feed(), "a new capture shows up on the list again")

    def test_dismissing_twice_counts_once(self) -> None:
        seqs = (self._feed()[0].get("seqs") or [self._feed()[0]["seq"]])
        self.assertEqual(feed_mod.dismiss(self.vault, seqs), len(seqs))
        self.assertEqual(feed_mod.dismiss(self.vault, seqs), 0)


class NeitherAnswer(unittest.TestCase):
    """Owner decision D2: the 4th conflict answer "Discard both"."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = Path(self.tmp.name) / "V"
        self.store = Store(Path(self.tmp.name) / "s.db")

    def tearDown(self) -> None:
        self.store.close()
        self.tmp.cleanup()

    def _say(self, text: str) -> None:
        manager.capture(self.store, text=text, model_call=lambda p: json.dumps([{"text": text}]),
                        vault=self.vault)

    def test_neither_keeps_nothing_and_is_undoable(self) -> None:
        self._say("I live in Dhaka")
        self._say("I live in Chittagong")
        from memory_ob import doubts
        cards = doubts.list_doubts(self.store)
        self.assertTrue(cards, "the conflict must ask first")
        doubt = cards[0]
        self.assertIn("neither", [o["key"] for o in doubt.get("options", [])],
                      "the card offers the 4th answer")
        manager.answer_conflict(self.store, doubt["id"], "neither", vault=self.vault)
        self.assertEqual(self.store.list_records(status="active"), [],
                         "neither answer stays")
        self.assertTrue(self.store.list_records(status="trash"),
                        "the old one goes to the trash - undoable, not lost")

    def test_a_bad_answer_is_still_refused(self) -> None:
        self._say("I live in Dhaka")
        self._say("I live in Chittagong")
        from memory_ob import doubts
        doubt = doubts.list_doubts(self.store)[0]
        with self.assertRaises(ValueError):
            manager.answer_conflict(self.store, doubt["id"], "maybe", vault=self.vault)


if __name__ == "__main__":
    unittest.main()
