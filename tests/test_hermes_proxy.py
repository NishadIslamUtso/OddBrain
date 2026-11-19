"""When Hermes's local proxy says "404", Memory_OB finds out why and tries what the server actually has.

On a real machine "Test the AI helper" said only "HTTP Error 404: Not Found", and every message stayed
waiting for ever. The proxy (``hermes proxy``) forwards only /v1/chat/completions, /v1/models and a
few more, and knows its own model names; Memory_OB was sending Hermes's *main* model's name.

* The proxy is recognised by /v1/models (a documented address), not /health.
* "No such model" (400/404/422) is retried once with a model the server lists, and that name is remembered.
* The server's own words come back in the error, and the Test button turns them into plain advice.
* When the proxy fails, Hermes's main endpoint is tried before giving up.
"""

from __future__ import annotations

import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob import api, hermes, models  # noqa: E402
from memory_ob.models import HermesBackend, ModelConfig, ModelError, ModelSlot  # noqa: E402


class FakeProxy:
    """A tiny stand-in for ``hermes proxy``: knows some model names, 404s the rest."""

    def __init__(self, known=("Hermes-4-70B", "text-embed-1"), models_status=200, chat_status=None, health_only=False):
        self.known, self.models_status, self.chat_status, self.health_only = list(known), models_status, chat_status, health_only
        self.asked: list[str] = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):  # noqa: D401 - silence
                pass

            def _send(self, code, payload):
                raw = json.dumps(payload).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def do_GET(self):
                if self.path == "/health":
                    return self._send(200, {"ok": True})
                if self.path == "/v1/models" and not outer.health_only:
                    if outer.models_status != 200:
                        return self._send(outer.models_status, {"error": {"message": "nope"}})
                    return self._send(200, {"data": [{"id": m} for m in outer.known]})
                self._send(404, {"error": {"message": f"path {self.path} is not forwarded"}})

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                outer.asked.append(body.get("model", ""))
                if outer.chat_status:
                    return self._send(outer.chat_status, {"error": {"message": "refused"}})
                if body.get("model") not in outer.known:
                    return self._send(404, {"error": {"message": f"model '{body.get('model')}' not found"}})
                self._send(200, {"choices": [{"message": {"content": "OK"}}]})

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    @property
    def base(self) -> str:
        return f"http://127.0.0.1:{self.port}/v1"

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


class Case(unittest.TestCase):
    def setUp(self) -> None:
        hermes.remember_model("")
        self.addCleanup(hermes.remember_model, "")
        self.servers: list[FakeProxy] = []

    def tearDown(self) -> None:
        for s in self.servers:
            s.close()

    def proxy(self, **kw) -> FakeProxy:
        s = FakeProxy(**kw)
        self.servers.append(s)
        return s

    def use(self, s: FakeProxy, main_model: str = "anthropic/claude-sonnet-4.6", main_base: str = ""):
        stack = [
            mock.patch.object(hermes, "PROXY_BASE", s.base),
            mock.patch.object(hermes, "proxy_available", return_value=True),
            mock.patch.object(hermes, "main_slot", return_value={"provider": "auto", "model": main_model, "base_url": main_base}),
        ]
        for m in stack:
            m.start()
            self.addCleanup(m.stop)

    def chat(self) -> str:
        return HermesBackend(ModelConfig()).chat(ModelSlot(), [{"role": "user", "content": "hi"}])


class RecognisingTheProxy(Case):
    def test_it_lists_the_models_it_has(self) -> None:
        s = self.proxy()
        with mock.patch.object(hermes, "PROXY_BASE", s.base):
            self.assertEqual(hermes.proxy_models(), ["Hermes-4-70B", "text-embed-1"])

    def test_something_that_only_answers_health_is_not_the_proxy(self) -> None:
        s = self.proxy(health_only=True)
        with mock.patch.object(hermes, "PROXY_BASE", s.base):
            self.assertIsNone(hermes.proxy_models())

    def test_nothing_listening_is_none(self) -> None:
        with mock.patch.object(hermes, "PROXY_BASE", "http://127.0.0.1:9/v1"):
            self.assertIsNone(hermes.proxy_models(timeout=1))

    def test_an_embedding_model_is_never_picked_for_chat(self) -> None:
        s = self.proxy(known=("text-embed-1", "Hermes-4-70B"))
        with mock.patch.object(hermes, "PROXY_BASE", s.base):
            self.assertEqual(hermes.pick_proxy_model(), "Hermes-4-70B")
            self.assertEqual(hermes.pick_proxy_model(avoid="Hermes-4-70B"), "")


