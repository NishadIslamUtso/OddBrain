"""Owner list item A5: the same words always become the same memories.

Before: the same run-on dump filed as 1 memory one run and 4 the next,
depending on how the AI helper happened to split it. Now one canonical cut
decides, so every way of handing the text over converges.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from memory_ob import extract  # noqa: E402

DUMP = ("My knee hurts when I run. It started last week. "
        "I like tea in the morning. I like coffee too.")
PIECES = ["My knee hurts when I run.", "It started last week.",
          "I like tea in the morning.", "I like coffee too."]


def claims(raw) -> list[str]:
    out = extract._candidates_from(json.dumps(raw), {})
    assert out is not None
    return [c.text for c in out]


class StableSplitting(unittest.TestCase):
    def test_one_run_on_claim_and_four_claims_give_the_same_memories(self) -> None:
        one = claims([{"text": DUMP}])
        four = claims([{"text": s} for s in PIECES])
        two_two = claims([{"text": PIECES[0] + " " + PIECES[1]},
                          {"text": PIECES[2] + " " + PIECES[3]}])
        self.assertEqual(one, four)
        self.assertEqual(one, two_two)

    def test_a_continuation_sentence_stays_with_its_statement(self) -> None:
        self.assertEqual(
            claims([{"text": "My knee hurts when I run."}, {"text": "It started last week."}]),
            ["My knee hurts when I run. It started last week."],
            "a fragment like 'It started last week.' is never a memory of its own")

    def test_separate_statements_become_separate_memories(self) -> None:
        self.assertEqual(
            extract.canonical_claims("I live in Dhaka and I study CSE at BRAC University."),
            ["I live in Dhaka.", "I study CSE at BRAC University."])

    def test_the_rules_path_and_the_model_path_agree(self) -> None:
        self.assertEqual(extract.split_claims(DUMP), claims([{"text": DUMP}]))

    def test_filing_of_a_run_on_claim_follows_every_piece(self) -> None:
        out = extract._candidates_from(
            json.dumps([{"text": DUMP, "category": "Health", "todo": False, "moment": False}]), {})
        assert out is not None
        self.assertEqual(len(out), 3)
        self.assertTrue(all(c.category == "Health" for c in out))

    def test_it_is_deterministic(self) -> None:
        again = extract.canonical_claims(DUMP)
        self.assertEqual(extract.canonical_claims(DUMP), again)
        self.assertEqual(again, ["My knee hurts when I run. It started last week.",
                                 "I like tea in the morning.", "I like coffee too."])


if __name__ == "__main__":
    unittest.main()
