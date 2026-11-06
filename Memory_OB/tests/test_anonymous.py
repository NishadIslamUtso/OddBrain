"""Anonymous mode (§7): no recall injected, nothing captured."""

from __future__ import annotations

import importlib.util
import os
import shutil
import sys
import tempfile
import unittest
import warnings
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
PROVIDER = PROJECT / "provider" / "memory_ob" / "__init__.py"


def _load_provider():
    spec = importlib.util.spec_from_file_location("mob_provider_anon", PROVIDER)
    if spec is None or spec.loader is None:
        raise RuntimeError("provider not found")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AnonymousCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = Path(self.tmp) / "vault"
        self.db = Path(self.tmp) / "mob.db"
        os.environ["MEMORY_OB_VAULT"] = str(self.vault)
        os.environ["MEMORY_OB_DB"] = str(self.db)
        sys.path.insert(0, str(PROJECT / "provider"))
        sys.path.insert(0, str(PROJECT))
        self.mod = _load_provider()
        self.provider = self.mod.MemoryOBProvider()
        self.provider.initialize("s")
        from memory_ob import anonymous, records
        from memory_ob.store import Store

        self.anonymous = anonymous
        self.records = records
        self.store = Store(self.db)
        self.store.add_record(
            records.Record(
                id="r1",
                kind="profile",
                subject="self",
                speaker="user",
                trust=0.9,
                title="Prefers dark mode",
                body="I prefer dark mode in every app.",
                status="active",
            )
        )

    def tearDown(self) -> None:
        self.provider.shutdown()
        self.store.close()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ResourceWarning)
            shutil.rmtree(self.tmp, ignore_errors=True)


class TestFlag(AnonymousCase):
    def test_off_by_default(self) -> None:
        self.assertFalse(self.anonymous.is_anonymous(self.vault))

    def test_flag_lives_outside_git(self) -> None:
        self.anonymous.set_anonymous(self.vault, True)
        flag = self.vault / ".brain" / "anonymous"
        self.assertTrue(flag.is_file())
        self.assertEqual(flag.read_text(encoding="utf-8").strip(), "on")

    def test_toggle(self) -> None:
        self.anonymous.set_anonymous(self.vault, True)
        self.assertFalse(self.anonymous.toggle(self.vault))   # on -> off
        self.assertTrue(self.anonymous.toggle(self.vault))    # off -> on

    def test_describe(self) -> None:
        self.assertIn("off", self.anonymous.describe(self.vault))
        self.anonymous.set_anonymous(self.vault, True)
        self.assertIn("ON", self.anonymous.describe(self.vault))


class TestProviderObeys(AnonymousCase):
    def test_recall_works_when_off(self) -> None:
        block = self.provider.prefetch("which theme do I prefer?")
        self.assertIn("dark mode", block)

    def test_recall_silent_when_on(self) -> None:
        self.anonymous.set_anonymous(self.vault, True)
        self.assertEqual(self.provider.prefetch("which theme do I prefer?"), "")

    def test_capture_silent_when_on(self) -> None:
        self.anonymous.set_anonymous(self.vault, True)
        self.provider.sync_turn("I have used git since 2019.", "ok", session_id="s")
        self.provider.shutdown()
        facts = [f.get("text") for f in self.store.list_facts(limit=10)]
        self.assertEqual(facts, [])

    def test_capture_works_when_off(self) -> None:
        self.provider.sync_turn("I have used git since 2019.", "ok", session_id="s")
        self.provider.shutdown()
        facts = [f.get("text") for f in self.store.list_facts(limit=10)]
        self.assertTrue(any("git" in t for t in facts), facts)

    def test_restores_immediately(self) -> None:
        self.anonymous.set_anonymous(self.vault, True)
        self.anonymous.set_anonymous(self.vault, False)
        self.assertIn("dark mode", self.provider.prefetch("which theme do I prefer?"))

    def test_prompt_block_says_anonymous(self) -> None:
        self.anonymous.set_anonymous(self.vault, True)
        self.assertIn("ANONYMOUS MODE IS ON", self.provider.system_prompt_block())

    def test_prompt_block_normal_when_off(self) -> None:
        self.assertNotIn("ANONYMOUS", self.provider.system_prompt_block())


class TestAnonymousTool(AnonymousCase):
    def test_status(self) -> None:
        out = self.provider.handle_tool_call("memory_ob_anonymous", {"action": "status"})
        self.assertIn('"anonymous": false', out)

    def test_on_and_off(self) -> None:
        self.provider.handle_tool_call("memory_ob_anonymous", {"action": "on"})
        self.assertTrue(self.anonymous.is_anonymous(self.vault))
        self.provider.handle_tool_call("memory_ob_anonymous", {"action": "off"})
        self.assertFalse(self.anonymous.is_anonymous(self.vault))

    def test_bad_action(self) -> None:
        out = self.provider.handle_tool_call("memory_ob_anonymous", {"action": "sideways"})
        self.assertIn("error", out)


class TestApi(AnonymousCase):
    def _client(self):
        from memory_ob import api
        from tests.helpers import AuthedClient

        api.settings = api.Settings.resolve(vault=self.vault, db=self.db)
        return AuthedClient.create(api.create_app(), self.vault)

    def test_status_endpoint(self) -> None:
        body = self._client().get("/api/anonymous").json()
        self.assertFalse(body["anonymous"])

    def test_set_endpoint(self) -> None:
        client = self._client()
        client.post("/api/anonymous", json={"anonymous": True})
        self.assertTrue(self.anonymous.is_anonymous(self.vault))
        client.post("/api/anonymous", json={"anonymous": False})
        self.assertFalse(self.anonymous.is_anonymous(self.vault))


if __name__ == "__main__":
    unittest.main()
