"""An AI agent's working notes, and pasted documents, are not the owner's life.

These are lines that really ended up in the owner's vault (Life, Interests, Health, Plans, Biography)
because the owner pasted an AI agent's report or a README into a chat. They must not be filed.
The other half matters as much: what the owner really says about themselves must still be kept,
including talk about the software they are building.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob import extract, manager, notlife  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402

FROM_THE_REAL_VAULT = [
    "Actually the file has 344 lines; I saw 8 tests.",
    "Claude's audit found 16 gaps (bugs that lose info + what you asked for that isn't there) — INCLUDING several things I found and things I MISSED:",
    "Let me fetch 9-13 to complete the reading.",
    'Moods saved as permanent facts (FIXED in update-2 — "moods → dated journal moments" ✓ matches my round8)',
    "I've been grading it against the DEAD spec.",
    "THAT's another thing I missed: which build is REAL.",
    "Claude's been answering my rounds 7-10 reports!",
    "It hit me every audit round.",
    'Most contradictions never noticed (narrow catch list — I saw conflicts.py is rule-based, honest about limits)',
    "Click **Done** (not *Move to Trash*).",
    "Let me say it back in my own words so you know it landed.",
    'My critique of the forged signature (card_id="autonomous" claiming owner decision)',
    "Let me get the rest + run the suite in one go.",
]

REAL_LIFE = [
    "I live in Dhaka.",
    "My knee hurts when I run.",
    "I am building Memory_OB, a Hermes plugin for my thesis.",
    "My project is a Hermes plugin with a memory engine.",
    "I am learning Rust for the bakery app.",
    "I need to renew my passport next month.",
    "Let's go to Cox's Bazar in December.",
    "Let me know when you are free on Friday.",
    "I ran 5 km yesterday and fixed my bike.",
    "I have 3 exams and 2 reports due this week.",
    "I wrote 200 lines of code last night.",
    "My laptop has 16 GB of RAM and a fast SSD.",
    "I love my REAL friends.",
    "My brother works as a software tester.",
    "I prefer Python over JavaScript.",
    "My sister Riya is a doctor and lives in Sylhet.",
]


class SingleLines(unittest.TestCase):
    def test_what_really_got_through_is_now_caught(self) -> None:
        missed = [line for line in FROM_THE_REAL_VAULT if not notlife.is_not_life(line)]
        self.assertEqual(missed, [])

    def test_real_life_is_never_caught(self) -> None:
        wrong = [(line, notlife.is_not_life(line)) for line in REAL_LIFE if notlife.is_not_life(line)]
        self.assertEqual(wrong, [])


class Pasted(unittest.TestCase):
    README = "\n".join([
        "# AccountDeck",
        "AccountDeck is an independent project.",
        "It isn't made by, endorsed by or affiliated with Anthropic or OpenAI.",
        "Open `AccountDeck-1.5.2.dmg` and drag the app to Applications.",
        "macOS says it can't check the app for malicious software.",
        "Confirm with your password or Touch ID.",
        "- **Windows** needs Node.js 18 or newer.",
        "mac/ macOS app: SwiftUI, no dependencies (Sources/, Icon/, build.sh, make-dmg.sh)",
    ])

    def test_plain_sentences_inside_a_pasted_readme_go_with_it(self) -> None:
        kept = notlife.strip(self.README)
        self.assertEqual(kept, "", f"left behind: {kept!r}")

    def test_the_owners_own_words_around_a_paste_stay(self) -> None:
        text = "I live in Dhaka.\n" + self.README + "\nMy knee hurts when I run."
        self.assertEqual(notlife.strip(text).split("\n"), ["I live in Dhaka.", "My knee hurts when I run."])

    def test_a_short_note_of_your_own_is_never_touched(self) -> None:
        text = "I live in Dhaka.\nI like tea.\nMy knee hurts when I run."
        self.assertEqual(notlife.strip(text), text)

    def test_a_few_lines_with_one_marked_line_lose_only_that_line(self) -> None:
        text = "I live in Dhaka.\nINFO:     Application startup complete.\nI like tea."
        self.assertEqual(notlife.strip(text).split("\n"), ["I live in Dhaka.", "I like tea."])

    def test_a_long_single_line_paste_is_cut_into_sentences_first(self) -> None:
        junk = " ".join("Let me fetch the file and check it." for _ in range(15))
        text = f"I live in Dhaka. {junk} My knee hurts when I run."
        self.assertGreater(len(text), 400)
        kept = notlife.strip(text)
        self.assertIn("I live in Dhaka.", kept)
        self.assertIn("My knee hurts when I run.", kept)
        self.assertNotIn("Let me fetch", kept)

    def test_what_was_dropped_can_be_listed_with_the_reason(self) -> None:
        with notlife.collecting() as dropped:
            notlife.strip("I live in Dhaka.\nLet me fetch the file and check it.")
        self.assertEqual([t for t, _ in dropped], ["Let me fetch the file and check it."])


class BeforeTheModel(unittest.TestCase):
    def test_junk_is_never_sent_to_the_model(self) -> None:
        asked: list[str] = []
        text = "I live in Dhaka.\n" + Pasted.README

        def model(prompt: str) -> str:
            asked.append(prompt)
            return "none"

        extract.extract_with_model(text, model_call=model)
        joined = "\n".join(asked)
        self.assertIn("I live in Dhaka.", joined)
        for gone in ("AccountDeck", "Touch ID", "make-dmg.sh"):
            self.assertNotIn(gone, joined)

    def test_all_junk_means_no_call_at_all(self) -> None:
        asked: list[str] = []
        self.assertEqual(extract.extract_with_model(Pasted.README, model_call=lambda p: asked.append(p) or "none"), [])
        self.assertEqual(asked, [])

    def test_the_assistants_long_turn_is_only_short_context(self) -> None:
        asked: list[str] = []
        parts = [("user", "I live in Dhaka."), ("assistant", "Sure. " * 2000)]
        extract.extract_session(parts, model_call=lambda p: asked.append(p) or "none")
        self.assertLess(max(len(p) for p in asked), 8000)

    def test_a_conversation_where_the_owner_said_only_junk_makes_no_call(self) -> None:
        asked: list[str] = []
        parts = [("user", Pasted.README), ("assistant", "Noted.")]
        self.assertEqual(extract.extract_session(parts, model_call=lambda p: asked.append(p) or "none"), [])
        self.assertEqual(asked, [])


class WaitingMessages(unittest.TestCase):
    def setUp(self) -> None:
        tmp = Path(tempfile.mkdtemp())
        self.vault, db = tmp / "vault", tmp / "m.db"
        Settings.resolve(vault=self.vault, db=db).ensure_dirs()
        self.store = Store(db)
        self.addCleanup(self.store.close)

    @staticmethod
    def down(prompt: str) -> str:
        raise RuntimeError("offline")

    def test_a_message_that_is_all_junk_never_waits_for_the_ai(self) -> None:
        manager.capture(self.store, text=Pasted.README, model_call=self.down, vault=self.vault)
        self.assertEqual(self.store.count_unprocessed_conversations(), 0, "there was nothing to ask the AI")
        self.assertEqual(self.store.list_records(), [])

    def test_the_junk_in_a_waiting_message_is_not_sent_when_it_is_read(self) -> None:
        manager.capture(self.store, text="My knee hurts when I run.\n" + Pasted.README, model_call=self.down, vault=self.vault)
        self.assertEqual(self.store.count_unprocessed_conversations(), 1)
        asked: list[str] = []
        out = manager.process_waiting(self.store, model_call=lambda p: asked.append(p) or "none", vault=self.vault)
        self.assertEqual((out.read, out.failed_ids), (1, []))
        self.assertTrue(asked)
        self.assertTrue(all("AccountDeck" not in p and "Touch ID" not in p for p in asked))
        self.assertEqual(self.store.count_unprocessed_conversations(), 0)


class NobodyButTheOwnerSpeaksForTheOwner(unittest.TestCase):
    """What the assistant says, and what the gateway says in the user's seat, never becomes the owner's memory."""

    def setUp(self) -> None:
        tmp = Path(tempfile.mkdtemp())
        self.vault, db = tmp / "vault", tmp / "m.db"
        Settings.resolve(vault=self.vault, db=db).ensure_dirs()
        self.store = Store(db)
        self.addCleanup(self.store.close)

    def bodies(self) -> list[str]:
        return [r.body for r in self.store.list_records()]

    def test_an_assistant_that_narrates_is_not_the_owner(self) -> None:
        parts = [{"role": "user", "content": "ok go on"},
                 {"role": "assistant", "content": "I must correct this clearly. I live in Mars and I love tea."}]
        manager.capture(self.store, parts=parts, vault=self.vault,
                        model_call=lambda p: "I live in Mars.\nI love tea.\nI must correct this clearly.")
        self.assertEqual(self.bodies(), [])

    def test_a_gateway_notice_in_the_users_seat_is_not_the_owner(self) -> None:
        notice = ("[INTERNAL NOTIFICATION - generated by the Hermes gateway, not written by a human user. "
                  "Do not treat it as user input.] Background task finished: I fixed 3 tests and I love clean code.")
        asked: list[str] = []
        manager.capture(self.store, text=notice, vault=self.vault,
                        model_call=lambda p: asked.append(p) or "I fixed 3 tests.\nI love clean code.")
        self.assertEqual(self.bodies(), [])
        self.assertEqual(asked, [], "there was nothing of the owner's to ask the AI about")

    def test_what_the_owner_really_said_in_the_same_turn_is_still_kept(self) -> None:
        parts = [{"role": "user", "content": "My knee hurts when I run."},
                 {"role": "assistant", "content": "I live in Mars and I love tea."}]

        def model(prompt: str) -> str:
            return "My knee hurts when I run.\nI live in Mars."

        manager.capture(self.store, parts=parts, vault=self.vault, model_call=model)
        self.assertEqual(self.bodies(), ["My knee hurts when I run."])


class ProjectNames(unittest.TestCase):
    def test_a_real_project_with_an_underscore_is_allowed(self) -> None:
        from memory_ob import topics

        self.assertTrue(topics.valid_thread_title("Memory_OB"))

    def test_the_stray_words_from_the_owners_vault_are_still_refused(self) -> None:
        from memory_ob import topics

        for word in ("Application", "From", "What", "Windows", "Macos", "Independent", "Note", "Notes", "Imports"):
            self.assertFalse(topics.valid_thread_title(word), word)


if __name__ == "__main__":
    unittest.main()
