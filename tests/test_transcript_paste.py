"""A pasted chat transcript is read for the owner's side only, and nothing of the owner's is ever lost.

The rule that did this first threw away ordinary notes ("System: I sleep at 11pm"), and let an assistant's
second paragraph through as if the owner had written it. Both are tested here.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from memory_ob.manager import owner_only  # noqa: E402


class WhatIsLeftOfATranscript(unittest.TestCase):
    def test_the_assistants_lines_go_and_the_owners_stay(self) -> None:
        got = owner_only("User: My knee hurts when I run.\nAssistant: Rest it for a week.\nUser: I live in Dhaka.")
        self.assertEqual(got, "My knee hurts when I run.\nI live in Dhaka.")

    def test_an_assistant_reply_over_several_lines_is_all_dropped(self) -> None:
        got = owner_only("User: I want a plan for my week.\nAssistant: Sure. Here it is:\n1. Wake at 6\n2. Run 5 km\n\n"
                         "Hope that helps!\nUser: thanks, I drink tea every morning.")
        self.assertNotIn("Wake at 6", got)
        self.assertNotIn("Hope that helps", got)
        self.assertIn("I want a plan for my week.", got)
        self.assertIn("I drink tea every morning.", got)

    def test_an_owner_message_over_several_lines_is_all_kept(self) -> None:
        got = owner_only("User: Three things about me.\nI live in Dhaka.\nI study CSE.\nAssistant: Noted.")
        self.assertEqual(got, "Three things about me.\nI live in Dhaka.\nI study CSE.")

    def test_bold_labels_and_other_assistant_names_work(self) -> None:
        got = owner_only("**You:** I like cricket.\n**ChatGPT:** Great sport.\n**You:** I play on Fridays.")
        self.assertEqual(got, "I like cricket.\nI play on Fridays.")

    def test_text_before_the_first_label_is_the_owners(self) -> None:
        self.assertEqual(owner_only("My notes from today.\nUser: hi\nAssistant: hello"), "My notes from today.\nhi")


class NothingOfTheOwnersIsLost(unittest.TestCase):
    NOTES = [
        "System: I sleep at 11pm and wake at 6am every day.",
        "Tool: cordless drill, needs a new battery\nI live in Dhaka and I study CSE.",
        "Model: Honda Civic 2015\nI drive to campus on Sundays.",
        "Agent: my sister's nickname for me is Bhai.",
        "AI: my favourite subject at university.",
        "Me: tall, 70 kg.\nI go to the gym three times a week.",
        "You: should call mum on Fridays.\nI miss home.",
        "Time: 5pm every Friday is my call with mum.",
    ]

    def test_an_ordinary_note_comes_back_exactly_as_it_was(self) -> None:
        for note in self.NOTES:
            self.assertEqual(owner_only(note), note, note)

    def test_one_side_only_is_not_a_transcript(self) -> None:
        text = "Assistant: I can help with that.\nAssistant: Here is a list."
        self.assertEqual(owner_only(text), text)

    def test_empty_and_none(self) -> None:
        self.assertEqual(owner_only(""), "")
        self.assertEqual(owner_only(None), "")           # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
