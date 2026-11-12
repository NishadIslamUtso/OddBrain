"""Whole-car acceptance tests.

These drive the real surfaces end to end — the command line and the HTTP API —
the way the screens do. Helper-only unit tests do not count as acceptance;
these do.

Run from the project root:

    python -m unittest discover -s tests
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from memory_ob.store import Store  # noqa: E402


def run_cli(args: list[str], *, env: dict[str, str]) -> subprocess.CompletedProcess:
    """Run the Memory_OB command line as a real subprocess."""
    return subprocess.run(
        [sys.executable, "-m", "memory_ob.cli", *args],
        capture_output=True,
        text=True,
        cwd=str(ROOT),
        env={**os.environ, **env},
    )


class CliCase(unittest.TestCase):
    """End-to-end command-line tests against a throwaway vault."""

    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = os.path.join(self.tmp, "vault")
        self.db = os.path.join(self.tmp, "mob.db")
        self.env = {
            "MEMORY_OB_VAULT": self.vault,
            "MEMORY_OB_DB": self.db,
            "MEMORY_OB_MODELS": os.path.join(self.tmp, "models.json"),
            "HERMES_HOME": os.path.join(self.tmp, "no-hermes"),
        }

    def test_init_creates_vault_and_store(self) -> None:
        r = run_cli(["init"], env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(Path(self.db).exists())
        for name in ("People", "Journal", "Sources/Conversations", "Sources/Files", ".obsidian"):
            self.assertTrue((Path(self.vault) / name).is_dir(), name)

    def test_capture_files_it_and_search_finds_it(self) -> None:
        run_cli(["init"], env=self.env)
        r = run_cli(["capture", "I prefer dark mode on every machine"], env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Remembered", r.stdout)

        s = run_cli(["search", "dark mode"], env=self.env)
        self.assertEqual(s.returncode, 0, s.stderr)
        self.assertIn("dark mode", s.stdout)
        # The note is also in the vault, as plain markdown.
        notes = [p for p in Path(self.vault).rglob("*.md") if "dark mode" in p.read_text(encoding="utf-8").lower()]
        self.assertTrue(notes)

    def test_search_finds_a_close_form_of_the_word(self) -> None:
        """"allergic" must find a note that says "allergy"."""
        run_cli(["init"], env=self.env)
        run_cli(["capture", "I have a peanut allergy"], env=self.env)
        s = run_cli(["search", "allergic"], env=self.env)
        self.assertIn("allergy", s.stdout.lower())

    def test_a_changed_answer_becomes_a_question_and_can_be_answered(self) -> None:
        run_cli(["init"], env=self.env)
        run_cli(["capture", "I live in Dhaka"], env=self.env)
        c = run_cli(["capture", "I moved to Chittagong and I no longer live in Dhaka"], env=self.env)
        self.assertIn("answer", c.stdout.lower())

        d = run_cli(["doubts"], env=self.env)
        self.assertEqual(d.returncode, 0, d.stderr)
        match = re.search(r"\[([^\]]+)\] Your answer changed", d.stdout)
        self.assertIsNotNone(match, d.stdout)
        a = run_cli(["answer", match.group(1), "new"], env=self.env)
        self.assertEqual(a.returncode, 0, a.stderr)
        self.assertIn("Nothing needs your answer", run_cli(["doubts"], env=self.env).stdout)

    def test_the_feed_shows_what_was_remembered_and_undo_takes_it_back(self) -> None:
        run_cli(["init"], env=self.env)
        run_cli(["capture", "I always drink tea in the morning"], env=self.env)
        feed = run_cli(["feed"], env=self.env)
        self.assertIn("Remembered", feed.stdout)
        seq = re.search(r"#(\d+)", feed.stdout)
        self.assertIsNotNone(seq, feed.stdout)

        u = run_cli(["undo", seq.group(1)], env=self.env)
        self.assertEqual(u.returncode, 0, u.stdout + u.stderr)
        s = run_cli(["search", "tea"], env=self.env)
        self.assertIn("nothing on that", s.stdout)

    def test_import_a_notes_file(self) -> None:
        run_cli(["init"], env=self.env)
        notes = Path(self.tmp) / "notes.md"
        notes.write_text("- I study computer science\n- I train three days a week\n", encoding="utf-8")
        r = run_cli(["import", str(notes)], env=self.env)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("Brought in 2 memories", r.stdout)
        # The original file is kept untouched in the vault.
        kept = list((Path(self.vault) / "Sources" / "Files").iterdir())
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0].read_bytes(), notes.read_bytes())

    def test_a_missing_import_file_is_said_plainly(self) -> None:
        run_cli(["init"], env=self.env)
        r = run_cli(["import", os.path.join(self.tmp, "nope.json")], env=self.env)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("could not find", r.stdout)

    def test_pause_stops_capture(self) -> None:
        run_cli(["init"], env=self.env)
        st = Store(self.db)
        st.close()
        from memory_ob import anonymous

        anonymous.set_anonymous(Path(self.vault), True)
        r = run_cli(["capture", "I like cycling"], env=self.env)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("paused", r.stdout)

    def test_a_direct_write_cannot_mint_truth(self) -> None:
        """A payload is not a signature — only sign_record makes truth (law 4)."""
        run_cli(["init"], env=self.env)
        st = Store(self.db)
        from memory_ob.records import Record

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

    def test_neversend_never_reaches_search_or_the_notes(self) -> None:
        run_cli(["init"], env=self.env)
        st = Store(self.db)
        from tests.test_laws import make_record

        secret = make_record(title="private title", body="private body content", never_send=True)
        st.add_record(secret)
        st.close()

        s = run_cli(["search", "private"], env=self.env)
        self.assertNotIn(secret.id, s.stdout)
        self.assertNotIn("private body", s.stdout)

        e = run_cli(["export"], env=self.env)
        self.assertEqual(e.returncode, 0, e.stderr)
        for p in Path(self.vault).rglob("*.md"):
            self.assertNotIn("private body", p.read_text(encoding="utf-8"))

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

    def test_tidy_dry_run_changes_nothing(self) -> None:
        run_cli(["init"], env=self.env)
        r = run_cli(["tidy", "--dry-run"], env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("biography", r.stdout)

    def test_activity_logs_what_happened(self) -> None:
        run_cli(["init"], env=self.env)
        run_cli(["capture", "I enjoy chess"], env=self.env)
        r = run_cli(["activity"], env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("capture", r.stdout)

    def test_the_old_commands_are_gone(self) -> None:
        for gone in ("sweep", "dream", "chapter", "approve", "deny", "review"):
            r = run_cli([gone], env=self.env)
            self.assertNotEqual(r.returncode, 0, gone)


class ApiCase(unittest.TestCase):
    """End-to-end HTTP tests against the real FastAPI app."""

    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = os.path.join(self.tmp, "vault")
        self.db = os.path.join(self.tmp, "mob.db")
        os.environ["MEMORY_OB_VAULT"] = self.vault
        os.environ["MEMORY_OB_DB"] = self.db

        from memory_ob import api

        # configure() rebinds the module-level settings the routes read.
        # The previous value is restored in tearDown so this suite cannot
        # leak its scratch vault into any other.
        self._prev = api.settings
        api.configure(api.Settings.resolve(
            vault=self.vault, db=self.db, models_path=os.path.join(self.tmp, "models.json"),
        ))
        from tests.helpers import AuthedClient

        self.client = AuthedClient.create(api.create_app(), self.vault)

    def tearDown(self) -> None:
        from memory_ob import api

        api.configure(self._prev)

    def test_health(self) -> None:
        r = self.client.get("/api/health")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["ok"])

    def test_tell_then_edit_then_forget(self) -> None:
        r = self.client.post("/api/tell", json={"text": "I prefer dark mode"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertGreaterEqual(r.json()["saved"], 1)

        recs = self.client.get("/api/records").json()
        self.assertEqual(len(recs), 1)
        rid = recs[0]["id"]
        got = self.client.get(f"/api/records/{rid}")
        self.assertEqual(got.status_code, 200)

        edited = self.client.put(f"/api/records/{rid}", json={"body": "I prefer light mode"})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertIn("light mode", self.client.get(f"/api/records/{rid}").json()["body"])

        self.assertEqual(self.client.delete(f"/api/records/{rid}").status_code, 200)
        self.assertEqual(self.client.get("/api/records").json(), [])

    def test_an_empty_edit_is_refused(self) -> None:
        self.client.post("/api/tell", json={"text": "I prefer dark mode"})
        rid = self.client.get("/api/records").json()[0]["id"]
        r = self.client.put(f"/api/records/{rid}", json={"body": "   "})
        self.assertEqual(r.status_code, 400)

    def test_a_conflict_is_asked_and_answered_over_http(self) -> None:
        self.client.post("/api/tell", json={"text": "I live in Dhaka"})
        self.client.post("/api/tell", json={"text": "I moved to Chittagong and I no longer live in Dhaka"})
        doubts = self.client.get("/api/doubts").json()["doubts"]
        self.assertEqual(len(doubts), 1)
        self.assertEqual({o["key"] for o in doubts[0]["options"]}, {"new", "old", "both"})

        r = self.client.post(f"/api/doubts/{doubts[0]['id']}/answer", json={"answer": "old"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.client.get("/api/doubts").json()["doubts"], [])
        bodies = [x["body"] for x in self.client.get("/api/records").json()]
        self.assertTrue(any("Dhaka" in b and "moved" not in b for b in bodies))
        self.assertFalse(any("Chittagong" in b for b in bodies))

    def test_a_bad_answer_is_refused(self) -> None:
        self.client.post("/api/tell", json={"text": "I live in Dhaka"})
        self.client.post("/api/tell", json={"text": "I moved to Chittagong and I no longer live in Dhaka"})
        did = self.client.get("/api/doubts").json()["doubts"][0]["id"]
        self.assertEqual(self.client.post(f"/api/doubts/{did}/answer", json={"answer": "maybe"}).status_code, 400)
        self.assertEqual(self.client.post("/api/doubts/nope/answer", json={"answer": "new"}).status_code, 404)

    def test_the_feed_and_undo(self) -> None:
        self.client.post("/api/tell", json={"text": "I always drink tea in the morning"})
        feed = self.client.get("/api/feed").json()["feed"]
        self.assertTrue(feed)
        self.assertEqual(feed[0]["verb"], "Remembered")
        self.assertTrue(feed[0]["can_undo"])
        r = self.client.post(f"/api/undo/{feed[0]['seq']}")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.client.get("/api/records").json(), [])
        self.assertTrue(self.client.get("/api/feed").json()["feed"][0]["undone"])

    def test_search_excludes_private(self) -> None:
        from tests.test_laws import make_record

        st = Store(self.db)
        public = make_record(title="quarterly revenue report", body="revenue grew")
        private = make_record(title="secret revenue figures", body="revenue is secret", never_send=True)
        st.add_record(public)
        st.add_record(private)
        st.close()

        r = self.client.get("/api/search", params={"q": "revenue"})
        self.assertEqual(r.status_code, 200, r.text)
        ids = [x["id"] for x in r.json()["results"]]
        self.assertIn(public.id, ids)
        self.assertNotIn(private.id, ids)

    def test_search_excludes_trashed(self) -> None:
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

    def test_search_is_honest_when_there_is_nothing(self) -> None:
        r = self.client.get("/api/search", params={"q": "zebra"}).json()
        self.assertFalse(r["found"])
        self.assertEqual(r["results"], [])

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

    def test_writes_need_the_key(self) -> None:
        from fastapi.testclient import TestClient

        from memory_ob import api

        bare = TestClient(api.create_app())
        self.assertEqual(bare.post("/api/tell", json={"text": "I like tea"}).status_code, 401)
        self.assertEqual(bare.get("/api/health").status_code, 200)

    def test_404_is_json_not_crash(self) -> None:
        r = self.client.get("/api/records/does-not-exist")
        self.assertEqual(r.status_code, 404)
        self.assertIn("detail", r.json())

    def test_ui_is_served_with_the_six_screens(self) -> None:
        r = self.client.get("/ui")
        self.assertEqual(r.status_code, 200)
        self.assertIn("Memory_OB", r.text)
        for tab in ("Review", "Vault", "People", "Journal", "Me", "Settings"):
            self.assertIn(f">{tab}<", r.text, tab)
        # the old, removed screens are not there
        for gone in ("viewHealth", "viewIntake", "viewNotes", "Appearance"):
            self.assertNotIn(gone, r.text)

    def test_root_serves_the_ui(self) -> None:
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("Memory_OB", r.text)

    def test_ai_settings_roundtrip(self) -> None:
        first = self.client.get("/api/settings").json()["ai"]
        self.assertEqual(first["mode"], "auto")

        saved = self.client.post("/api/settings/ai", json={
            "mode": "custom", "reading_model": "llama3.2", "address": "http://127.0.0.1:11434",
            "meaning_model": "nomic-embed-text",
        })
        self.assertEqual(saved.status_code, 200, saved.text)
        back = self.client.get("/api/settings").json()["ai"]
        self.assertEqual(back["mode"], "custom")
        self.assertEqual(back["reading_model"], "llama3.2")
        self.assertEqual(back["meaning_model"], "nomic-embed-text")

        auto = self.client.post("/api/settings/ai", json={"mode": "auto"})
        self.assertEqual(auto.status_code, 200)
        self.assertEqual(self.client.get("/api/settings").json()["ai"]["mode"], "auto")

    def test_ai_settings_refuse_nonsense(self) -> None:
        self.assertEqual(self.client.post("/api/settings/ai", json={"mode": "custom"}).status_code, 400)
        self.assertEqual(self.client.post("/api/settings/ai", json={"mode": "banana"}).status_code, 400)
        bad = self.client.post("/api/settings/ai", json={"mode": "custom", "reading_model": "x", "address": "ftp://x"})
        self.assertEqual(bad.status_code, 400)

    def test_switches_save_and_stick(self) -> None:
        for key in ("semantic", "local_only", "bio_sensitive"):
            on = self.client.post("/api/settings", json={key: True}).json()
            self.assertTrue(on["options"][key], key)
            off = self.client.post("/api/settings", json={key: False}).json()
            self.assertFalse(off["options"][key], key)

    def test_never_remember_words_block_capture(self) -> None:
        self.client.post("/api/settings", json={"never_remember": ["lottery"]})
        r = self.client.post("/api/tell", json={"text": "I won the lottery last week"}).json()
        self.assertEqual(r["saved"], 0)
        self.assertGreaterEqual(r["blocked"], 1)

    def test_tidy_writes_the_notes(self) -> None:
        self.client.post("/api/tell", json={"text": "I train three days a week"})
        r = self.client.post("/api/tidy")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(all(s["ok"] != "no" for s in r.json()["steps"]), r.json()["steps"])
        self.assertTrue(list(Path(self.vault).rglob("*.md")))

    def test_import_text_over_http(self) -> None:
        r = self.client.post("/api/import", json={"text": "- I speak Bangla\n- I speak English", "name": "pasted"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["notes"]["saved"], 2)

    def test_a_garbled_import_is_refused_plainly(self) -> None:
        r = self.client.post("/api/import", json={"name": "x.json", "data_b64": "!!!not base64!!!"})
        self.assertEqual(r.status_code, 400)
        self.assertIn("could not read", r.json()["detail"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
