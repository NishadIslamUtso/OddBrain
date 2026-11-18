"""Owner decision D1: when the AI helper does not read a message, the message
is kept WHOLE and read again later. Simple rules never fragment and file it.

The only jobs rules still do while a message waits: hiding secrets and
"forget" commands.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from memory_ob import manager  # noqa: E402
from memory_ob.store import Store  # noqa: E402


class WaitForAi(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = Path(self.tmp.name) / "V"
        self.store = Store(Path(self.tmp.name) / "s.db")

    def tearDown(self) -> None:
        self.store.close()
        self.tmp.cleanup()

    def _broken(self, prompt: str) -> str:
        raise RuntimeError("offline")

    def test_a_failed_helper_keeps_the_message_whole(self) -> None:
        out = manager.capture(
            self.store, text="My bakery budget is 5 lakh and I am learning Rust for the bakery app.",
            model_call=self._broken, vault=self.vault)
        self.assertEqual((out.saved, out.aside), (0, 1))
        self.assertEqual(self.store.list_records(), [], "rules must not fragment it")
        self.assertEqual(self.store.count_unprocessed_conversations(), 1)

    def test_the_owner_is_told_in_plain_words(self) -> None:
        out = manager.capture(self.store, text="My knee hurts when I run.",
                              model_call=self._broken, vault=self.vault)
        self.assertIn("did not answer properly", manager.describe(out))

    def test_an_empty_answer_is_no_answer(self) -> None:
        out = manager.capture(self.store, text="My knee hurts when I run.",
                              model_call=lambda p: "   ", vault=self.vault)
        self.assertEqual(out.aside, 1)

    def test_a_refusal_is_no_answer(self) -> None:
        out = manager.capture(
            self.store, text="My knee hurts when I run.",
            model_call=lambda p: "I am sorry but I cannot do that right now.", vault=self.vault)
        self.assertEqual(out.aside, 1)

    def test_none_means_read_and_kept_nothing(self) -> None:
        out = manager.capture(self.store, text="nothing important here",
                              model_call=lambda p: "none", vault=self.vault)
        self.assertEqual((out.saved, out.aside), (0, 0))
        self.assertEqual(self.store.count_unprocessed_conversations(), 0)

    def test_when_the_helper_returns_the_whole_message_is_read(self) -> None:
        manager.capture(self.store, text="My bakery budget is 5 lakh. I am learning Rust.",
                        model_call=self._broken, vault=self.vault)

        def good(prompt: str) -> str:
            return json.dumps([{"text": "My bakery budget is 5 lakh."},
                               {"text": "I am learning Rust."}])

        out = manager.process_waiting(self.store, model_call=good, vault=self.vault)
        self.assertEqual((out.read, out.saved), (1, 2))
        self.assertEqual(self.store.count_unprocessed_conversations(), 0)

    def test_a_still_broken_helper_changes_nothing(self) -> None:
        manager.capture(self.store, text="My knee hurts when I run.",
                        model_call=self._broken, vault=self.vault)
        out = manager.process_waiting(self.store, model_call=self._broken, vault=self.vault)
        self.assertEqual((out.read, out.saved), (0, 0))
        self.assertEqual(self.store.count_unprocessed_conversations(), 1)

    def test_secrets_are_still_hidden_while_it_waits(self) -> None:
        out = manager.capture(self.store, text="My wifi password is hunter2 and my knee hurts.",
                              model_call=self._broken, vault=self.vault)
        self.assertEqual(out.secret, 1)
        conv = self.store.get_conversation(out.conversation_id)
        self.assertNotIn("hunter2", conv["text"])

    def test_forget_commands_still_work_without_a_helper(self) -> None:
        def good(prompt: str) -> str:
            return json.dumps([{"text": "I like mangoes."}])

        manager.capture(self.store, text="I like mangoes.", model_call=good, vault=self.vault)
        self.assertEqual(len(self.store.list_records()), 1)
        out = manager.capture(self.store, text="forget that I like mangoes",
                              model_call=self._broken, vault=self.vault)
        self.assertEqual(out.forgotten, 1)
        self.assertEqual(self.store.list_records(status='active'), [])  # trashed, never lost


if __name__ == "__main__":
    unittest.main()
