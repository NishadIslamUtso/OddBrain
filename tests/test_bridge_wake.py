"""The owner presses "Read now" or "Test the AI helper" while Hermes's AI connection is switched off.

On the real machine nothing was listening on port 8645: the connection (``hermes proxy``) was simply off, and
nothing ever switched it on, so nothing was ever read. Now the owner's own click switches it on, and says so.
It is never switched on in the background, and never for an owner who chose another AI.
"""

from __future__ import annotations

import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))
sys.path.insert(0, str(PROJECT / "tests" / "browser"))

import fake_ai  # noqa: E402
from memory_ob import api, hermes, manager, models, proxy, reader  # noqa: E402
from memory_ob.models import ModelConfig, ModelSlot  # noqa: E402
from tests.helpers import AuthedClient  # noqa: E402


class Ensure(unittest.TestCase):
    def test_already_on_nothing_is_started(self) -> None:
        with mock.patch.object(proxy, "running", return_value=True), mock.patch.object(proxy, "start") as start:
            self.assertEqual(proxy.ensure(), "ready")
        start.assert_not_called()

    def test_no_hermes_here_nothing_is_started(self) -> None:
        with mock.patch.object(proxy, "running", return_value=False), \
                mock.patch.object(hermes, "HERMES_EXE", Path("/nowhere/hermes")), mock.patch.object(proxy, "start") as start:
            self.assertEqual(proxy.ensure(), "no_hermes")
        start.assert_not_called()

    def test_off_it_is_switched_on_or_it_says_it_could_not(self) -> None:
        exe = Path(tempfile.mkdtemp()) / "hermes"
        exe.write_text("x")
        with mock.patch.object(proxy, "running", return_value=False), mock.patch.object(hermes, "HERMES_EXE", exe):
            with mock.patch.object(proxy, "start", return_value=True):
                self.assertEqual(proxy.ensure(), "started")
            with mock.patch.object(proxy, "start", return_value=False):
                self.assertEqual(proxy.ensure(), "failed")


class OnTheScreen(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        vault, db = self.tmp / "vault", self.tmp / "m.db"
        api.settings = api.Settings.resolve(vault=vault, db=db, models_path=self.tmp / "models.json")
        api.settings.ensure_dirs()
        self.client = AuthedClient.create(api.create_app(), vault)
        self.vault, self.db = vault, db
        self.on = False                      # is Hermes's AI connection on?
        self.ensure_calls = 0
        self._helper = models.helper
        models.helper = lambda cfg=None, slot_name="extract": fake_ai.fake if self.on else None
        self.addCleanup(setattr, models, "helper", self._helper)

    def tearDown(self) -> None:
        for _ in range(100):
            if not reader.progress()["running"]:
                break
            time.sleep(0.05)

    def ensure_returns(self, answer: str):
        def ensure(**kw):
            self.ensure_calls += 1
            if answer == "started":
                self.on = True
            return answer
        return mock.patch.object(proxy, "ensure", side_effect=ensure)

    def test_the_test_button_switches_it_on_and_says_so(self) -> None:
        with self.ensure_returns("started"):
            r = self.client.post("/api/settings/ai/test").json()
        self.assertEqual((r["ok"], r["bridge"]), (True, "started"))

    def test_when_it_will_not_come_up_the_owner_is_told_in_words(self) -> None:
        with self.ensure_returns("failed"):
            r = self.client.post("/api/settings/ai/test").json()
        self.assertEqual((r["ok"], r["reason"], r["bridge"]), (False, "no_helper", "failed"))

    def test_when_it_is_already_on_nothing_is_started(self) -> None:
        self.on = True
        with self.ensure_returns("started"):
            r = self.client.post("/api/settings/ai/test").json()
        self.assertEqual((r["ok"], r["bridge"], self.ensure_calls), (True, "", 0))

    def test_an_owner_who_chose_another_ai_never_has_hermes_started(self) -> None:
        ModelConfig(main=ModelSlot(provider="ollama", model="llama3", base_url="http://127.0.0.1:11434")).save(
            api.settings.models_path)
        with self.ensure_returns("started"):
            r = self.client.post("/api/settings/ai/test").json()
        self.assertEqual((r["reason"], self.ensure_calls), ("no_helper", 0))

    def test_read_now_switches_it_on_and_reads(self) -> None:
        from memory_ob.store import Store

        with Store(self.db) as st:
            manager.capture(st, text="I drink tea every morning.", model_call=lambda p: (_ for _ in ()).throw(RuntimeError("off")),
                            vault=self.vault)
        with self.ensure_returns("started"):
            r = self.client.post("/api/waiting/read").json()
        self.assertEqual((r["started"], r["bridge"]), (True, "started"))

    def test_read_now_when_it_will_not_come_up_keeps_the_words_and_says_why(self) -> None:
        from memory_ob.store import Store

        with Store(self.db) as st:
            manager.capture(st, text="I drink tea every morning.", model_call=lambda p: (_ for _ in ()).throw(RuntimeError("off")),
                            vault=self.vault)
        with self.ensure_returns("failed"):
            r = self.client.post("/api/waiting/read").json()
        self.assertEqual((r["started"], r["reason"], r["bridge"]), (False, "no_helper", "failed"))
        with Store(self.db) as st:
            self.assertEqual(st.count_unprocessed_conversations(), 1)

    def test_nothing_is_started_when_nothing_is_waiting(self) -> None:
        with self.ensure_returns("started"):
            r = self.client.post("/api/waiting/read").json()
        self.assertEqual((r["reason"], self.ensure_calls), ("nothing", 0))


if __name__ == "__main__":
    unittest.main()
