"""Contradictions the word rules used to miss, and the AI helper's second opinion."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

from memory_ob import conflicts, manager  # noqa: E402
from memory_ob.store import Store  # noqa: E402


class Rules(unittest.TestCase):
    def test_a_changed_decimal_is_a_conflict_not_a_repeat(self) -> None:
        self.assertEqual(conflicts.compare("My GPA is 3.6 now.", "My GPA is 3.4 this semester."), conflicts.CONFLICT)
        self.assertEqual(conflicts.compare("My GPA is 3.4 this semester.", "My GPA is 3.4 this semester."), conflicts.DUPLICATE)

    def test_a_changed_number_is_a_conflict(self) -> None:
        self.assertEqual(conflicts.compare("Actually I weigh 68 kg these days.", "I weigh 72 kg."), conflicts.CONFLICT)
        self.assertEqual(conflicts.compare("The bakery budget is now 8 lakh.", "My budget for the bakery is 5 lakh taka."),
                         conflicts.CONFLICT)

    def test_different_things_with_different_numbers_are_not(self) -> None:
        self.assertIsNone(conflicts.compare("I have 3 brothers", "I have 2 sisters"))
        self.assertIsNone(conflicts.compare("I was born in 2001", "My brother was born in 2005"))

    def test_a_new_job_replaces_the_old_one(self) -> None:
        self.assertEqual(conflicts.compare("I quit Grameenphone and joined bKash.", "I work at Grameenphone."),
                         conflicts.CONFLICT)


class Judge(unittest.TestCase):
    def setUp(self) -> None:
        for key in ("MEMORY_OB_VAULT", "MEMORY_OB_DB", "MEMORY_OB_TOKEN", "MEMORY_OB_MODELS"):
            os.environ.pop(key, None)
        self.tmp = Path(tempfile.mkdtemp())
        self.store = Store(self.tmp / "m.db")
        self.addCleanup(self.store.close)

    def test_the_helper_catches_what_the_rules_cannot(self) -> None:
        manager.capture(self.store, text="I commute to campus by bus every day.", vault=self.tmp / "V")
        asked: list[str] = []

        def helper(prompt: str) -> str:
            asked.append(prompt)
            if prompt.startswith("You keep a person's memory consistent"):
                return json.dumps({"1": "update"})
            return "I bike to campus every day."

        out = manager.capture(self.store, text="I bike to campus every day.", model_call=helper, vault=self.tmp / "V")
        self.assertEqual((out.asked, out.saved), (1, 0))
        self.assertTrue(any(p.startswith("You keep") for p in asked))

    def test_a_helper_that_says_same_skips_it(self) -> None:
        manager.capture(self.store, text="I commute to campus by bus every day.", vault=self.tmp / "V")

        def helper(prompt: str) -> str:
            if prompt.startswith("You keep"):
                return '{"1": "same"}'
            return "I take the bus to campus every day."

        out = manager.capture(self.store, text="I take the bus to campus every day.", model_call=helper,
                              vault=self.tmp / "V")
        self.assertEqual((out.duplicates, out.saved), (1, 0))

    def test_a_helper_that_fails_never_blocks_saving(self) -> None:
        manager.capture(self.store, text="I commute to campus by bus every day.", vault=self.tmp / "V")

        def helper(prompt: str) -> str:
            if prompt.startswith("You keep"):
                raise RuntimeError("offline")
            return "I like hiking in the hills near Sylhet."

        out = manager.capture(self.store, text="I like hiking in the hills near Sylhet.", model_call=helper,
                              vault=self.tmp / "V")
        self.assertEqual(out.saved, 1)

    def test_garbled_answers_are_ignored(self) -> None:
        self.assertIsNone(conflicts.parse_judgement("no idea", 2))
        self.assertEqual(conflicts.parse_judgement('Sure: {"1": "Update", "3": "same"}', 2), {1: "update"})


if __name__ == "__main__":
    unittest.main()
