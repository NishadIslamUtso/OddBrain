"""A very long pasted message is read in pieces, and the owner can see which piece.

A 75 KB conversation pasted in one go used to be sent to the AI helper whole. A free model took
longer than the time limit, so it read nothing, and the screen said "Reading…" for minutes.

* Text and conversations are cut at sentence/turn ends into pieces of at most 12,000 characters.
* One huge pasted turn is cut as well (it used to stay in one piece).
* If any piece cannot be read, the whole message is kept waiting, never half-read.
* The screen is told "piece i of n" as it goes.
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))
sys.path.insert(0, str(PROJECT / "tests" / "browser"))

from memory_ob import extract, manager  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402

LIMIT = extract._CHUNK_LIMIT


def long_text(sentences: int = 1800) -> str:
    return " ".join(f"I did thing number {n} on my day off." for n in range(sentences))


class CuttingText(unittest.TestCase):
    def test_short_text_is_one_piece(self) -> None:
        self.assertEqual(extract._split_long("I live in Dhaka."), ["I live in Dhaka."])

    def test_a_long_paste_is_cut_into_pieces_under_the_limit(self) -> None:
        text = long_text()
        self.assertGreater(len(text), 60000)
        pieces = extract._split_long(text)
        self.assertGreater(len(pieces), 4)
        self.assertTrue(all(len(p) <= LIMIT for p in pieces))

    def test_pieces_end_at_sentence_ends_and_lose_no_words(self) -> None:
        text = long_text()
        pieces = extract._split_long(text)
        self.assertTrue(all(p.rstrip().endswith(".") for p in pieces[:-1]))
        self.assertEqual(" ".join(" ".join(pieces).split()), " ".join(text.split()))

    def test_one_endless_sentence_is_still_cut(self) -> None:
        pieces = extract._split_long("word " * 9000)
        self.assertTrue(all(len(p) <= LIMIT for p in pieces))


class ReadingInPieces(unittest.TestCase):
    def reader(self, seen: list[int]):
        def call(prompt: str) -> str:
            seen.append(len(prompt))
            return "none"
        return call

    def test_a_long_text_makes_one_call_per_piece(self) -> None:
        seen: list[int] = []
        extract.extract_with_model(long_text(), model_call=self.reader(seen))
        self.assertGreater(len(seen), 4)
        self.assertLess(max(seen), LIMIT + 6000, "no single prompt is anywhere near the whole 75 KB")

    def test_one_huge_pasted_turn_in_a_conversation_is_cut_too(self) -> None:
        seen: list[int] = []
        parts = [("user", long_text()), ("assistant", "Noted.")]
        extract.extract_session(parts, model_call=self.reader(seen))
        self.assertGreater(len(seen), 4)
        self.assertLess(max(seen), LIMIT + 6000)

    def test_a_piece_that_cannot_be_read_keeps_the_whole_message_waiting(self) -> None:
        calls = {"n": 0}

        def third_fails(prompt: str) -> str:
            calls["n"] += 1
            if calls["n"] == 3:
                raise RuntimeError("timed out")
            return "none"

        self.assertIsNone(extract.extract_with_model(long_text(), model_call=third_fails))
        self.assertEqual(calls["n"], 3, "it stopped at the piece it could not read")

    def test_an_unreadable_answer_for_one_piece_gives_none(self) -> None:
        calls = {"n": 0}

        def junk_second(prompt: str) -> str:
            calls["n"] += 1
            return "I am sorry, but I cannot help with that." if calls["n"] == 2 else "none"

        self.assertIsNone(extract.extract_with_model(long_text(), model_call=junk_second))

    def test_the_same_claim_from_two_pieces_is_kept_once(self) -> None:
        line = json.dumps({"text": "I live in Dhaka.", "category": "Life", "about": "me"})
        got = extract.extract_with_model(long_text(), model_call=lambda p: line)
        self.assertEqual([c.text for c in got].count("I live in Dhaka."), 1)

    def test_the_screen_is_told_which_piece(self) -> None:
        ticks: list[tuple[int, int]] = []
        with extract.watching_pieces(lambda i, n: ticks.append((i, n))):
            extract.extract_with_model(long_text(), model_call=lambda p: "none")
        n = ticks[0][1]
        self.assertEqual(ticks, [(i, n) for i in range(1, n + 1)])
        self.assertGreater(n, 4)

    def test_no_ticks_outside_the_block(self) -> None:
        extract.extract_with_model("I live in Dhaka.", model_call=lambda p: "none")   # no listener: nothing happens

    def test_a_listener_that_breaks_does_not_stop_the_reading(self) -> None:
        def broken(i: int, n: int) -> None:
            raise RuntimeError("screen gone")

        with extract.watching_pieces(broken):
            got = extract.extract_with_model(long_text(40), model_call=lambda p: "none")
        self.assertEqual(got, [])


class ThroughTheReader(unittest.TestCase):
    def test_a_waiting_long_message_reports_its_pieces_and_is_read_whole(self) -> None:
        tmp = Path(tempfile.mkdtemp())
        vault, db = tmp / "vault", tmp / "m.db"
        Settings.resolve(vault=vault, db=db).ensure_dirs()
        store = Store(db)
        self.addCleanup(store.close)

        def down(prompt: str) -> str:
            raise RuntimeError("offline")

        manager.capture(store, text=long_text(1500) + " My knee hurts when I run.", model_call=down, vault=vault)
        seen: list[tuple[str, dict]] = []
        fact = json.dumps({"text": "My knee hurts when I run.", "category": "Health", "note": "", "project": "",
                           "todo": False, "moment": False, "about": "me", "people": [], "sentiment": "", "context": ""})
        only_the_knee = lambda prompt: fact if "knee" in prompt else "none"   # noqa: E731
        out = manager.process_waiting(store, model_call=only_the_knee, vault=vault,
                                      on_event=lambda k, d: seen.append((k, d)))
        self.assertEqual(out.read, 1)
        self.assertEqual([r.body for r in store.list_records(status="active")], ["My knee hurts when I run."])
        pieces = [d for k, d in seen if k == "piece"]
        self.assertGreater(len(pieces), 3)
        self.assertEqual(pieces[-1]["part"], pieces[-1]["parts"])
        self.assertEqual(store.count_unprocessed_conversations(), 0)


if __name__ == "__main__":
    unittest.main()