class WhenTheModelNameIsUnknown(Case):
    def test_it_retries_with_a_model_the_server_lists_and_answers(self) -> None:
        s = self.proxy()
        self.use(s)
        self.assertEqual(self.chat(), "OK")
        self.assertEqual(s.asked, ["anthropic/claude-sonnet-4.6", "Hermes-4-70B"])

    def test_the_working_name_is_remembered_so_it_is_not_guessed_again(self) -> None:
        s = self.proxy()
        self.use(s)
        self.chat()
        s.asked.clear()
        self.assertEqual(self.chat(), "OK")
        self.assertEqual(s.asked, ["Hermes-4-70B"], "one request, straight to the model that works")

    def test_an_owner_chosen_model_is_still_tried_first(self) -> None:
        s = self.proxy()
        self.use(s)
        got = HermesBackend(ModelConfig()).chat(ModelSlot(model="Hermes-4-70B"), [{"role": "user", "content": "hi"}])
        self.assertEqual((got, s.asked), ("OK", ["Hermes-4-70B"]))

    def test_a_refused_sign_in_is_not_retried_with_other_names(self) -> None:
        s = self.proxy(chat_status=401)
        self.use(s)
        with self.assertRaises(ModelError) as ctx:
            self.chat()
        self.assertEqual((ctx.exception.status, len(s.asked)), (401, 1))

    def test_when_no_listed_model_works_the_servers_words_come_back(self) -> None:
        s = self.proxy(known=())
        self.use(s)
        with self.assertRaises(ModelError) as ctx:
            self.chat()
        self.assertEqual(ctx.exception.status, 404)
        self.assertIn("not found", str(ctx.exception))
        self.assertIn("HTTP 404", str(ctx.exception))


class FallingBackToTheMainEndpoint(Case):
    def test_a_failing_proxy_is_not_the_end(self) -> None:
        proxy = self.proxy(known=())                         # the proxy knows nothing
        main = self.proxy(known=("anthropic/claude-sonnet-4.6",))
        self.use(proxy, main_base=main.base)
        self.assertEqual(self.chat(), "OK")
        self.assertEqual(main.asked, ["anthropic/claude-sonnet-4.6"])

    def test_with_no_proxy_and_no_main_endpoint_it_says_how_to_start_one(self) -> None:
        with mock.patch.object(hermes, "proxy_available", return_value=False), \
                mock.patch.object(hermes, "main_slot", return_value={"provider": "auto", "model": "", "base_url": ""}):
            with self.assertRaises(ModelError) as ctx:
                self.chat()
        self.assertIn("hermes proxy start", str(ctx.exception))


class TheTestButtonExplains(unittest.TestCase):
    def setUp(self) -> None:
        import tempfile
        from tests.helpers import AuthedClient

        self.tmp = Path(tempfile.mkdtemp())
        vault, db = self.tmp / "vault", self.tmp / "m.db"
        api.settings = api.Settings.resolve(vault=vault, db=db, models_path=self.tmp / "models.json")
        api.settings.ensure_dirs()
        self.client = AuthedClient.create(api.create_app(), vault)

    def fails_with(self, status, text="x") -> dict:
        err = ModelError(f"model call failed: http://127.0.0.1:8645/v1/chat/completions: HTTP {status} {text}")
        err.status = status

        def boom(prompt: str) -> str:
            raise err

        original = api._helper
        api._helper = lambda *a, **k: boom
        self.addCleanup(setattr, api, "_helper", original)
        return self.client.post("/api/settings/ai/test").json()

    def test_a_404_says_what_it_usually_means_and_what_to_do(self) -> None:
        got = self.fails_with(404, "Not Found: model 'x' not found")
        self.assertEqual((got["ok"], got["status"]), (False, 404))
        self.assertIn("model 'x' not found", got["detail"], "the server's own words are shown")
        self.assertIn("no such model", got["hint"])
        self.assertIn("hermes proxy status", got["hint"])

    def test_a_sign_in_problem_names_the_command(self) -> None:
        self.assertIn("hermes portal", self.fails_with(401)["hint"])

    def test_too_many_requests_is_a_free_allowance_hint(self) -> None:
        self.assertIn("free allowance", self.fails_with(429)["hint"])

    def test_a_server_error_is_not_blamed_on_the_owner(self) -> None:
        self.assertIn("own side", self.fails_with(502)["hint"])


if __name__ == "__main__":
    unittest.main()
