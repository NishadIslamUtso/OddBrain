"""“Keep everything on this computer” holds: with it on, no request goes to any address that is not this computer."""

from __future__ import annotations

import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob import models  # noqa: E402
from memory_ob.models import ModelConfig, ModelError, ModelSlot  # noqa: E402

REMOTE = ["http://203.0.113.5:11434", "http://192.168.1.20:11434", "https://api.example.com/v1",
          "http://my-pc:11434", "http://my-pc.local:8080", "https://localhost.example.com", "https://example.com/?127.0.0.1",
          "http://10.0.0.2:8080/v1", "http://localhost.evil.net", "http://127.0.0.1.evil.net"]
LOCAL = ["http://localhost:11434", "http://127.0.0.1:8080/v1", "http://127.0.0.5:1234", "http://[::1]:11434",
         "localhost:11434", "http://LOCALHOST:8080", "http://0.0.0.0:8080", "http://[::ffff:127.0.0.1]:8080"]


def stop(srv: HTTPServer) -> None:
    srv.shutdown()
    srv.server_close()


def boom(*_a, **_k):
    raise AssertionError("a request left for the network")


class WhatIsThisComputer(unittest.TestCase):
    def test_only_this_computer_counts(self) -> None:
        for a in LOCAL:
            self.assertTrue(models.is_this_computer(a), a)
        for a in REMOTE + ["", "not a url at all", "http://"]:
            self.assertFalse(models.is_this_computer(a), a)

    def test_a_provider_name_cannot_make_a_far_address_local(self) -> None:
        for provider in ("ollama", "custom", "local", "lmstudio", "vllm", "llamacpp", "openai-compatible", "auto"):
            self.assertFalse(ModelSlot(provider=provider, base_url="http://203.0.113.5:11434").is_local, provider)
            self.assertTrue(ModelSlot(provider=provider, base_url="http://127.0.0.1:11434").is_local, provider)
        self.assertTrue(ModelSlot(provider="ollama").is_local)               # no address: the usual local one


class Case(unittest.TestCase):
    def setUp(self) -> None:
        for patcher in (mock.patch.object(models, "_LOCAL_ONLY", True), mock.patch.object(models, "_VAULT", None),
                        mock.patch.dict("os.environ", {"OPENAI_BASE_URL": ""})):
            patcher.start()
            self.addCleanup(patcher.stop)


class NothingLeaves(Case):
    def setUp(self) -> None:
        super().setUp()
        for target in ("urllib.request.urlopen", "urllib.request.build_opener"):
            p = mock.patch(target, boom)
            p.start()
            self.addCleanup(p.stop)

    def test_chat_to_a_far_ollama_is_refused(self) -> None:
        for addr in REMOTE:
            slot = ModelSlot(provider="ollama", model="m", base_url=addr)
            with self.assertRaises(ModelError, msg=addr):
                models.LocalBackend().chat(slot, [{"role": "user", "content": "my secret"}])

    def test_chat_to_a_far_openai_style_server_is_refused(self) -> None:
        for addr in REMOTE:
            slot = ModelSlot(provider="openai-compatible", model="m", base_url=addr)
            with self.assertRaises(ModelError, msg=addr):
                models.LocalBackend().chat(slot, [{"role": "user", "content": "my secret"}])

    def test_an_address_from_the_environment_is_refused_too(self) -> None:
        with mock.patch.dict("os.environ", {"OPENAI_BASE_URL": "https://api.example.com/v1"}):
            with self.assertRaises(ModelError):
                models.LocalBackend().chat(ModelSlot(provider="openai-compatible", model="m"), [{"role": "user", "content": "x"}])

    def test_meaning_search_numbers_are_refused_too(self) -> None:
        for kind in ("ollama", "openai-compatible"):
            with self.assertRaises(ModelError):
                models.LocalBackend().embed(ModelSlot(provider=kind, model="e", base_url="http://203.0.113.5:11434"), "hello")

    def test_looking_for_models_and_liveness_never_leave(self) -> None:
        self.assertEqual(models.server_models("http://203.0.113.5:11434"), ("", []))
        self.assertEqual(models.ollama_models("http://203.0.113.5:11434"), [])
        self.assertEqual(models.openai_models("http://203.0.113.5:8080"), [])
        self.assertFalse(models._server_up("http://203.0.113.5:11434", 1))                     # noqa: SLF001
        self.assertFalse(models.is_available(ModelSlot(provider="ollama", base_url="http://203.0.113.5:11434")))

    def test_a_far_model_is_not_a_ready_helper(self) -> None:
        cfg = ModelConfig(main=ModelSlot(provider="openai-compatible", model="m", base_url="https://api.example.com/v1"))
        self.assertEqual(models.helper_state(cfg)["ready"], "no")
        self.assertIsNone(models.helper(cfg))

    def test_hermes_is_not_used(self) -> None:
        with mock.patch.object(models.hermes, "available", lambda: True), \
                mock.patch.object(models.hermes, "proxy_available", lambda: True):
            self.assertEqual(models.resolve_backend(ModelConfig()).name, "local")


