"""§15 rule 3: a selector no code consumes is banned.

Every model slot must be reachable from real code. These tests prove the
extract and embed paths consume their slot, and that the slots that used to
exist for removed features are really gone.
"""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest
import warnings
from pathlib import Path

from memory_ob import api, models
from memory_ob.records import Record
from memory_ob.store import Store


class ModelWiringCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.vault = self.tmp / "vault"
        self.db = self.tmp / "mob.db"
        os.environ["MEMORY_OB_VAULT"] = str(self.vault)
        os.environ["MEMORY_OB_DB"] = str(self.db)
        api.settings = api.Settings.resolve(vault=self.vault, db=self.db)
        self.store = Store(self.db)

    def tearDown(self) -> None:
        self.store.close()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ResourceWarning)
            shutil.rmtree(self.tmp, ignore_errors=True)

    def _add(self, rid: str, title: str, body: str, tags=None) -> None:
        self.store.add_record(
            Record(
                id=rid,
                kind="profile",
                subject="self",
                speaker="user",
                trust=0.9,
                title=title,
                body=body,
                tags=tags or [],
                status="active",
            )
        )


class TestExtractSlot(ModelWiringCase):
    def test_capture_asks_the_helper_when_there_is_one(self) -> None:
        from memory_ob import manager

        seen: list[str] = []

        def fake(prompt: str) -> str:
            seen.append(prompt)
            return '{"claims": []}'

        manager.capture(self.store, text="I have used git since 2019.", model_call=fake, vault=self.vault)
        self.assertTrue(seen, "the reading model was never asked")

    def test_a_helper_that_fails_does_not_lose_what_was_said(self) -> None:
        from memory_ob import manager

        def broken(prompt: str) -> str:
            raise RuntimeError("model unreachable")

        out = manager.capture(self.store, text="I have used git since 2019.", model_call=broken, vault=self.vault)
        # kept, and either filed by the simple rules or kept to be read later
        self.assertEqual(out.saved + out.waiting, 1)
        self.assertEqual(len(self.store.list_conversations(limit=10)), 1)


class TestEmbedSlot(ModelWiringCase):
    def test_search_reads_the_embed_slot(self) -> None:
        cfg = models.ModelConfig.load(api.settings.models_path)
        self.assertIn("embed", models.SLOTS)
        self.assertEqual(cfg.slot("embed").provider, "auto")

    def test_search_without_an_embedding_model_still_works(self) -> None:
        self._add("a", "tea", "I drink tea every morning")
        cfg = models.ModelConfig.load(api.settings.models_path)
        hits = self.store.search_all("tea", backend=models.resolve_backend(cfg), slot=cfg.slot("embed"))
        self.assertEqual([h.id for h in hits], ["a"])


class TestOtherSlots(ModelWiringCase):
    def test_only_real_slots_exist(self) -> None:
        # dream, chapter and rerank belonged to features that are gone
        self.assertEqual(set(models.SLOTS), {"extract", "embed"})

    def test_an_old_settings_file_with_removed_slots_still_loads(self) -> None:
        path = self.tmp / "old-models.json"
        path.write_text(
            '{"main": {"provider": "auto"}, "auxiliary": {"dream": {"provider": "ollama", "model": "x"},'
            ' "embed": {"provider": "ollama", "model": "nomic-embed-text"}}}', encoding="utf-8")
        cfg = models.ModelConfig.load(path)
        self.assertEqual(cfg.slot("embed").model, "nomic-embed-text")
        self.assertNotIn("dream", cfg.auxiliary)

    def test_capture_uses_the_extract_slot(self) -> None:
        from tests.helpers import AuthedClient

        client = AuthedClient.create(api.create_app(), self.vault)
        r = client.post("/api/capture", json={"text": "I have used git for version control since 2019."})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertGreaterEqual(r.json()["candidates"], 1)


if __name__ == "__main__":
    unittest.main()
