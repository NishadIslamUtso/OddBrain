"""Shared test helpers."""

from __future__ import annotations

from pathlib import Path

from memory_ob.auth import TOKEN_HEADER, load_or_create


def token_for(vault: str | Path) -> str:
    """The write token for a test vault, created on demand like install does."""
    return load_or_create(Path(vault) / ".brain" / "token")


CARD = "card-test"


def sign(store, rec, card_id: str = CARD):
    """Persist a record the way the Review panel would — signed truth.

    Only ``Store.sign_record`` may create truth, so a test that needs a
    confirmed record goes through here rather than ``add_record``.
    """
    return store.sign_record(rec, card_id=card_id)


class AuthedClient:
    """A TestClient that echoes the write token on writes, exactly as the
    pages do (§15 rule 5). Reads stay open.

    Usage::

        client = AuthedClient.create(api.create_app(), vault)
        client.post("/api/records", json={...})   # token added automatically
    """

    def __init__(self, client, token: str) -> None:
        self._client = client
        self._token = token

    @classmethod
    def create(cls, app, vault: str | Path):
        from fastapi.testclient import TestClient

        return cls(TestClient(app), token_for(vault))

    def _headers(self, kwargs: dict) -> dict:
        headers = dict(kwargs.get("headers") or {})
        headers.setdefault(TOKEN_HEADER, self._token)
        kwargs["headers"] = headers
        return kwargs

    def get(self, url, **kwargs):
        return self._client.get(url, **kwargs)

    def post(self, url, **kwargs):
        return self._client.post(url, **self._headers(kwargs))

    def put(self, url, **kwargs):
        return self._client.put(url, **self._headers(kwargs))

    def patch(self, url, **kwargs):
        return self._client.patch(url, **self._headers(kwargs))

    def delete(self, url, **kwargs):
        return self._client.delete(url, **self._headers(kwargs))


def reading(_prompt_only: str = ""):
    """A stand-in AI helper for tests (owner decision D1: without a helper
    that read the text, a capture is kept aside whole, never rule-filed).

    It reads the text out of the real librarian prompt and answers in the
    shape the app asked for, using the built-in splitter. So tests run the
    REAL model path (validation, filing marks) while staying deterministic,
    and their behaviour expectations keep their meaning.
    """
    import json as _json

    from memory_ob import extract

    def call(prompt: str) -> str:
        body = prompt.rsplit("Text:\n", 1)[-1] if "Text:\n" in prompt \
            else prompt.rsplit("Conversation:\n", 1)[-1]
        lines = [ln[5:].strip() for ln in body.splitlines() if ln.startswith("user:")]
        text = "\n".join(lines) if lines else body
        claims = extract.split_claims(text)
        return _json.dumps([{"text": c} for c in claims]) if claims else "none"

    return call


def api_uses_reading_helper(api_module):
    """Point the API at the stand-in helper.

    Owner decision D1: with no helper that read the text, a capture is kept
    aside whole. Tests that exercise filing (not helper absence) therefore
    supply one. Returns the patch object; ``addCleanup(p.stop)`` in a setUp.
    """
    from unittest import mock

    p = mock.patch.object(api_module, "_helper", lambda: reading())
    p.start()
    return p


class FakeModelServer:
    """A tiny local model server over real HTTP (works for CLI subprocesses
    too). It answers probes and model calls with the stand-in reading.
    """

    def __init__(self) -> None:
        import json as _json
        import threading
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):  # noqa: D401
                pass

            def _send(self, payload: dict) -> None:
                raw = _json.dumps(payload).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def do_GET(self):  # noqa: N802
                self._send({"models": [{"name": "fake"}], "data": [{"id": "fake"}], "ok": True})

            def do_POST(self):  # noqa: N802
                length = int(self.headers.get("Content-Length") or 0)
                body = _json.loads(self.rfile.read(length) or b"{}")
                messages = body.get("messages") or []
                prompt = body.get("prompt") or (
                    messages[-1].get("content", "") if messages else "")
                answer = outer.answer(str(prompt))
                self._send({
                    "choices": [{"message": {"role": "assistant", "content": answer}}],
                    "message": {"role": "assistant", "content": answer},
                    "response": answer, "done": True,
                })

        self._srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._thread = threading.Thread(target=self._srv.serve_forever, daemon=True)
        self._thread.start()

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self._srv.server_address[1]}/v1"

    def answer(self, prompt: str) -> str:
        return reading()(prompt)

    def close(self) -> None:
        self._srv.shutdown()
        self._srv.server_close()
