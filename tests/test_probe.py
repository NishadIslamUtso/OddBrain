"""Remembered "is an AI there?" answers: fast, refreshed in the background, forgotten on a change."""

from __future__ import annotations

import os
import threading
import time
import unittest
from unittest import mock

from memory_ob import hermes, models, probe


class ProbeCase(unittest.TestCase):
    def setUp(self) -> None:
        self._saved = os.environ.pop("MEMORY_OB_NO_PROBE_CACHE", None)
        probe.forget()

    def tearDown(self) -> None:
        probe.forget()
        if self._saved is not None:
            os.environ["MEMORY_OB_NO_PROBE_CACHE"] = self._saved


class TestRemembered(ProbeCase):
    def test_asks_once_then_remembers(self) -> None:
        calls = []
        ask = lambda: calls.append(1) or True  # noqa: E731
        self.assertTrue(probe.remembered("k", ask))
        self.assertTrue(probe.remembered("k", ask))
        self.assertTrue(probe.remembered("k", ask))
        self.assertEqual(len(calls), 1)

    def test_a_no_is_remembered_too(self) -> None:
        calls = []
        ask = lambda: calls.append(1) or False  # noqa: E731
        probe.remembered("k", ask)
        probe.remembered("k", ask)
        self.assertEqual(len(calls), 1)

    def test_old_answers_are_used_at_once_and_refreshed_in_the_background(self) -> None:
        state = {"up": False}
        gate = threading.Event()

        def ask() -> bool:
            gate.wait(2)
            return state["up"]

        gate.set()
        self.assertFalse(probe.remembered("k", ask))
        state["up"] = True
        gate.clear()
        with mock.patch.object(probe, "TTL_NO", 0.0):
            started = time.monotonic()
            self.assertFalse(probe.remembered("k", ask))          # the old answer, without waiting for the probe
            self.assertLess(time.monotonic() - started, 0.5)
            gate.set()
            for _ in range(40):                                    # the refresh lands shortly after
                time.sleep(0.05)
                if probe.remembered("k", ask):
                    break
        self.assertTrue(probe.remembered("k", ask))

    def test_only_one_refresh_runs_at_a_time(self) -> None:
        calls = []
        gate = threading.Event()

        def ask() -> bool:
            calls.append(1)
            gate.wait(2)
            return True

        gate.set()
        probe.remembered("k", ask)
        gate.clear()
        calls.clear()
        with mock.patch.object(probe, "TTL_YES", 0.0):
            for _ in range(5):
                probe.remembered("k", ask)
            time.sleep(0.1)
            self.assertEqual(len(calls), 1)
            gate.set()

    def test_forget_makes_the_next_question_real(self) -> None:
        calls = []
        ask = lambda: calls.append(1) or True  # noqa: E731
        probe.remembered("a", ask)
        probe.remembered("b", ask)
        probe.forget("a")
        probe.remembered("a", ask)
        probe.remembered("b", ask)
        self.assertEqual(len(calls), 3)
        probe.forget()
        probe.remembered("b", ask)
        self.assertEqual(len(calls), 4)

    def test_a_probe_that_crashes_in_the_background_counts_as_not_there(self) -> None:
        probe.remembered("k", lambda: True)

        def boom() -> bool:
            raise RuntimeError("no network")

        with mock.patch.object(probe, "TTL_YES", 0.0):
            probe.remembered("k", boom)
            for _ in range(40):
                time.sleep(0.05)
                if not probe.remembered("k", boom):
                    break
        self.assertFalse(probe.remembered("k", boom))

    def test_switched_off_asks_every_time(self) -> None:
        os.environ["MEMORY_OB_NO_PROBE_CACHE"] = "1"
        calls = []
        ask = lambda: calls.append(1) or True  # noqa: E731
        probe.remembered("k", ask)
        probe.remembered("k", ask)
        self.assertEqual(len(calls), 2)


class TestWhatUsesIt(ProbeCase):
    def test_a_screen_asks_the_network_once_not_every_click(self) -> None:
        slot = models.ModelSlot(provider="ollama", model="x", base_url="http://127.0.0.1:9")
        with mock.patch.object(models, "_server_up", return_value=False) as up:
            for _ in range(6):
                models.is_available(slot)
        self.assertEqual(up.call_count, 1)

    def test_hermes_proxy_is_asked_once_not_every_click(self) -> None:
        with mock.patch.object(hermes, "_proxy_up", return_value=False) as up:
            for _ in range(6):
                hermes.proxy_available()
        self.assertEqual(up.call_count, 1)

    def test_changing_the_ai_settings_looks_again(self) -> None:
        from pathlib import Path
        import tempfile

        from memory_ob import api
        from tests.helpers import AuthedClient

        tmp = Path(tempfile.mkdtemp())
        api.settings = api.Settings.resolve(vault=tmp / "v", db=tmp / "m.db", models_path=tmp / "models.json")
        client = AuthedClient.create(api.create_app(), tmp / "v")
        slot = models.ModelSlot(provider="ollama", model="x", base_url="http://127.0.0.1:9")
        with mock.patch.object(models, "_server_up", return_value=False) as up:
            models.is_available(slot)
            models.is_available(slot)
            self.assertEqual(up.call_count, 1)
            r = client.post("/api/settings/ai", json={"mode": "custom", "reading_model": "x",
                                                      "address": "http://127.0.0.1:9", "meaning_model": ""})
            self.assertEqual(r.status_code, 200, r.text)
            models.is_available(slot)
            self.assertGreaterEqual(up.call_count, 2)

    def test_starting_the_hermes_connection_looks_again(self) -> None:
        from pathlib import Path
        import tempfile

        from memory_ob import api, proxy
        from tests.helpers import AuthedClient

        tmp = Path(tempfile.mkdtemp())
        api.settings = api.Settings.resolve(vault=tmp / "v", db=tmp / "m.db", models_path=tmp / "models.json")
        client = AuthedClient.create(api.create_app(), tmp / "v")
        with mock.patch.object(hermes, "_proxy_up", return_value=False) as up, \
                mock.patch.object(proxy, "start", return_value=True), \
                mock.patch.object(proxy, "status", return_value={"running": True}):
            hermes.proxy_available()
            hermes.proxy_available()
            self.assertEqual(up.call_count, 1)
            self.assertEqual(client.post("/api/proxy/start").status_code, 200)
            hermes.proxy_available()
            self.assertEqual(up.call_count, 2)

    def test_the_server_warms_up_at_start(self) -> None:
        from pathlib import Path
        import tempfile

        from memory_ob import api

        tmp = Path(tempfile.mkdtemp())
        api.settings = api.Settings.resolve(vault=tmp / "v", db=tmp / "m.db", models_path=tmp / "models.json")
        with mock.patch.object(models, "helper_state", return_value={"kind": "none", "ready": "no"}) as hs:
            from fastapi.testclient import TestClient

            with TestClient(api.create_app()):
                for _ in range(40):
                    if hs.called:
                        break
                    time.sleep(0.05)
        self.assertTrue(hs.called)


if __name__ == "__main__":
    unittest.main()
