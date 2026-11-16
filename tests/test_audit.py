"""The check-up: finds what disagrees, repeats or went stale; fixes only the notes; the owner answers the rest."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob import audit, feed, manager, topics, vault as vault_mod  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402


def days_ago(n: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).strftime("%Y-%m-%dT%H:%M:%SZ")


class Case(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.vault, self.db = self.tmp / "vault", self.tmp / "m.db"
        Settings.resolve(vault=self.vault, db=self.db).ensure_dirs()
        self.store = Store(self.db)

    def tearDown(self) -> None:
        self.store.close()

    def say(self, text: str, *, category: str | None = None, tags: list[str] | None = None, age: int = 0, **kw):
        """Save one memory directly (as if told on another day), then write the notes."""
        rec = manager.sign_new(self.store, text, tags=tags, category=category, **kw)
        if age:
            self.store.conn.execute("UPDATE records SET created = ?, modified = ? WHERE id = ?",
                                    (days_ago(age), days_ago(age), rec.id))
            self.store.conn.commit()
        return self.store.get_record(rec.id)

    def run_audit(self, **kw):
        manager._tidy(self.store, self.vault, None)           # noqa: SLF001
        return audit.run(self.store, self.vault, **kw)

    def kinds(self, report) -> list[str]:
        return [f["kind"] for f in report["findings"]]


class Findings(Case):
    def test_two_memories_that_disagree(self) -> None:
        self.say("I live in Dhaka", age=30)
        self.say("I live in Sylhet", age=1)
        report = self.run_audit()
        self.assertEqual(self.kinds(report), ["disagree"])
        f = report["findings"][0]
        self.assertIn("Dhaka", f["detail"])
        self.assertIn("Sylhet", f["detail"])
        self.assertEqual([a["key"] for a in f["actions"]], ["keep_new", "keep_old", "keep_both"])

    def test_the_same_thing_twice(self) -> None:
        self.say("I take a walk every evening", age=9)
        self.say("I take a walk every evening.", age=1)
        self.assertEqual(self.kinds(self.run_audit()), ["twice"])

    def test_things_about_different_people_do_not_clash(self) -> None:
        self.say("My sister lives in Dhaka")
        self.say("My brother lives in Sylhet")
        self.say("I live in Chittagong")
        self.assertEqual(self.run_audit()["findings"], [])

    def test_one_time_moments_and_journal_lines_are_left_alone(self) -> None:
        self.say("I ran 5 km today", tags=[topics.MOMENT_TAG])
        self.say("I ran 8 km today", tags=[topics.MOMENT_TAG])
        manager.add_journal_entry(self.store, "I felt tired today", vault=self.vault)
        manager.add_journal_entry(self.store, "I felt great today", vault=self.vault)
        self.assertEqual(self.run_audit()["findings"], [])

    def test_a_to_do_that_has_sat_for_weeks(self) -> None:
        self.say("Renew my passport", tags=[topics.TODO_TAG], age=60)
        self.say("Buy a new charger", tags=[topics.TODO_TAG], age=3)
        report = self.run_audit()
        self.assertEqual(self.kinds(report), ["old-todo"])
        self.assertIn("passport", report["findings"][0]["detail"])
        self.assertIn("60 days", report["findings"][0]["detail"])

    def test_a_ticked_off_to_do_is_not_stale(self) -> None:
        self.say("Renew my passport", tags=[topics.DONE_TAG], age=60)
        self.assertEqual(self.run_audit()["findings"], [])

    def test_proof_that_no_longer_matches_its_conversation(self) -> None:
        out = manager.capture(self.store, text="I live in Dhaka and I study CSE at BRAC University.", vault=self.vault,
                              model_call=lambda _p: json.dumps({"text": "I study CSE at BRAC University"}))
        self.assertEqual(out.saved, 1)
        self.assertEqual(self.run_audit()["findings"], [], "a normal memory must pass its own proof check")
        self.store.conn.execute("UPDATE conversations SET text = ?", ("Something else entirely.",))
        self.store.conn.commit()
        self.assertEqual(self.kinds(audit.run(self.store, self.vault)), ["quote"])

    def test_a_deleted_conversation_is_not_a_problem(self) -> None:
        manager.capture(self.store, text="I study CSE at BRAC.", vault=self.vault,
                        model_call=lambda _p: json.dumps({"text": "I study CSE at BRAC"}))
        self.store.conn.execute("DELETE FROM conversations")
        self.store.conn.commit()
        self.assertEqual(self.run_audit()["findings"], [])

    def test_the_report_is_short_and_counts_the_rest(self) -> None:
        for i in range(12):
            self.say(f"Task number {i} about the garden shed", tags=[topics.TODO_TAG], age=70 + i)
        report = self.run_audit()
        self.assertEqual(len(report["findings"]), audit.MAX_PER_KIND)
        self.assertEqual(report["more"], {"old-todo": 4})
        self.assertEqual(report["summary"]["needs_you"], 12)


class Answers(Case):
    def setUp(self) -> None:
        super().setUp()
        self.old = self.say("I live in Dhaka", age=30)
        self.new = self.say("I live in Sylhet", age=1)

    def answer(self, action: str, index: int = 0, **kw):
        report = audit.public(self.vault)
        return audit.act(self.store, self.vault, report["findings"][index]["id"], action, **kw)

    def active(self) -> set[str]:
        return {r.body for r in self.store.list_records(status="active")}

    def test_keep_the_newer_removes_the_older_and_can_be_undone(self) -> None:
        self.run_audit()
        self.answer("keep_new")
        self.assertEqual(self.active(), {"I live in Sylhet"})
        item = next(i for i in feed.build(self.store) if i["verb"].startswith("Removed"))
        self.assertTrue(item["can_undo"])
        manager.undo(self.store, item["seq"], vault=self.vault)
        self.assertEqual(self.active(), {"I live in Dhaka", "I live in Sylhet"})

    def test_keep_the_older_removes_the_newer(self) -> None:
        self.run_audit()
        self.answer("keep_old")
        self.assertEqual(self.active(), {"I live in Dhaka"})

    def test_both_are_right_is_never_asked_again(self) -> None:
        self.run_audit()
        self.answer("keep_both")
        self.assertEqual(self.active(), {"I live in Dhaka", "I live in Sylhet"})
        self.assertEqual(self.run_audit()["findings"], [])
        self.assertEqual(self.run_audit()["findings"], [])

    def test_a_memory_edited_since_is_asked_about_again(self) -> None:
        self.run_audit()
        self.answer("keep_both")
        manager.edit_record(self.store, self.new.id, body="I live in Rajshahi", vault=self.vault)
        self.assertEqual(self.kinds(self.run_audit()), ["disagree"])

    def test_the_same_thing_twice_keeps_the_older(self) -> None:
        for r in (self.old, self.new):
            manager.forget_record(self.store, r.id, vault=self.vault)
        self.say("I take a walk every evening", age=9)
        self.say("I take a walk every evening.", age=1)
        self.run_audit()
        self.answer("join")
        self.assertEqual(len([r for r in self.store.list_records(status="active")]), 1)

    def test_to_do_answers(self) -> None:
        for r in (self.old, self.new):
            manager.forget_record(self.store, r.id, vault=self.vault)
        a = self.say("Renew my passport", tags=[topics.TODO_TAG], age=60)
        self.run_audit()
        self.answer("done")
        self.assertIn(topics.DONE_TAG, self.store.get_record(a.id).tags)
        self.assertEqual(self.run_audit()["findings"], [])

    def test_still_to_do_waits_then_asks_again(self) -> None:
        for r in (self.old, self.new):
            manager.forget_record(self.store, r.id, vault=self.vault)
        self.say("Renew my passport", tags=[topics.TODO_TAG], age=60)
        self.run_audit()
        self.answer("still")
        self.assertEqual(self.run_audit()["findings"], [])
        later = (datetime.now(timezone.utc) + timedelta(days=audit.SNOOZE_DAYS + 1)).strftime("%Y-%m-%d")
        self.assertEqual(self.kinds(audit.run(self.store, self.vault, today=later)), ["old-todo"])

    def test_bad_requests(self) -> None:
        self.run_audit()
        fid = audit.public(self.vault)["findings"][0]["id"]
        with self.assertRaises(ValueError):
            audit.act(self.store, self.vault, fid, "explode")
        with self.assertRaises(LookupError):
            audit.act(self.store, self.vault, "nope", "keep_new")

    def test_if_a_memory_changed_since_the_report_nothing_is_removed(self) -> None:
        self.run_audit()
        manager.forget_record(self.store, self.old.id, vault=self.vault)
        self.assertEqual(self.answer("keep_old"), {"result": "gone"})
        self.assertEqual(self.active(), {"I live in Sylhet"})


class AlreadyAnswered(Case):
    def test_both_are_true_said_at_the_time_is_not_asked_again_later(self) -> None:
        manager.capture(self.store, text="I like tea in the morning.", vault=self.vault,
                        model_call=lambda _p: json.dumps({"text": "I like tea in the morning"}))
        manager.capture(self.store, text="I do not like tea in the morning.", vault=self.vault,
                        model_call=lambda _p: json.dumps({"text": "I do not like tea in the morning"}))
        from memory_ob.review import CardStore

        pending = CardStore(self.store).list(status="pending", limit=10)
        self.assertEqual(len(pending), 1)
        manager.answer_conflict(self.store, pending[0].id, "both", vault=self.vault)
        self.assertEqual(len(self.store.list_records(status="active")), 2)
        self.assertEqual(self.run_audit()["findings"], [], "the owner already said both are true")
        # without that answer the very same pair is a disagreement
        audit_data = audit._load(self.vault)                         # noqa: SLF001
        audit_data["answered_pairs"] = []
        audit._save(self.vault, audit_data)                          # noqa: SLF001
        self.assertEqual(self.kinds(self.run_audit()), ["disagree"])


class Checks(Case):
    def test_a_healthy_store_passes_every_check(self) -> None:
        self.say("I like mangoes a lot")
        report = self.run_audit()
        self.assertTrue(all(c["ok"] for c in report["checks"]), report["checks"])
        self.assertEqual({c["key"] for c in report["checks"]}, {"notes", "private", "database", "originals"})

    def test_a_note_that_lost_a_line_is_put_right(self) -> None:
        rec = self.say("I like mangoes a lot")
        self.run_audit()
        for path in self.vault.rglob("*.md"):
            text = path.read_text(encoding="utf-8")
            if f"^{rec.id}" in text:
                path.write_text("\n".join(l for l in text.splitlines() if f"^{rec.id}" not in l) + "\n", encoding="utf-8")
        report = audit.run(self.store, self.vault)
        notes = next(c for c in report["checks"] if c["key"] == "notes")
        self.assertTrue(notes["ok"])
        self.assertEqual(notes["fixed"], 1)
        self.assertIn(f"^{rec.id}", "".join(p.read_text(encoding="utf-8") for p in self.vault.rglob("*.md")))

    def test_a_private_memory_never_stays_in_a_note(self) -> None:
        rec = self.say("My secret plan is to move abroad")
        self.run_audit()
        self.assertIn(f"^{rec.id}", "".join(p.read_text(encoding="utf-8") for p in self.vault.rglob("*.md")))
        self.store.conn.execute("UPDATE records SET never_send = 1 WHERE id = ?", (rec.id,))
        self.store.conn.commit()
        report = audit.run(self.store, self.vault)             # the note still has the line: it is fixed and counted
        self.assertTrue(next(c for c in report["checks"] if c["key"] == "private")["ok"])
        self.assertNotIn(f"^{rec.id}", "".join(p.read_text(encoding="utf-8") for p in self.vault.rglob("*.md")))

    def test_without_fixing_it_only_reports(self) -> None:
        rec = self.say("I like mangoes a lot")
        self.run_audit()
        self.store.conn.execute("UPDATE records SET never_send = 1 WHERE id = ?", (rec.id,))
        self.store.conn.commit()
        report = audit.run(self.store, self.vault, fix=False)
        self.assertFalse(next(c for c in report["checks"] if c["key"] == "private")["ok"])

    def test_the_report_is_saved_and_readable_without_running(self) -> None:
        self.assertFalse(audit.public(self.vault)["ran"])
        self.run_audit()
        again = audit.public(self.vault)
        self.assertTrue(again["ran"])
        self.assertNotIn("dismissed", again)


class ThroughTheApp(Case):
    def setUp(self) -> None:
        super().setUp()
        from memory_ob import api
        from tests.helpers import AuthedClient

        api.settings = api.Settings.resolve(vault=self.vault, db=self.db, models_path=self.tmp / "models.json")
        self.client = AuthedClient.create(api.create_app(), self.vault)

    def test_run_then_answer_from_the_screen(self) -> None:
        self.say("I live in Dhaka", age=30)
        self.say("I live in Sylhet", age=1)
        before = self.client.get("/api/home").json()["audit"]
        self.assertFalse(before["ran"])
        r = self.client.post("/api/audit/run")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["summary"]["needs_you"], 1)
        home = self.client.get("/api/home").json()["audit"]
        self.assertEqual([f["kind"] for f in home["findings"]], ["disagree"])
        fid = home["findings"][0]["id"]
        done = self.client.post(f"/api/audit/{fid}/keep_new")
        self.assertEqual(done.status_code, 200, done.text)
        self.assertEqual(done.json()["audit"]["findings"], [])
        self.assertEqual({r.body for r in self.store.list_records(status="active")}, {"I live in Sylhet"})
        self.assertEqual(self.client.post(f"/api/audit/{fid}/keep_new").status_code, 404)

    def test_bad_answers_are_refused_and_writes_need_the_key(self) -> None:
        from fastapi.testclient import TestClient

        from memory_ob import api

        self.say("I live in Dhaka", age=30)
        self.say("I live in Sylhet", age=1)
        self.client.post("/api/audit/run")
        fid = self.client.get("/api/audit").json()["findings"][0]["id"]
        self.assertEqual(self.client.post(f"/api/audit/{fid}/explode").status_code, 400)
        bare = TestClient(api.create_app())
        self.assertIn(bare.post("/api/audit/run").status_code, (401, 403))
        self.assertIn(bare.post(f"/api/audit/{fid}/keep_new").status_code, (401, 403))

    def test_the_switch_and_the_night_shift(self) -> None:
        from memory_ob import nightshift
        from memory_ob import settings as settings_mod

        self.say("I live in Dhaka", age=30)
        self.say("I live in Sylhet", age=1)
        self.assertTrue(self.client.get("/api/settings").json()["options"]["audit"])
        cfg = Settings.resolve(vault=self.vault, db=self.db, models_path=self.tmp / "models.json")
        steps = {r["step"]: r for r in nightshift.run(cfg, skip=("read", "people", "biography", "embed", "hermes"))}
        self.assertEqual(steps["audit"]["ok"], "yes", steps["audit"])
        self.assertTrue(audit.public(self.vault)["ran"])
        r = self.client.post("/api/settings", json={"audit": False})
        self.assertFalse(r.json()["options"]["audit"])
        self.assertFalse(settings_mod.load(self.vault).audit)
        self.assertEqual({x["step"]: x for x in nightshift.run(cfg, skip=("read", "people", "biography", "embed", "hermes"))}["audit"]["detail"], "off")


class FromTheCommandLine(Case):
    def test_sweep_prints_the_report(self) -> None:
        import io
        from contextlib import redirect_stdout
        from unittest import mock

        from memory_ob import cli

        self.say("I live in Dhaka", age=30)
        self.say("I live in Sylhet", age=1)
        buf = io.StringIO()
        with mock.patch.dict("os.environ", {"MEMORY_OB_VAULT": str(self.vault), "MEMORY_OB_DB": str(self.db)}), redirect_stdout(buf):
            code = cli.main(["sweep"])
        out = buf.getvalue()
        self.assertEqual(code, 0, out)
        self.assertIn("1 thing(s) to look at", out)
        self.assertIn("Sylhet", out)
        self.assertIn("answers: keep_new, keep_old, keep_both", out)


if __name__ == "__main__":
    unittest.main()
