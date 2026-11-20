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

# --- owner item E3: the "3 vs 4" split wobble -------------------------------
#
# The same words must not become 3 memories when read in one go and 4 when cut
# into pieces (a long chat is read piece by piece). A sentence that only
# continues the one before it ("It started last week.") must never be read
# apart from it.

import json as _json
import re as _re
from unittest import mock as _mock

from memory_ob import extract as _ex


def _piece_aware(shape: str):
    """A model that answers only about the piece the prompt carries."""
    def call(prompt: str) -> str:
        body = prompt.split("Text:\n", 1)[1] if "Text:\n" in prompt else prompt
        sents = [s.strip() for s in _re.split(r"(?<=[.!?])\s+", body.strip()) if s.strip()]
        if shape == "per-sentence":
            texts = sents
        elif shape == "run-on":
            texts = [" ".join(sents)]
        else:                                   # "pairs"
            texts = [" ".join(sents[i:i + 2]) for i in range(0, len(sents), 2)]
        return _json.dumps([{"text": t} for t in texts])
    return call


class PieceWobble(unittest.TestCase):
    DUMP = ("My knee hurts when I run. It started last week. "
            "I like tea in the morning. I like coffee too.")

    def _forced_split(self, limit: int):
        orig = _ex._split_long
        return _mock.patch.object(_ex, "_split_long", lambda t, l=0: orig(t, limit))

    def test_same_memories_whether_read_whole_or_in_pieces(self):
        for shape in ("per-sentence", "run-on", "pairs"):
            whole = _ex.extract_with_model(self.DUMP, model_call=_piece_aware(shape))
            with self._forced_split(42):
                cut = _ex.extract_with_model(self.DUMP, model_call=_piece_aware(shape))
            self.assertEqual([c.text for c in whole], [c.text for c in cut],
                             f"shape {shape}: cutting the text changed the memories")
            self.assertEqual(len(whole), 3, f"shape {shape}: expected 3 memories")

    def test_continuation_is_never_left_behind_at_a_piece_edge(self):
        # With a tiny piece size the cut wants to fall right before
        # "It started last week."; it must travel with the sentence it continues.
        orig = _ex._split_long
        pieces = orig(self.DUMP, 42)
        self.assertGreater(len(pieces), 1, "test needs forced pieces")
        with self._forced_split(42):
            got = _ex.extract_with_model(self.DUMP, model_call=_piece_aware("per-sentence"))
        texts = [c.text for c in got]
        self.assertFalse(any(t.strip().startswith("It started") for t in texts),
                         f"a continuation became its own memory: {texts}")
        self.assertTrue(any("It started last week." in t for t in texts))

    def test_a_huge_sentence_keeps_its_continuation_too(self):
        long_say = ("Yesterday I spent the whole afternoon reorganizing my desk "
                    "drawer with every pen cable and notebook taken out and sorted ")
        dump = long_say * 2 + "and put back neatly. It took longer than planned."
        got = _ex.extract_with_model(dump, model_call=_piece_aware("per-sentence"))
        texts = [c.text for c in got]
        self.assertFalse(any(t.strip().startswith("It took") for t in texts),
                         f"a continuation after a huge sentence became its own memory: {texts}")
        self.assertTrue(any("It took longer than planned." in t for t in texts))
