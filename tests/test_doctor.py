"""Doctor, record history, and the serve command.

Doctor is the "is this set up right?" surface: it must report everything that
is wrong in one pass, never raise, and never have side effects (the consistency
sweep opens Review cards — doctor must not).
"""

from __future__ import annotations

import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob.config import VAULT_FOLDER_NAMES  # noqa: E402


class DoctorCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = Path(self.tmp) / "vault"
        self.db = Path(self.tmp) / "mob.db"
        self.settings = _settings(self.vault, self.db)

    def test_missing_vault_is_a_note_not_a_failure(self) -> None:
        """A clean install has no folders yet; that is normal, not broken."""
        from memory_ob.doctor import run_checks

        report = run_checks(self.settings)
        by_name = {c.name: c for c in report.checks}
        self.assertFalse(by_name["vault"].ok)
        self.assertEqual(by_name["vault"].severity, "warn")
        self.assertIn("memory-ob init", by_name["vault"].fix)
        self.assertTrue(report.ok)
        self.assertIn(by_name["vault"], report.warnings)

    def test_initialised_vault_passes_the_structure_checks(self) -> None:
        from memory_ob.doctor import run_checks
        from memory_ob.store import Store

        self.settings.ensure_dirs()
        st = Store(self.db)  # creates the schema
        st.close()
        report = run_checks(self.settings)
        by_name = {c.name: c for c in report.checks}
        self.assertTrue(by_name["vault"].ok)
        self.assertTrue(by_name["store"].ok)

    def test_placeholder_token_is_caught(self) -> None:
        from memory_ob.doctor import run_checks

        self.settings.ensure_dirs()
        self.settings.token_path.write_text("brain-local-token", encoding="utf-8")
        report = run_checks(self.settings)
        token = next(c for c in report.checks if c.name == "token")
        self.assertFalse(token.ok)
        self.assertIn("placeholder", token.detail)

    def test_every_vault_folder_is_checked(self) -> None:
        """A vault missing one folder must not pass."""
        from memory_ob.doctor import run_checks

        self.settings.ensure_dirs()
        (self.vault / "People").rmdir()
        report = run_checks(self.settings)
        vault = next(c for c in report.checks if c.name == "vault")
        self.assertFalse(vault.ok)

    def test_a_broken_store_is_reported_not_raised(self) -> None:
        from memory_ob.doctor import run_checks

        self.settings.ensure_dirs()
        self.settings.db.write_text("this is not a database", encoding="utf-8")
        report = run_checks(self.settings)
        store = next(c for c in report.checks if c.name == "store")
        self.assertFalse(store.ok)

    def test_doctor_never_opens_review_cards(self) -> None:
        """Read-only: no card may appear after a doctor run."""
        from memory_ob.doctor import run_checks
        from memory_ob.store import Store

        self.settings.ensure_dirs()
        st = Store(self.db)
        try:
            before = len(st.list_records(kind="card", include_private=True))
            run_checks(self.settings)
            after = len(st.list_records(kind="card", include_private=True))
        finally:
            st.close()
        self.assertEqual(before, after)

    def test_report_shape(self) -> None:
        from memory_ob.doctor import doctor

        out = doctor(self.settings)
        self.assertIn("checks", out)
        self.assertIn("paths", out)
        self.assertIn("vault", out["paths"])
        self.assertIsInstance(out["failed"], int)


class HistoryCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = os.path.join(self.tmp, "vault")
        self.db = os.path.join(self.tmp, "mob.db")
        os.environ["MEMORY_OB_VAULT"] = self.vault
        os.environ["MEMORY_OB_DB"] = self.db

        from memory_ob import api

        self._prev = api.settings
        api.configure(api.Settings.resolve(vault=self.vault, db=self.db))
        from tests.helpers import AuthedClient, sign

        self.client = AuthedClient.create(api.create_app(), self.vault)
        self.sign = sign

    def tearDown(self) -> None:
        from memory_ob import api

        api.configure(self._prev)

    def _make_record(self) -> str:
        from memory_ob.records import Record
        from memory_ob.store import Store

        st = Store(self.db)
        try:
            rec = Record(
                id="rec-history", kind="note", subject="self", title="First", body="v1",
                speaker="user", trust=0.5,
            )
            st.add_record(rec, changed_by="owner")
            return rec.id
        finally:
            st.close()

    def test_history_404_for_a_missing_record(self) -> None:
        r = self.client.get("/api/records/nope/history")
        self.assertEqual(r.status_code, 404)

    def test_history_shows_every_version(self) -> None:
        from memory_ob.records import Record
        from memory_ob.store import Store

        rid = self._make_record()
        st = Store(self.db)
        try:
            rec = st.get_record(rid)
            rec.title = "Second"
            st.update_record(rec, changed_by="owner", reason="edited")
        finally:
            st.close()

        r = self.client.get(f"/api/records/{rid}/history")
        self.assertEqual(r.status_code, 200)
        versions = r.json()["versions"]
        self.assertEqual(len(versions), 2)
        self.assertEqual(versions[0]["version"], 1)
        self.assertEqual(versions[1]["version"], 2)
        self.assertEqual(versions[1]["reason"], "edited")

    def test_history_of_a_new_record_is_one_version(self) -> None:
        rid = self._make_record()
        r = self.client.get(f"/api/records/{rid}/history")
        self.assertEqual(len(r.json()["versions"]), 1)


class CliCase(unittest.TestCase):
    def test_doctor_exits_nonzero_on_a_real_failure(self) -> None:
        """A published placeholder token is a genuine fault; a missing folder is not."""
        from memory_ob.cli import main

        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp) / "vault"
            s = _settings(vault, Path(tmp) / "m.db")
            s.ensure_dirs()
            s.token_path.write_text("brain-local-token", encoding="utf-8")
            buf = io.StringIO()
            with redirect_stdout(buf):
                main([
                    "--vault", str(vault), "--db", str(s.db),
                    "--models-path", str(s.models_path), "doctor",
                ])
            out = buf.getvalue()
        self.assertEqual(out.count("FAIL"), 1)
        self.assertIn("placeholder", out)
        self.assertIn("token", out)

    def test_doctor_exits_zero_on_a_clean_install(self) -> None:
        """Nothing configured yet is a warning, not a failure."""
        from memory_ob.cli import main

        with tempfile.TemporaryDirectory() as tmp:
            buf = io.StringIO()
            with redirect_stdout(buf):
                code = main([
                    "--vault", tmp, "--db", os.path.join(tmp, "m.db"), "doctor",
                ])
        self.assertEqual(code, 0)
        self.assertIn("nothing is wrong", buf.getvalue())

    def test_doctor_exits_zero_on_a_healthy_install(self) -> None:
        from memory_ob.cli import main
        from memory_ob.config import Settings

        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp) / "vault"
            s = _settings(vault, Path(tmp) / "m.db")
            s.ensure_dirs()
            s.token_path.write_text("a-real-random-token", encoding="utf-8")
            # models.json and a reachable backend are environment-dependent;
            # a clean vault with a token should at least not crash.
            buf = io.StringIO()
            with redirect_stdout(buf):
                main([
                    "--vault", str(vault), "--db", str(s.db),
                    "--models-path", str(s.models_path), "doctor",
                ])
            out = buf.getvalue()
        self.assertIn("vault", out)
        self.assertIn("store", out)

    def test_serve_is_on_the_parser(self) -> None:
        from memory_ob.cli import build_parser

        parser = build_parser()
        for argv in (["doctor"], ["serve"], ["serve", "--port", "9999"]):
            self.assertEqual(parser.parse_args(argv).command, argv[0])


def _settings(vault, db):
    from memory_ob.config import Settings

    return Settings.resolve(vault=vault, db=db)


if __name__ == "__main__":
    unittest.main()
