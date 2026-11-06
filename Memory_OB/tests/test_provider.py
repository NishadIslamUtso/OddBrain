"""The Hermes MemoryProvider pipe: recall, capture, tools, neverSend."""

from __future__ import annotations

import importlib.util
import os
import shutil
import sys
import time
import unittest
import warnings
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
PROVIDER = PROJECT / "provider" / "memory_ob" / "__init__.py"


def _load_provider_module():
    spec = importlib.util.spec_from_file_location("mob_provider", PROVIDER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load provider from {PROVIDER}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ProviderTestCase(unittest.TestCase):
    """Shared scratch DB so tests never touch the real vault."""

    def setUp(self) -> None:
        import tempfile

        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        os.environ["MEMORY_OB_DB"] = str(root / "test.db")
        os.environ["MEMORY_OB_VAULT"] = str(root / "vault")
        sys.path.insert(0, str(PROJECT / "provider"))
        sys.path.insert(0, str(PROJECT))
        self.mod = _load_provider_module()
        self.provider = self.mod.MemoryOBProvider()
        self.provider.initialize("test-session")

    def tearDown(self) -> None:
        self.provider.shutdown()
        # Windows can still hold the DB open for a moment; don't fail the test.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ResourceWarning)
            shutil.rmtree(self._tmp.name, ignore_errors=True)

    def _seed(self, **kwargs) -> None:
        from memory_ob.records import Record

        store = self.provider._store()
        try:
            store.add_record(Record(**kwargs))
        finally:
            store.close()


class TestDiscovery(ProviderTestCase):
    def test_available_and_named(self) -> None:
        self.assertEqual(self.provider.name, "memory_ob")
        self.assertTrue(self.provider.is_available())

    def test_unavailable_reason_is_actionable(self) -> None:
        self.assertIn("MEMORY_OB_HOME", self.provider.unavailable_reason())

    def test_declares_the_expected_tools(self) -> None:
        names = {t["name"] for t in self.provider.get_tool_schemas()}
        self.assertEqual(
            names,
            {
                "memory_ob_search",
                "memory_ob_capture",
                "memory_ob_review",
                "memory_ob_stats",
                "memory_ob_anonymous",
            },
        )

    def test_system_prompt_block_states_the_law(self) -> None:
        block = self.provider.system_prompt_block()
        self.assertIn("UNVERIFIED", block)
        self.assertIn("owner", block)


class TestRecall(ProviderTestCase):
    def test_short_query_is_skipped(self) -> None:
        self.assertEqual(self.provider.prefetch("hi"), "")

    def test_confirmed_record_is_recalled_with_trust(self) -> None:
        self._seed(
            id="r1",
            kind="profile",
            subject="self",
            speaker="user",
            trust=0.9,
            title="Prefers dark mode",
            body="I prefer dark mode in every app.",
            confirmed_by="card-1",
            status="active",
        )
        block = self.provider.prefetch("which theme do I prefer?")
        self.assertIn("dark mode", block)
        self.assertIn("confirmed", block)
        self.assertEqual(self.provider.recall_status().count, 1)

    def test_candidate_facts_are_labelled_unverified(self) -> None:
        self._seed(
            id="r1",
            kind="profile",
            subject="self",
            speaker="user",
            trust=0.9,
            title="Ships on Fridays",
            body="My team ships on Fridays.",
            confirmed_by="c",
            status="active",
        )
        store = self.provider._store()
        store.add_fact("We ship on Fridays.", trust=0.5)
        store.close()

        block = self.provider.prefetch("when does my team ship?")
        self.assertIn("UNVERIFIED", block)
        self.assertIn("Candidate facts", block)

    def test_never_send_never_leaves_the_store(self) -> None:
        self._seed(
            id="r1",
            kind="profile",
            subject="self",
            speaker="user",
            trust=0.9,
            title="Bank PIN",
            body="my pin is 9999",
            confirmed_by="c",
            status="active",
            never_send=True,
        )
        self.assertEqual(self.provider.prefetch("what is my bank pin?"), "")

    def test_inactive_records_are_not_recalled(self) -> None:
        self._seed(
            id="r1",
            kind="profile",
            subject="self",
            speaker="user",
            trust=0.9,
            title="Retracted fact",
            body="I used to live in Dhaka.",
            confirmed_by="c",
            status="retracted",
        )
        self.assertEqual(self.provider.prefetch("where do I live?"), "")


class TestCapture(ProviderTestCase):
    def test_sync_turn_lands_candidate_facts(self) -> None:
        self.provider.sync_turn(
            "I always write tests first.", "Noted.", session_id="s1"
        )
        self.provider.shutdown()
        store = self.provider._store()
        try:
            facts = [f.get("text") for f in store.list_facts(limit=10)]
        finally:
            store.close()
        self.assertTrue(any("tests" in t for t in facts), facts)

    def test_capture_tool_queues_without_blocking(self) -> None:
        result = self.provider.handle_tool_call(
            "memory_ob_capture", {"text": "I deploy on Fridays."}
        )
        self.assertIn("queued", result)
        self.provider.shutdown()

    def test_pre_compress_captures_and_digests(self) -> None:
        digest = self.provider.on_pre_compress(
            [{"role": "user", "content": "My team ships every second Tuesday."}]
        )
        self.assertIn("pre-compression capture", digest)
        self.provider.shutdown()

    def test_trivial_content_is_not_captured(self) -> None:
        self.provider.sync_turn("ok", "ok", session_id="s1")
        self.provider.shutdown()
        store = self.provider._store()
        try:
            facts = store.list_facts(limit=5)
        finally:
            store.close()
        self.assertEqual(facts, [])


class TestTools(ProviderTestCase):
    def test_search_returns_json_with_context(self) -> None:
        self._seed(
            id="r1",
            kind="profile",
            subject="self",
            speaker="user",
            trust=0.9,
            title="Uses vim",
            body="I use vim for editing.",
            confirmed_by="c",
            status="active",
        )
        out = self.provider.handle_tool_call(
            "memory_ob_search", {"query": "which editor do I use"}
        )
        self.assertIn("vim", out)

    def test_search_requires_a_query(self) -> None:
        out = self.provider.handle_tool_call("memory_ob_search", {})
        self.assertIn("error", out)

    def test_review_lists_pending_cards(self) -> None:
        out = self.provider.handle_tool_call("memory_ob_review", {})
        self.assertIn("pending", out)

    def test_agent_cannot_confirm_or_deny(self) -> None:
        out = self.provider.handle_tool_call(
            "memory_ob_review", {"action": "confirm", "card_id": "c1"}
        )
        self.assertIn("error", out)

    def test_stats_reports_counts(self) -> None:
        self._seed(
            id="r1",
            kind="profile",
            subject="self",
            speaker="user",
            trust=0.9,
            title="Fact",
            body="Something true.",
            confirmed_by="c",
            status="active",
        )
        out = self.provider.handle_tool_call("memory_ob_stats", {})
        self.assertIn('"records": 1', out)
        self.assertIn("pending_cards", out)

    def test_unknown_tool_is_an_error(self) -> None:
        out = self.provider.handle_tool_call("memory_ob_nope", {})
        self.assertIn("error", out)


class TestRegistration(ProviderTestCase):
    def test_register_hands_hermes_the_provider(self) -> None:
        seen: dict[str, object] = {}
        skills: list[str] = []

        class Ctx:
            def register_memory_provider(self, provider) -> None:
                seen["provider"] = provider

            def register_skill(self, *args, **kwargs) -> None:
                skills.append(str(args[0]))

        self.mod.register(Ctx())
        self.assertIsInstance(seen["provider"], self.mod.MemoryOBProvider)
        self.assertIn("memory-full-recall", skills)


if __name__ == "__main__":
    unittest.main()
