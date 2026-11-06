"""Whole-car acceptance tests.

These drive the real surfaces end to end — the CLI and the HTTP API — the
way the screens do. Helper-only unit tests do not count as acceptance; these
do.

Run from the project root:

    python -m unittest discover -s tests
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from memory_ob.store import Store  # noqa: E402


def run_cli(args: list[str], *, env: dict[str, str]) -> subprocess.CompletedProcess:
    """Run the Memory_OB CLI as a real subprocess."""
    return subprocess.run(
        [sys.executable, "-m", "memory_ob.cli", *args],
        capture_output=True,
        text=True,
        cwd=str(ROOT),
        env={**os.environ, **env},
    )


class CliCase(unittest.TestCase):
    """End-to-end CLI tests against a throwaway vault."""

    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = os.path.join(self.tmp, "vault")
        self.db = os.path.join(self.tmp, "mob.db")
        self.env = {
            "MEMORY_OB_VAULT": self.vault,
            "MEMORY_OB_DB": self.db,
        }

    def test_init_creates_vault_and_store(self) -> None:
        r = run_cli(["init"], env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(Path(self.db).exists())
        for name in ("00 System", "09 Activity & Undo", "10 People"):
            self.assertTrue((Path(self.vault) / name).is_dir(), name)

    def test_capture_then_search_finds_candidate(self) -> None:
        run_cli(["init"], env=self.env)
        r = run_cli(["capture", "I prefer dark mode on every machine"], env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("candidate", r.stdout.lower())

        s = run_cli(["search", "dark mode"], env=self.env)
        self.assertEqual(s.returncode, 0, s.stderr)
        self.assertIn("UNVERIFIED", s.stdout)
        self.assertIn("dark mode", s.stdout)

    def test_propose_approve_then_confirmed_record_lands(self) -> None:
        run_cli(["init"], env=self.env)
        st = Store(self.db)
        from memory_ob.review import CardStore

        cs = CardStore(st)
        card = cs.propose_record(
            new={
                "kind": "profile",
                "title": "Prefers dark mode",
                "body": "I prefer dark mode on every machine",
                "speaker": "user",
            }
        )
        cards = run_cli(["review"], env=self.env)
        self.assertIn(card.id, cards.stdout)

        a = run_cli(["approve", card.id], env=self.env)
        self.assertEqual(a.returncode, 0, a.stderr)
        recs = st.list_records()
        self.assertEqual(len(recs), 1)
        self.assertEqual(recs[0].title, "Prefers dark mode")
        # The whole point: approval SIGNED it. Truth is a signature, and the
        # card that signed it is recorded.
        self.assertTrue(recs[0].is_truth, "approve did not sign truth")
        self.assertGreaterEqual(recs[0].trust, 0.9)
        self.assertIsNotNone(recs[0].confirmed_by)
        self.assertIn(card.id, recs[0].confirmed_by)
        st.close()

    def test_a_direct_write_cannot_mint_truth(self) -> None:
        """A payload is not a signature — no card, no truth (§2, law 4)."""
        run_cli(["init"], env=self.env)
        st = Store(self.db)
        from memory_ob.records import Record

        # A caller claims confirmed truth by hand.
        st.add_record(
            Record(
                id="forged",
                kind="profile",
                subject="self",
                speaker="user",
                trust=0.95,
                title="I am secretly rich",
                body="claimed out of thin air",
                status="active",
                confirmed_by="not-the-review-panel@2026-01-01T00:00:00Z",
            )
        )
        rec = st.get_record("forged")
        self.assertFalse(rec.is_truth)
        self.assertIsNone(rec.confirmed_by)
        self.assertLessEqual(rec.trust, 0.6)
        st.close()

    def test_deny_archives_without_creating(self) -> None:
        run_cli(["init"], env=self.env)
        st = Store(self.db)
        from memory_ob.review import CardStore

        cs = CardStore(st)
        card = cs.propose_record(new={"kind": "note", "title": "false"})
        d = run_cli(["deny", card.id, "--note", "not true"], env=self.env)
        self.assertEqual(d.returncode, 0, d.stderr)
        self.assertEqual(len(st.list_records()), 0)
        got = cs.get(card.id)
        assert got is not None
        self.assertEqual(got.resolution, "deny")
        self.assertEqual(got.note, "not true")
        st.close()

    def test_neversend_never_reaches_search_or_export(self) -> None:
        run_cli(["init"], env=self.env)
        st = Store(self.db)
        from tests.test_laws import make_record

        secret = make_record(
            title="private title",
            body="private body content",
            never_send=True,
        )
        st.add_record(secret)
        st.close()

        s = run_cli(["search", "private"], env=self.env)
        self.assertNotIn(secret.id, s.stdout)
        self.assertNotIn("private body", s.stdout)

        e = run_cli(["export"], env=self.env)
        self.assertEqual(e.returncode, 0, e.stderr)
        exported = list(Path(self.vault).rglob("*.md"))
        for p in exported:
            self.assertNotIn("private body", p.read_text(encoding="utf-8"))

    def test_sweep_reports_planted_dead_link(self) -> None:
        run_cli(["init"], env=self.env)
        st = Store(self.db)
        from tests.test_laws import make_record

        a = make_record(title="linked")
        st.add_record(a)
        st.add_edge(a.id, "does-not-exist", "supports")
        st.close()

        r = run_cli(["sweep"], env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        report = json.loads(r.stdout)
        self.assertEqual(len(report["dead_links"]), 1)

    def test_graph_returns_typed_edges(self) -> None:
        run_cli(["init"], env=self.env)
        st = Store(self.db)
        from tests.test_laws import make_record

        a = make_record(title="a")
        b = make_record(title="b")
        st.add_record(a)
        st.add_record(b)
        st.add_edge(a.id, b.id, "supersedes")
        st.close()

        r = run_cli(["graph"], env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("supersedes", r.stdout)

    def test_activity_logs_every_choice(self) -> None:
        run_cli(["init"], env=self.env)
        st = Store(self.db)
        from memory_ob.review import CardStore

        cs = CardStore(st)
        card = cs.propose_record(new={"kind": "note", "title": "logged"})
        cs.resolve(card.id, "approve", by="owner")
        st.close()

        r = run_cli(["activity"], env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("card:approve", r.stdout)


class ApiCase(unittest.TestCase):
    """End-to-end HTTP tests against the real FastAPI app."""

    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = os.path.join(self.tmp, "vault")
        self.db = os.path.join(self.tmp, "mob.db")
        os.environ["MEMORY_OB_VAULT"] = self.vault
        os.environ["MEMORY_OB_DB"] = self.db

        from memory_ob import api

        api.settings = api.Settings.resolve(vault=self.vault, db=self.db)
        from tests.helpers import AuthedClient

        self.client = AuthedClient.create(api.create_app(), self.vault)

    def test_health(self) -> None:
        r = self.client.get("/api/health")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["ok"])

    def test_record_crud_over_http(self) -> None:
        payload = {
            "kind": "profile",
            "title": "Prefers dark mode",
            "body": "I prefer dark mode",
            "speaker": "user",
            "trust": 0.9,
        }
        r = self.client.post("/api/records", json=payload)
        self.assertEqual(r.status_code, 200, r.text)
        rid = r.json()["id"]

        got = self.client.get(f"/api/records/{rid}")
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["title"], "Prefers dark mode")

    def test_propose_approve_over_http(self) -> None:
        from memory_ob.store import Store
        from memory_ob.review import CardStore

        st = Store(self.db)
        cs = CardStore(st)
        card = cs.propose_record(
            new={"kind": "note", "title": "via http", "speaker": "user"}
        )
        st.close()

        r = self.client.post(f"/api/cards/{card.id}/approve")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["resolution"], "approve")

        recs = self.client.get("/api/records").json()
        self.assertEqual(len(recs), 1)
        self.assertEqual(recs[0]["title"], "via http")

    def test_search_by_meaning_excludes_private(self) -> None:
        from tests.test_laws import make_record

        st = Store(self.db)
        public = make_record(title="quarterly revenue report", body="revenue grew")
        private = make_record(
            title="secret revenue figures", body="revenue is secret", never_send=True
        )
        st.add_record(public)
        st.add_record(private)
        st.close()

        r = self.client.get("/api/search", params={"q": "revenue"})
        self.assertEqual(r.status_code, 200, r.text)
        data = r.json()
        ids = [x["id"] for x in data["results"]]
        self.assertIn(public.id, ids)
        self.assertNotIn(private.id, ids)

    def test_context_excludes_trashed(self) -> None:
        from tests.test_laws import make_record

        st = Store(self.db)
        keep = make_record(title="kept note", body="visible body")
        drop = make_record(title="trashed note", body="hidden body")
        st.add_record(keep)
        st.add_record(drop)
        st.trash(drop.id, reason="test")
        st.close()

        r = self.client.get("/api/search", params={"q": "body"})
        ids = [x["id"] for x in r.json()["results"]]
        self.assertIn(keep.id, ids)
        self.assertNotIn(drop.id, ids)

    def test_graph_typed_edges_over_http(self) -> None:
        from tests.test_laws import make_record

        st = Store(self.db)
        a = make_record(title="a")
        b = make_record(title="b")
        st.add_record(a)
        st.add_record(b)
        st.add_edge(a.id, b.id, "contradicts")
        st.close()

        r = self.client.get("/api/graph")
        self.assertEqual(r.status_code, 200, r.text)
        labels = [e["label"] for e in r.json()["edges"]]
        self.assertIn("contradicts", labels)

    def test_capture_over_http(self) -> None:
        r = self.client.post("/api/capture", json={"text": "I prefer dark mode"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertGreaterEqual(r.json()["candidates"], 1)

    def test_sweep_over_http(self) -> None:
        r = self.client.post("/api/sweep")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("links_checked", r.json())

    def test_404_is_json_not_crash(self) -> None:
        r = self.client.get("/api/records/does-not-exist")
        self.assertEqual(r.status_code, 404)
        self.assertIn("detail", r.json())

    def test_ui_is_served(self) -> None:
        r = self.client.get("/ui")
        self.assertEqual(r.status_code, 200)
        self.assertIn("Memory_OB", r.text)
        for tab in ("viewReview", "viewVault", "viewSearch", "viewGraph",
                    "viewJournal", "viewNotes", "viewHealth", "viewSettings",
                    "viewIntake"):
            self.assertIn(tab, r.text)

    def test_root_redirects_to_ui(self) -> None:
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("Memory_OB", r.text)

    def test_settings_roundtrip(self) -> None:
        payload = {
            "main": {"provider": "auto", "model": "", "base_url": ""},
            "auxiliary": {
                "extract": {"provider": "auto", "model": "", "base_url": ""},
                "embed": {"provider": "ollama", "model": "nomic-embed-text",
                          "base_url": "http://127.0.0.1:11434"},
            },
        }
        saved = self.client.post("/api/settings", json=payload)
        self.assertEqual(saved.status_code, 200, saved.text)

        back = self.client.get("/api/models")
        self.assertEqual(back.status_code, 200)
        self.assertEqual(back.json()["slots"]["embed"]["model"], "nomic-embed-text")

    def test_export_endpoint(self) -> None:
        self.client.post("/api/records", json={
            "kind": "note", "title": "exported", "body": "body", "speaker": "user"
        })
        r = self.client.post("/api/export")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertGreaterEqual(r.json()["exported"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
