"""A project folder only appears for a real project name."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from memory_ob import extract, topics  # noqa: E402


class TestProjectGuard(unittest.TestCase):
    def test_report_words_are_never_project_names(self) -> None:
        for bad in ("From", "What", "With", "Note", "Notes", "Windows",
                    "Macos", "Application", "Imports", "Independent", "Report"):
            self.assertFalse(topics.valid_thread_title(bad), bad)

    def test_real_project_names_pass(self) -> None:
        for good in ("Bakery", "Study Buddy", "My Bakery", "Rust Learning"):
            self.assertTrue(topics.valid_thread_title(good), good)

    def test_model_filing_cannot_make_a_junk_project(self) -> None:
        raw = json.dumps([{"text": "My bakery budget is 5 lakh.",
                           "category": "Money", "project": "From", "todo": False, "moment": False}])
        out = extract._candidates_from(raw, {"origin": "test"})
        assert out is not None
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].text, "My bakery budget is 5 lakh.")
        self.assertFalse(out[0].project, "junk project title must be cleared")

    def test_model_filing_keeps_a_real_project(self) -> None:
        raw = json.dumps([{"text": "I am learning Rust for the bakery app.",
                           "category": "Work", "project": "Bakery", "todo": False, "moment": False}])
        out = extract._candidates_from(raw, {"origin": "test"})
        assert out is not None
        self.assertEqual(out[0].project, "Bakery")


if __name__ == "__main__":
    unittest.main()
