"""The golden set: real junk from the owner's vault must be rejected, and real
owner sentences must be kept.

The junk strings are copied from the owner's actual vault (2026-11-16..18) -
our own agent narration, an AccountDeck README, and project meta that the
engine filed as the owner's memories. The owner sentences are theirs, including
the "Actually..." and "I must..." ones that a lazy filter would throw away with
the junk.

Run:  python -m unittest tests.test_golden_junk
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob.notlife import is_not_life  # noqa: E402

# Real lines from the owner's vault that are NOT about the owner's life.
JUNK = [
    "Let me fetch 9-13 to complete the reading.",
    "Actually the file has 344 lines; I saw 8 tests.",
    "I must correct this clearly.",
    "Claude's audit found 16 gaps (bugs that lose info + what you asked for that isn't there)",
    "Also mention what you changed in this run and tell me what is still left to do",
    "upload what you did it repo, if there are any changes ofc",
    "So they want me to read the shared conversation to understand what they've been discussing with Claude",
    "Let me hand you the setup (30 seconds) and I'll do the rest myself.",
    "The builders are finally taking from the list — chapters next, and this thing is on rails.",
    "That is 19% of the total weight, so it is left out of the weighted mean and reported here instead.",
    'So MY recommendation list for "what to work on after this" (ordered, plain):',
    "One word from you settles it.",
    "Vault speed with YOUR thousands of notes — confirm it stays smooth.",
    "store.py lost corroborate() (the cross-day repetition counter)",
    "Let me read the final chunks 11-13 to see update-5 + the LATEST state",
    "Actually the chunks seem large; let me prioritize: chunk 5",
    "Model choice narrow (no external AI service with key) — hmm, update-4 llama.cpp...",
    "It compares likely pairs of memories based on shared words",
    "Its notes check compares memory IDs, not the actual note text",
    "The check for private text only covers generated notes, not the check-up report.",
    "mac/ macOS app: SwiftUI, no dependencies (Sources/, Icon/, build.sh, make-dmg.sh)",
    "windows/ Windows app: Electron (src/, test/, assets/, build/, package.json)",
    "**Windows** needs Node.js 18 or newer, and builds from a Mac or a PC:",
    "Click **Done** (not *Move to Trash*).",
]

# Real sentences the owner wrote, which must survive every filter.
OWNER = [
    "I live in Dhaka.",
    "I no longer live in Dhaka.",
    "My knee hurts when I run.",
    "My bakery budget is 5 lakh.",
    "I am learning Rust for the bakery app.",
    "My sister Riya is a doctor and she lives in Sylhet.",
    "I prefer plain language with no technical jargon",
    "I prefer honest calibration over agreement",
    "I want people profiles built for everyone I talk to, including myself",
    "I want the AI to manage memory autonomously and remember what is needed",
    "no ollama i wanna use llama.cpp",
    "Actually, I prefer tea in the morning.",
    "I must call my mum tonight.",
    "I like coffee too.",
    "I study CSE at BRAC University.",
    "I need to renew my passport.",
    "I train three days a week at the gym.",
    "I have a peanut allergy.",
    "I want to start a bakery business next year.",
    "talk like i'm 15",
    "i just want everything smartly done by ai, the AI manages memory completely.",
    "i should randomly info dump in a session and the plugin should take it in and process it accordingly.",
    "isn't it semantic?? why still weak?",
    "every screen takes a lot of time to load",
    "the ai part that takes and saves everything seems dumb",
    "before doing anything discuss first",
    "don't remove the features that is done right",
    "i use hermese, it gives free model access every month, i will use that",
    "i want everything to be like it is in claude or chatgpt",
    "why is it showing reading what was waiting forever",
    "how am i suppose to know if it's actually reading or just stuck",
    "if it doesn't work then why am i doing all this",
    "D1. yes.. wait.. it takes all and keep it then waits for ai.",
    "D4. yess, confirmed. what i decided with claude stays.",
]


class GoldenJunk(unittest.TestCase):
    def test_real_junk_is_rejected(self) -> None:
        leaked = [s for s in JUNK if not is_not_life(s)]
        self.assertEqual(leaked, [], f"these junk lines would be saved as memories: {leaked}")

    def test_owner_sentences_are_kept(self) -> None:
        dropped = [(s, is_not_life(s)) for s in OWNER if is_not_life(s)]
        self.assertEqual(dropped, [], f"these owner sentences were thrown away: {dropped}")


class PastedTranscript(unittest.TestCase):
    """A paste that carries speaker labels is a transcript, not the owner's words."""

    def test_only_the_owners_lines_survive(self) -> None:
        from memory_ob.manager import owner_only

        paste = (
            "User: I live in Dhaka.\n"
            "Assistant: Let me fetch the file and check it.\n"
            "User: My knee hurts when I run.\n"
            "Claude: Actually the file has 344 lines.\n"
            "An unlabelled line about tea."
        )
        out = owner_only(paste)
        self.assertIn("I live in Dhaka.", out)
        self.assertIn("My knee hurts when I run.", out)
        self.assertIn("An unlabelled line about tea.", out)
        self.assertNotIn("Let me fetch the file", out)
        self.assertNotIn("344 lines", out)

    def test_a_paste_with_no_labels_is_untouched(self) -> None:
        from memory_ob.manager import owner_only

        own = "I live in Dhaka. My knee hurts when I run."
        self.assertEqual(owner_only(own), own)


if __name__ == "__main__":
    unittest.main()
