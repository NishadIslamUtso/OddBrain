"""Search by meaning must not return everything just because the model scores everything a little.

Real embedding models do not give unrelated sentences a similarity near zero: it is common for
two unrelated lines to still score 0.4 to 0.5, and for the lines that really match to score
0.7 or more. A fixed floor of 0.30 then lets the whole vault through. This stand-in model has
that property on purpose.
"""

from __future__ import annotations

import math
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from memory_ob import embedder  # noqa: E402
from tests.test_laws import make_record  # noqa: E402
from memory_ob.store import Store  # noqa: E402

TOPICS = {                                   # a word -> which topic it belongs to
    "allerg": 0, "peanut": 0, "nuts": 0, "rash": 0,
    "dhaka": 1, "lives": 1, "home": 1, "city": 1,
    "study": 2, "cse": 2, "university": 2, "exam": 2,
    "rent": 3, "salary": 3, "taka": 3, "budget": 3,
    "cricket": 4, "football": 4, "gym": 4, "run": 4,
}


class CommonDirectionModel:
    """Every vector shares a big common part, like real models: unrelated lines still score ~0.5."""

    name = "common"

    def chat(self, slot, messages):  # pragma: no cover
        return ""

    def embed(self, slot, text):
        low = (text or "").lower()
        vec = [0.0] * 6
        for word, idx in TOPICS.items():
            if word in low:
                vec[idx] += 1.0
        topical = math.sqrt(sum(x * x for x in vec)) or 1.0
        vec = [x / topical * 0.85 for x in vec]
        vec[5] = 0.9                           # the shared direction
        return vec


class Case(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.tmp, "t.db"))
        self.model = CommonDirectionModel()
        self.ids = {}
        for key, body in {
            "allergy": "I get a rash if I eat peanuts",
            "home": "My family lives in Dhaka city",
            "study": "I study CSE at university",
            "money": "My rent is 20000 taka",
            "sport": "I play cricket on Fridays",
        }.items():
            r = make_record(title=key, body=body)
            self.store.add_record(r)
            self.ids[key] = r.id
        embedder.ensure_embeddings(self.store, backend=self.model)

    def tearDown(self) -> None:
        self.store.close()

    def found(self, query: str) -> list[str]:
        back = {v: k for k, v in self.ids.items()}
        return [back[r.id] for r in self.store.search_all(query, backend=self.model)]

    def test_the_stand_in_really_scores_unrelated_lines_high(self) -> None:
        a, b = self.model.embed(None, "peanut allergy"), self.model.embed(None, "my rent in taka")
        self.assertGreater(embedder._cosine(a, b), 0.45)      # noqa: SLF001

    def test_a_question_in_other_words_finds_the_right_memory_and_only_that(self) -> None:
        self.assertEqual(self.found("which nuts make me ill, any allergy?"), ["allergy"])

    def test_each_topic_finds_only_itself(self) -> None:
        self.assertEqual(self.found("what is my budget"), ["money"])
        self.assertEqual(self.found("which city is home"), ["home"])
        self.assertEqual(self.found("exam at university"), ["study"])

    def test_a_question_about_nothing_i_know_returns_little_or_nothing(self) -> None:
        got = self.found("zzzz qqqq")
        self.assertLessEqual(len(got), 1)

    def test_two_things_that_both_match_are_both_found(self) -> None:
        self.assertEqual(sorted(self.found("budget and exam")), ["money", "study"])


if __name__ == "__main__":
    unittest.main()
