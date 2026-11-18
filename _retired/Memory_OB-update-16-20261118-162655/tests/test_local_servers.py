"""The reading AI can be Ollama, llama.cpp's llama-server, LM Studio or vLLM, not only Ollama."""

from __future__ import annotations

import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob import models  # noqa: E402

SEEN: list[tuple[str, str]] = []


def make_server(kind: str) -> tuple[HTTPServer, str]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # noqa: D401
            pass

        def _send(self, code: int, body: dict) -> None:
            raw = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):  # noqa: N802
            SEEN.append(("GET", self.path))
            if kind == "ollama" and self.path == "/api/tags":
                return self._send(200, {"models": [{"name": "llama3.2:latest"}]})
            if kind == "openai" and self.path == "/v1/models":
                return self._send(200, {"object": "list", "data": [{"id": "qwen2.5-7b"}]})
            self._send(404, {"error": "no"})

        def do_POST(self):  # noqa: N802
            n = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(n) or b"{}")
            SEEN.append(("POST", self.path))
            if kind == "ollama" and self.path == "/api/chat":
                return self._send(200, {"message": {"content": "from ollama " + body["model"]}})
            if kind == "openai" and self.path == "/v1/chat/completions":
                return self._send(200, {"choices": [{"message": {"content": "from openai-style " + body["model"]}}]})
            if kind == "openai" and self.path == "/v1/embeddings":
                return self._send(200, {"data": [{"embedding": [0.5, 0.25]}]})
            self._send(404, {"error": "no"})

    srv = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


class WhichLanguage(unittest.TestCase):
    def test_ollama_by_name_by_port_and_by_default(self) -> None:
        self.assertEqual(models.ModelSlot(provider="ollama", base_url="http://127.0.0.1:8080").api_kind, "ollama")
        self.assertEqual(models.ModelSlot(provider="auto").api_kind, "ollama")
        self.assertEqual(models.ModelSlot(provider="custom", base_url="http://localhost:11434").api_kind, "ollama")

    def test_the_other_servers_speak_the_openai_way(self) -> None:
        for provider in ("lmstudio", "vllm", "llamacpp", "openai-compatible"):
            self.assertEqual(models.ModelSlot(provider=provider, base_url="http://localhost:1234").api_kind, "openai")
        self.assertEqual(models.ModelSlot(provider="custom", base_url="http://127.0.0.1:8080").api_kind, "openai")

    def test_v1_is_added_once(self) -> None:
        self.assertEqual(models._v1("http://h:8080"), "http://h:8080/v1")          # noqa: SLF001
        self.assertEqual(models._v1("http://h:8080/v1/"), "http://h:8080/v1")      # noqa: SLF001


class TalkingToThem(unittest.TestCase):
    def setUp(self) -> None:
        SEEN.clear()
        self.servers: list[HTTPServer] = []

    def tearDown(self) -> None:
        for s in self.servers:
            s.shutdown()

    def serve(self, kind: str) -> str:
        srv, url = make_server(kind)
        self.servers.append(srv)
        return url

    def test_it_finds_out_which_server_it_is_and_lists_models(self) -> None:
        self.assertEqual(models.server_models(self.serve("ollama")), ("ollama", ["llama3.2:latest"]))
        self.assertEqual(models.server_models(self.serve("openai")), ("openai", ["qwen2.5-7b"]))
        self.assertEqual(models.server_models("http://127.0.0.1:9", timeout=0.5), ("", []))

    def test_chat_goes_the_right_way_for_each(self) -> None:
        backend = models.LocalBackend()
        msg = [{"role": "user", "content": "hi"}]
        url = self.serve("ollama")
        self.assertEqual(backend.chat(models.ModelSlot(provider="ollama", model="m", base_url=url), msg), "from ollama m")
        url = self.serve("openai")
        slot = models.ModelSlot(provider="openai-compatible", model="m", base_url=url)
        self.assertEqual(backend.chat(slot, msg), "from openai-style m")
        # also when the address was typed without /v1 and the kind was only guessed from the port
        self.assertEqual(backend.chat(models.ModelSlot(provider="custom", model="m", base_url=url), msg),
                         "from openai-style m")

    def test_meaning_search_numbers_work_for_an_openai_style_server(self) -> None:
        url = self.serve("openai")
        slot = models.ModelSlot(provider="openai-compatible", model="e", base_url=url)
        self.assertEqual(models.LocalBackend().embed(slot, "x"), [0.5, 0.25])

    def test_the_real_ollama_check_still_exists_and_works(self) -> None:
        # tests/__init__ replaces models._server_up with a stand-in; the real one must still be there.
        import importlib

        real = importlib.reload(models)._server_up          # noqa: SLF001
        url = self.serve("ollama")
        self.assertTrue(real(url, 1.0))
        self.assertFalse(real("http://127.0.0.1:9", 0.5))
        from tests import _no_ai_on_this_machine
        _no_ai_on_this_machine()

    def test_is_available_checks_the_right_door(self) -> None:
        url = self.serve("openai")
        with mock.patch.dict("os.environ", {"MEMORY_OB_NO_PROBE_CACHE": "1"}):
            self.assertTrue(models.is_available(models.ModelSlot(provider="openai-compatible", base_url=url)))
            self.assertFalse(models.is_available(models.ModelSlot(provider="openai-compatible", base_url="http://127.0.0.1:9")))
            self.assertTrue(("GET", "/v1/models") in SEEN)


class SavingTheChoice(unittest.TestCase):
    def test_the_settings_screen_saves_the_kind_it_found(self) -> None:
        import tempfile

        from memory_ob import api
        from tests.helpers import AuthedClient

        srv, url = make_server("openai")
        self.addCleanup(srv.shutdown)
        tmp = Path(tempfile.mkdtemp())
        api.settings = api.Settings.resolve(vault=tmp / "v", db=tmp / "m.db", models_path=tmp / "models.json")
        client = AuthedClient.create(api.create_app(), tmp / "v")
        listed = client.get("/api/settings/ai/models", params={"address": url}).json()
        self.assertEqual((listed["reachable"], listed["kind"], listed["models"]), (True, "openai", ["qwen2.5-7b"]))
        r = client.post("/api/settings/ai", json={"mode": "custom", "reading_model": "qwen2.5-7b",
                                                  "address": url, "meaning_model": ""})
        self.assertEqual(r.status_code, 200, r.text)
        cfg = models.ModelConfig.load(tmp / "models.json")
        self.assertEqual(cfg.main.provider, "openai-compatible")
        self.assertTrue(cfg.main.base_url.endswith("/v1"))
        self.assertEqual(models.LocalBackend(cfg).chat(cfg.main, [{"role": "user", "content": "hi"}]),
                         "from openai-style qwen2.5-7b")


if __name__ == "__main__":
    unittest.main()
