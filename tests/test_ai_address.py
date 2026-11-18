"""Settings shows the addresses actually in use, and saving never breaks them."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class TestAiAddress(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = os.path.join(self.tmp.name, "vault")
        self.db = os.path.join(self.tmp.name, "state.db")
        os.environ["MEMORY_OB_VAULT"] = self.vault
        os.environ["MEMORY_OB_DB"] = self.db
        from memory_ob import api
        api.settings = api.Settings.resolve(vault=self.vault, db=self.db)
        from fastapi.testclient import TestClient
        self.api = api
        self.client = TestClient(api.create_app())
        from memory_ob.auth import load_or_create
        self.token = load_or_create(api.settings.token_path)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _save(self, payload: dict) -> dict:
        r = self.client.post("/api/settings/ai", json=payload,
                             headers={"x-memory-ob-token": self.token})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def test_auto_save_keeps_the_meaning_models_server(self) -> None:
        from memory_ob.models import ModelConfig, ModelSlot
        cfg = ModelConfig.load(self.api.settings.models_path)
        cfg.auxiliary["embed"] = ModelSlot(provider="openai-compatible",
                                           model="nomic-embed-text-v2-moe.f16",
                                           base_url="http://127.0.0.1:18435/v1")
        cfg.save(self.api.settings.models_path)
        self._save({"mode": "auto", "meaning_model": "nomic-embed-text-v2-moe.f16"})
        cfg = ModelConfig.load(self.api.settings.models_path)
        slot = cfg.auxiliary.get("embed", ModelSlot())
        self.assertEqual(slot.base_url, "http://127.0.0.1:18435/v1",
                         "saving Settings must not erase where the meaning model runs")

    def test_auto_mode_shows_no_fake_address(self) -> None:
        self._save({"mode": "auto", "meaning_model": ""})
        r = self.client.get("/api/settings")
        data = r.json()["ai"]
        self.assertIn("address", data)
        self.assertEqual(data["address"], "",
                         "auto mode must not claim a server address it does not use")
        self.assertIn("meaning_address", data)


if __name__ == "__main__":
    unittest.main()
