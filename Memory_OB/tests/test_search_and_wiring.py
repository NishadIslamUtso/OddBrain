"""Tests for the meaning leg (embeddings) and the newly wired commands.

Covers: embedding cache, the three-leg search, and the dream / chapter /
embed commands driven end to end through the real CLI and HTTP surface.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from memory_ob import embedder, models  # noqa: E402
from memory_ob.store import Store  # noqa: E402
from tests.test_laws import make_record  # noqa: E402


class FakeEmbedder:
    """A deterministic embedding backend for tests."""

    name = "fake"

    def __init__(self, mapping: dict[str, list[float]] | None = None) -> None:
        self.mapping = mapping or {}
        self.calls: list[str] = []

    def chat(self, slot, messages):  # pragma: no cover - not used here
        return ""

    def embed(self, slot, text):
        self.calls.append(text)
        low = (text or "").lower()
        for key, vec in self.mapping.items():
            if key in low:
                return list(vec)
        return [0.0, 0.0, 1.0]


class TestEmbeddingCache(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.tmp, "t.db"))

    def tearDown(self):
        self.store.close()

    def test_set_and_get(self):
        self.store.set_embedding("r1", [1.0, 2.0, 3.0], model="test")
        self.assertEqual(self.store.get_embedding("r1"), [1.0, 2.0, 3.0])

    def test_get_missing(self):
        self.assertIsNone(self.store.get_embedding("nope"))

    def test_missing_embeddings(self):
        a = make_record(title="a")
        b = make_record(title="b")
        self.store.add_record(a)
        self.store.add_record(b)
        self.store.set_embedding(a.id, [1.0, 0.0], model="test")
        self.assertEqual(self.store.missing_embeddings(), [b.id])

    def test_neversend_not_embedded(self):
        r = make_record(title="private", never_send=True)
        self.store.add_record(r)
        self.assertEqual(self.store.missing_embeddings(), [])

    def test_count_and_drop(self):
        r = make_record()
        self.store.add_record(r)
        self.store.set_embedding(r.id, [1.0], model="t")
        self.assertEqual(self.store.count_embeddings(), 1)
        self.store.drop_embeddings()
        self.assertEqual(self.store.count_embeddings(), 0)

    def test_ensure_embeddings(self):
        r = make_record(title="a cat", body="I have a cat")
        self.store.add_record(r)
        backend = FakeEmbedder({"cat": [1.0, 0.0, 0.0]})
        n = embedder.ensure_embeddings(self.store, backend=backend)
        self.assertEqual(n, 1)
        self.assertEqual(self.store.count_embeddings(), 1)

    def test_ensure_embeddings_stops_on_failure(self):
        r = make_record(title="a", body="b")
        self.store.add_record(r)

        class Boom:
            name = "boom"

            def chat(self, slot, messages):
                return ""

            def embed(self, slot, text):
                raise RuntimeError("no model")

        self.assertEqual(embedder.ensure_embeddings(self.store, backend=Boom()), 0)
        self.assertEqual(self.store.count_embeddings(), 0)

    def test_ensure_embeddings_is_idempotent(self):
        r = make_record(title="a", body="b")
        self.store.add_record(r)
        backend = FakeEmbedder()
        self.assertEqual(embedder.ensure_embeddings(self.store, backend=backend), 1)
        self.assertEqual(embedder.ensure_embeddings(self.store, backend=backend), 0)


class TestCombinedSearch(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.tmp, "t.db"))

    def tearDown(self):
        self.store.close()

    def test_words_leg(self):
        r = make_record(title="quarterly revenue report", body="revenue grew")
        self.store.add_record(r)
        hits = self.store.search_all("revenue")
        self.assertIn(r.id, [h.id for h in hits])

    def test_meaning_leg_finds_synonym(self):
        cat = make_record(title="my cat", body="I have a cat named Milo")
        car = make_record(title="my car", body="I drive a car to work")
        self.store.add_record(cat)
        self.store.add_record(car)
        backend = FakeEmbedder(
            {"cat": [1.0, 0.0, 0.0], "car": [0.0, 1.0, 0.0], "feline": [1.0, 0.0, 0.0]}
        )
        embedder.ensure_embeddings(self.store, backend=backend)
        hits = self.store.search_all("feline", backend=backend)
        ids = [h.id for h in hits]
        self.assertIn(cat.id, ids)
        self.assertNotIn(car.id, ids)

    def test_meaning_leg_needs_a_model(self):
        """With no embedding model the search must not claim to be semantic."""
        r = make_record(title="my cat", body="I have a cat")
        self.store.add_record(r)

        class Boom:
            name = "boom"

            def chat(self, slot, messages):
                return ""

            def embed(self, slot, text):
                raise RuntimeError("down")

        # "feline" is not in the text; without a model the record is not found.
        hits = self.store.search_all("feline", backend=Boom())
        self.assertNotIn(r.id, [h.id for h in hits])

    def test_entity_leg_matches_tags(self):
        r = make_record(title="something", body="unrelated words", tags=["darkmode"])
        self.store.add_record(r)
        hits = self.store.search_all("darkmode")
        self.assertIn(r.id, [h.id for h in hits])

    def test_private_and_trashed_never_surface(self):
        priv = make_record(title="revenue secret", body="revenue", never_send=True)
        trash = make_record(title="revenue old", body="revenue")
        self.store.add_record(priv)
        self.store.add_record(trash)
        self.store.trash(trash.id, reason="x")
        hits = self.store.search_all("revenue")
        ids = [h.id for h in hits]
        self.assertNotIn(priv.id, ids)
        self.assertNotIn(trash.id, ids)

    def test_semantic_available_flag(self):
        r = make_record(title="a", body="b")
        self.store.add_record(r)
        self.assertFalse(embedder.semantic_available(self.store, backend=FakeEmbedder()))
        embedder.ensure_embeddings(self.store, backend=FakeEmbedder())
        self.assertTrue(embedder.semantic_available(self.store, backend=FakeEmbedder()))


class CliCase(unittest.TestCase):
    """The newly wired commands, driven as real subprocesses."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.vault = os.path.join(self.tmp, "vault")
        self.db = os.path.join(self.tmp, "mob.db")
        self.env = {"MEMORY_OB_VAULT": self.vault, "MEMORY_OB_DB": self.db}

    def run_cli(self, args):
        return subprocess.run(
            [sys.executable, "-m", "memory_ob.cli", *args],
            capture_output=True,
            text=True,
            cwd=str(ROOT),
            env={**os.environ, **self.env},
        )

    def test_dream_command(self):
        self.run_cli(["init"])
        st = Store(self.db)
        st.add_fact("I prefer dark mode on every machine", trust=0.4)
        st.add_fact("I prefer dark mode on all machines", trust=0.4)
        st.close()

        r = self.run_cli(["dream"])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("merges", r.stdout)

    def test_chapter_command_creates_a_proposal_card(self):
        self.run_cli(["init"])
        st = Store(self.db)
        r = make_record(
            kind="journal", speaker="user", trust=0.9,
            title="First day", body="I started the job.", event_time="2026-01-01",
        )
        st.add_record(r)
        st.close()

        out = self.run_cli(["chapter", "--no-model"])
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn("Drafted chapter", out.stdout)

        review = self.run_cli(["review"])
        self.assertIn("proposal", review.stdout)

    def test_chapter_without_confirmed_records(self):
        self.run_cli(["init"])
        r = self.run_cli(["chapter", "--no-model"])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("nothing to draft", r.stdout.lower())

    def test_embed_command(self):
        self.run_cli(["init"])
        st = Store(self.db)
        st.add_record(make_record(title="a", body="b"))
        st.close()

        # No embedding model in the test environment: it must degrade cleanly.
        r = self.run_cli(["embed"])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("cached", r.stdout)


class ApiCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.vault = os.path.join(self.tmp, "vault")
        self.db = os.path.join(self.tmp, "mob.db")
        os.environ["MEMORY_OB_VAULT"] = self.vault
        os.environ["MEMORY_OB_DB"] = self.db

        from memory_ob import api
        from fastapi.testclient import TestClient

        api.settings = api.Settings.resolve(vault=self.vault, db=self.db)
        self.client = TestClient(api.create_app())

    def test_dream_endpoint(self):
        r = self.client.post("/api/dream")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("candidates", r.json())

    def test_chapter_endpoint(self):
        st = Store(self.db)
        st.add_record(
            make_record(
                kind="journal", speaker="user", trust=0.9,
                title="First day", body="I started.", event_time="2026-01-01",
            )
        )
        st.close()

        r = self.client.post("/api/chapter", json={"no_model": True})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["drafted"])

    def test_chapter_endpoint_empty(self):
        r = self.client.post("/api/chapter", json={"no_model": True})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse(r.json()["drafted"])

    def test_embed_endpoint(self):
        st = Store(self.db)
        st.add_record(make_record(title="a", body="b"))
        st.close()

        r = self.client.post("/api/embed", json={"limit": 10})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("cached", r.json())


if __name__ == "__main__":
    unittest.main(verbosity=2)
