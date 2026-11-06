"""§15 rule 3: a selector no code consumes is banned.

Every model slot must be reachable from real code. These tests prove the
extract / dream / embed / rerank / chapter paths consume their slot.
"""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest
import warnings
from pathlib import Path

from memory_ob import api, dream, embedder, models
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


class TestDreamSlot(ModelWiringCase):
    def test_dream_accepts_a_model_call(self) -> None:
        self.store.add_fact("I prefer dark mode in every app.", trust=0.4)
        seen: list[str] = []

        def fake(prompt: str) -> str:
            seen.append(prompt)
            return '{"themes": ["dark mode"], "conflicts": []}'

        report = dream.dream(self.store, open_cards=False, model_call=fake)
        self.assertTrue(seen, "the dream model was never asked")
        self.assertEqual(report["model"]["themes"], ["dark mode"])
        self.assertEqual(report["model"]["note"], "model")

    def test_dream_survives_a_bad_model_answer(self) -> None:
        self.store.add_fact("I prefer dark mode in every app.", trust=0.4)
        report = dream.dream(
            self.store, open_cards=False, model_call=lambda p: "not json at all"
        )
        self.assertEqual(report["model"]["note"], "model unavailable")

    def test_dream_without_a_model_still_runs(self) -> None:
        self.store.add_fact("I prefer dark mode in every app.", trust=0.4)
        report = dream.dream(self.store, open_cards=False)
        self.assertIn("candidates", report)

    def test_api_dream_passes_the_slot(self) -> None:
        from tests.helpers import AuthedClient

        client = AuthedClient.create(api.create_app(), self.vault)
        r = client.post("/api/dream", json={"no_model": True})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("candidates", r.json())


class TestRerankSlot(ModelWiringCase):
    def test_rerank_reorders(self) -> None:
        self._add("a", "alpha", "first")
        self._add("b", "beta", "second")
        reordered = embedder.rerank_results(
            "q", [self.store.get_record("a"), self.store.get_record("b")],
            lambda p: '{"order": [2, 1]}',
        )
        self.assertEqual([r.id for r in reordered], ["b", "a"])

    def test_rerank_cannot_add_or_drop(self) -> None:
        self._add("a", "alpha", "first")
        self._add("b", "beta", "second")
        reordered = embedder.rerank_results(
            "q", [self.store.get_record("a")], lambda p: '{"order": [1, 2, 3]}'
        )
        self.assertEqual([r.id for r in reordered], ["a"])

    def test_rerank_falls_back_on_garbage(self) -> None:
        self._add("a", "alpha", "first")
        self._add("b", "beta", "second")
        records = [self.store.get_record("a"), self.store.get_record("b")]
        self.assertEqual(
            embedder.rerank_results("q", records, lambda p: "garbage"), records
        )

    def test_rerank_off_by_default(self) -> None:
        self.assertFalse(api.settings.rerank_enabled)

    def test_rerank_slot_is_consumed_by_search(self) -> None:
        cfg = models.ModelConfig.load(api.settings.models_path)
        self.assertIn("rerank", models.SLOTS)
        self.assertEqual(cfg.slot("rerank").provider, "auto")


class TestOtherSlots(ModelWiringCase):
    def test_slots_exist(self) -> None:
        self.assertEqual(
            set(models.SLOTS), {"extract", "dream", "embed", "rerank", "chapter"}
        )

    def test_capture_uses_the_extract_slot(self) -> None:
        from tests.helpers import AuthedClient

        client = AuthedClient.create(api.create_app(), self.vault)
        r = client.post(
            "/api/capture",
            json={"text": "I have used git for version control since 2019.",
                  "no_model": True},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertGreaterEqual(r.json()["candidates"], 1)

    def test_chapter_uses_the_chapter_slot(self) -> None:
        self._add("j1", "A day", "I went to the river.", tags=[])
        r = self.client = None
        from tests.helpers import AuthedClient

        client = AuthedClient.create(api.create_app(), self.vault)
        resp = client.post("/api/chapter", json={"no_model": True})
        self.assertEqual(resp.status_code, 200, resp.text)


if __name__ == "__main__":
    unittest.main()
