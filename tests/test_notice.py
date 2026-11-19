"""When the upgrade closes old questions, the owner is told once."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob import api, startup  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.review import CardStore  # noqa: E402
from memory_ob.store import Store  # noqa: E402
from tests.helpers import AuthedClient  # noqa: E402


class Case(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.vault, self.db = self.tmp / "vault", self.tmp / "m.db"
        self.settings = Settings.resolve(vault=self.vault, db=self.db, models_path=self.tmp / "models.json")
        self.settings.ensure_dirs()
        startup._done.discard(str(self.vault.resolve()))          # noqa: SLF001

    def leave_old_questions(self, n: int) -> None:
        with Store(self.db) as st:
            cards = CardStore(st)
            for i in range(n):
                cards.propose_ask(title=f"Old question {i}", body="from the review-everything version")


class Notice(Case):
    def test_no_old_questions_means_no_notice(self) -> None:
        startup.prepare(self.settings)
        self.assertEqual(startup.notice(self.vault), "")

    def test_old_questions_are_closed_and_the_owner_is_told_once(self) -> None:
        self.leave_old_questions(3)
        startup.prepare(self.settings)
        text = startup.notice(self.vault)
        self.assertIn("closed 3 old questions", text)
        self.assertIn("Nothing you saved was changed", text)
        with Store(self.db) as st:
            self.assertEqual(CardStore(st).list(status="pending", limit=10), [])
        startup.dismiss_notice(self.vault)
        self.assertEqual(startup.notice(self.vault), "")
        startup._done.discard(str(self.vault.resolve()))          # noqa: SLF001
        startup.prepare(self.settings)
        self.assertEqual(startup.notice(self.vault), "", "it is only ever said once")

    def test_through_the_app(self) -> None:
        self.leave_old_questions(1)
        startup.prepare(self.settings)
        api.settings = self.settings
        client = AuthedClient.create(api.create_app(), self.vault)
        self.assertIn("closed 1 old question", client.get("/api/status").json()["notice"])
        self.assertEqual(client.post("/api/notice/dismiss").status_code, 200)
        self.assertEqual(client.get("/api/status").json()["notice"], "")


if __name__ == "__main__":
    unittest.main()
