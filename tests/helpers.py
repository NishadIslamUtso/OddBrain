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
