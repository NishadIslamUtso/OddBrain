"""What Hermes is told at the start of a session, and the anonymous-mode tool guard."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.test_provider import ProviderTestCase  # noqa: E402


class Reminders(ProviderTestCase):
    def _say(self, text: str):
        from memory_ob import manager

        store = self.provider._store()
        try:
            return manager.capture(store, text=text, vault=self.vault)
        finally:
            store.close()

    def test_open_todos_are_listed_as_data_not_instructions(self) -> None:
        self._say("I need to renew my passport.")
        block = self.provider.system_prompt_block()
        self.assertIn("renew my passport", block)
        self.assertIn("not instructions", block)
        self.assertIn("never nag", block)

    def test_nothing_is_added_when_there_is_nothing_to_do(self) -> None:
        self._say("I live in Dhaka.")
        self.assertNotIn("still has on their list", self.provider.system_prompt_block())

    def test_a_private_todo_is_never_listed(self) -> None:
        from memory_ob import manager

        out = self._say("I need to renew my passport.")
        store = self.provider._store()
        try:
            manager.make_private(store, out.record_ids[0], vault=self.vault)
        finally:
            store.close()
        self.assertNotIn("passport", self.provider.system_prompt_block())

    def test_a_done_todo_is_not_listed(self) -> None:
        from memory_ob import manager

        out = self._say("I need to renew my passport.")
        store = self.provider._store()
        try:
            manager.mark_done(store, out.record_ids[0], vault=self.vault)
        finally:
            store.close()
        self.assertNotIn("passport", self.provider.system_prompt_block())


class AnonymousGuard(ProviderTestCase):
    def test_search_capture_and_review_are_refused_while_anonymous(self) -> None:
        from memory_ob import anonymous

        anonymous.set_anonymous(self.vault, True)
        for tool, args in [("memory_ob_search", {"query": "passport"}),
                           ("memory_ob_capture", {"text": "I live in Dhaka."}),
                           ("memory_ob_review", {"action": "list"})]:
            out = json.loads(self.provider.handle_tool_call(tool, args))
            self.assertIn("Anonymous mode is on", json.dumps(out), tool)
        store = self.provider._store()
        try:
            self.assertEqual(store.list_records(include_private=True), [])
        finally:
            store.close()

    def test_the_owner_can_turn_it_off_and_tools_work_again(self) -> None:
        from memory_ob import anonymous

        anonymous.set_anonymous(self.vault, True)
        self.provider.handle_tool_call("memory_ob_anonymous", {"action": "off"})
        out = self.provider.handle_tool_call("memory_ob_search", {"query": "passport"})
        self.assertNotIn("Anonymous mode is on", out)


if __name__ == "__main__":
    unittest.main()
