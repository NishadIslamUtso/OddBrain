"""Write-route authentication (§10, §15 rule 5).

No default token ships anywhere. The token is generated on first use, stored
outside git, and the pages echo it back on every write.
"""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from memory_ob import api
from memory_ob.auth import TOKEN_HEADER, generate_token, load_or_create, verify


class TokenGateCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = os.path.join(self.tmp, "vault")
        self.db = os.path.join(self.tmp, "mob.db")
        os.environ["MEMORY_OB_VAULT"] = self.vault
        os.environ["MEMORY_OB_DB"] = self.db

        api.settings = api.Settings.resolve(vault=self.vault, db=self.db)
        from fastapi.testclient import TestClient

        self.raw = TestClient(api.create_app())          # no token, like a stranger
        self.token = load_or_create(api.settings.token_path)

    def _post(self, client, path, **kw):
        return client.post(path, **kw)


class TestTokenLifecycle(TokenGateCase):
    def test_token_is_random_each_time(self) -> None:
        self.assertNotEqual(generate_token(), generate_token())

    def test_token_file_is_created_outside_git(self) -> None:
        path = Path(self.vault) / ".brain" / "token"
        self.assertTrue(path.is_file())
        self.assertTrue(verify(path, self.token))

    def test_wrong_token_is_rejected(self) -> None:
        path = Path(self.vault) / ".brain" / "token"
        self.assertFalse(verify(path, "brain-local-token"))
        self.assertFalse(verify(path, ""))

    def test_no_default_token_is_committed(self) -> None:
        """§15 rule 5 — a published default is not auth."""
        from memory_ob import auth

        source = Path(auth.__file__).read_text(encoding="utf-8")
        self.assertNotIn("brain-local-token", source)


class TestGate(TokenGateCase):
    def test_read_routes_stay_open(self) -> None:
        r = self.raw.get("/api/health")
        self.assertEqual(r.status_code, 200, r.text)

    def test_write_without_token_is_401(self) -> None:
        r = self._post(self.raw, "/api/capture", json={"text": "I have used git for version control since 2019."})
        self.assertEqual(r.status_code, 401, r.text)

    def test_write_with_wrong_token_is_401(self) -> None:
        r = self._post(
            self.raw,
            "/api/capture",
            json={"text": "I have used git for version control since 2019."},
            headers={TOKEN_HEADER: "wrong"},
        )
        self.assertEqual(r.status_code, 401, r.text)

    def test_write_with_token_succeeds(self) -> None:
        r = self._post(
            self.raw,
            "/api/capture",
            json={"text": "I have used git for version control since 2019."},
            headers={TOKEN_HEADER: self.token},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertGreaterEqual(r.json()["candidates"], 1)

    def test_token_also_accepted_as_query_param(self) -> None:
        r = self.raw.post(f"/api/capture?token={self.token}", json={"text": "I have used git for version control since 2019."})
        self.assertEqual(r.status_code, 200, r.text)

    def test_delete_is_gated(self) -> None:
        r = self.raw.delete("/api/records/nope")
        self.assertEqual(r.status_code, 401, r.text)


class TestPageInjection(TokenGateCase):
    def test_ui_markup_carries_the_token(self) -> None:
        """The pages authenticate by shape — the backend injects it."""
        r = self.raw.get("/ui")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn(f'window.__MEMORY_OB_TOKEN__ = "{self.token}";', r.text)

    def test_ui_without_token_marker_is_untouched(self) -> None:
        r = self.raw.get("/ui")
        self.assertNotIn('window.__MEMORY_OB_TOKEN__ = "";', r.text)


if __name__ == "__main__":
    unittest.main()
