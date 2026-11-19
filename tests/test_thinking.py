"""A reasoning model's working-out is not part of its answer."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from memory_ob import models  # noqa: E402


class Thinking(unittest.TestCase):
    def test_the_notes_are_dropped_and_the_answer_kept(self) -> None:
        said = '<think>The user says they live in Dhaka, so I should note that.</think>\n{"text": "I live in Dhaka"}'
        self.assertEqual(models.without_thinking(said), '{"text": "I live in Dhaka"}')

    def test_other_spellings_and_several_blocks(self) -> None:
        self.assertEqual(models.without_thinking("<Thinking>a</Thinking>x<reasoning>b</reasoning>y"), "xy")

    def test_an_answer_cut_off_while_thinking_is_no_answer(self) -> None:
        self.assertEqual(models.without_thinking("<think>The user says they"), "")

    def test_an_ordinary_answer_and_nothing_are_left_alone(self) -> None:
        self.assertEqual(models.without_thinking("  plain answer \n"), "plain answer")
        self.assertEqual(models.without_thinking(None), "")

    def test_the_callable_the_app_uses_strips_it(self) -> None:
        class Backend:
            name = "x"

            def chat(self, slot, messages):
                return "<think>hmm</think>none"

        original = models.resolve_backend
        models.resolve_backend = lambda cfg=None: Backend()
        try:
            self.assertEqual(models.model_call("extract")("anything"), "none")
        finally:
            models.resolve_backend = original


if __name__ == "__main__":
    unittest.main()