class OtherWaysToTurnItOn(unittest.TestCase):
    def test_the_environment_variable_and_the_saved_switch_both_count(self) -> None:
        with mock.patch.object(models, "_LOCAL_ONLY", False), mock.patch.object(models, "_VAULT", None):
            self.assertFalse(models.local_only_active())
            with mock.patch.dict("os.environ", {"MEMORY_OB_LOCAL_ONLY": "1"}):
                self.assertTrue(models.local_only_active())
            tmp = Path(tempfile.mkdtemp())
            from memory_ob import settings as settings_mod

            settings_mod.update(tmp, local_only=True)
            with mock.patch.object(models, "_VAULT", tmp):
                self.assertTrue(models.local_only_active())

    def test_with_it_off_a_far_server_is_still_allowed(self) -> None:
        with mock.patch.object(models, "_LOCAL_ONLY", False), mock.patch.object(models, "_VAULT", None):
            self.assertFalse(models.blocked_by_local_only("https://api.example.com/v1"))
            cfg = ModelConfig(main=ModelSlot(provider="openai-compatible", model="m", base_url="https://api.example.com/v1"))
            self.assertEqual(models.helper_state(cfg)["kind"], "online")


def make_server(redirect_to: str | None = None) -> tuple[HTTPServer, str]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # noqa: D401
            pass

        def do_GET(self):  # noqa: N802
            if self.path == "/redirect" and redirect_to:
                self.send_response(302)
                self.send_header("Location", redirect_to)
                self.end_headers()
                return
            raw = json.dumps({"models": [{"name": "llama3.2:latest"}], "ok": True}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

    srv = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


class ThisComputerStillWorks(Case):
    def test_a_model_on_this_computer_is_used_normally(self) -> None:
        srv, url = make_server()
        self.addCleanup(stop, srv)
        self.assertEqual(models.ollama_models(url), ["llama3.2:latest"])
        self.assertEqual(models.server_models(url)[0], "ollama")

    def test_a_local_server_cannot_pass_a_request_on_to_somewhere_else(self) -> None:
        srv, url = make_server(redirect_to="http://203.0.113.5/x")
        self.addCleanup(stop, srv)
        self.assertIsNone(models._get_json(url + "/redirect", 2))                                # noqa: SLF001

    def test_a_redirect_to_this_computer_is_fine(self) -> None:
        srv, url = make_server(redirect_to="/api/tags")
        self.addCleanup(stop, srv)
        self.assertTrue(models._get_json(url + "/redirect", 2)["ok"])                            # noqa: SLF001


class TheSettingsScreen(unittest.TestCase):
    def setUp(self) -> None:
        from memory_ob import api
        from tests.helpers import AuthedClient

        self.tmp = Path(tempfile.mkdtemp())
        api.settings = api.Settings.resolve(vault=self.tmp / "v", db=self.tmp / "m.db", models_path=self.tmp / "models.json")
        self.client = AuthedClient.create(api.create_app(), self.tmp / "v")
        for p in (mock.patch.object(models, "_LOCAL_ONLY", False), mock.patch.object(models, "_VAULT", None)):
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(models.configure_local_only, self.tmp / "v")

    def use(self, address: str) -> None:
        cfg = ModelConfig(main=ModelSlot(provider="ollama", model="m", base_url=address),
                          auxiliary={"embed": ModelSlot(provider="ollama", model="e", base_url=address)})
        cfg.save(self.tmp / "models.json")

    def test_the_switch_will_not_turn_on_while_the_ai_is_somewhere_else(self) -> None:
        self.use("http://203.0.113.5:11434")
        r = self.client.post("/api/settings", json={"local_only": True})
        self.assertEqual(r.status_code, 400)
        self.assertIn("not on this computer", r.json()["detail"] if "detail" in r.json() else r.text)
        self.assertFalse(self.client.get("/api/settings").json()["options"]["local_only"])

    def test_the_switch_turns_on_when_the_ai_is_here(self) -> None:
        self.use("http://127.0.0.1:11434")
        self.assertEqual(self.client.post("/api/settings", json={"local_only": True}).status_code, 200)
        self.assertTrue(self.client.get("/api/settings").json()["options"]["local_only"])

    def test_with_the_switch_on_a_far_address_is_refused_when_saved(self) -> None:
        self.assertEqual(self.client.post("/api/settings", json={"local_only": True}).status_code, 200)
        for address in ("http://203.0.113.5:11434", "https://api.example.com/v1", "http://192.168.1.20:11434"):
            r = self.client.post("/api/settings/ai", json={"mode": "custom", "reading_model": "m", "address": address})
            self.assertEqual(r.status_code, 400, address)
        r = self.client.post("/api/settings/ai", json={"mode": "custom", "reading_model": "m", "address": "http://127.0.0.1:11434"})
        self.assertEqual(r.status_code, 200, r.text)

    def test_with_the_switch_on_a_far_address_is_not_even_looked_at(self) -> None:
        self.client.post("/api/settings", json={"local_only": True})
        with mock.patch("urllib.request.urlopen", boom), mock.patch("urllib.request.build_opener", boom):
            r = self.client.get("/api/settings/ai/models", params={"address": "http://203.0.113.5:11434"}).json()
        self.assertFalse(r["reachable"])
        self.assertIn("not on this computer", r["message"])


if __name__ == "__main__":
    unittest.main()
