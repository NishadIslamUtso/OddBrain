"""The monthly check-up (owner list item A9): a short summary of how memory is doing.

Shown once a month on the Review screen; available any time from Settings.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from memory_ob import checkup, manager  # noqa: E402
from memory_ob.store import Store  # noqa: E402

NOW = datetime(2026, 11, 18, 9, 0, tzinfo=timezone.utc)


class Checkup(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.vault = Path(self.tmp.name) / "V"
        self.store = Store(Path(self.tmp.name) / "s.db")

    def _capture(self, *texts: str) -> None:
        manager.capture(self.store, text=" ".join(texts),
                        model_call=lambda p: json.dumps([{"text": t} for t in texts]),
                        vault=self.vault)

    def test_the_first_time_shows_a_friendly_summary(self) -> None:
        self._capture("My knee hurts when I run.", "I like tea in the morning.")
        card = checkup.card(self.store, vault=self.vault, now=NOW)
        self.assertTrue(card["show"], "the first summary is due right away")
        self.assertEqual(card["totals"]["memories"], 2)
        self.assertTrue(any("2 memories" in l for l in card["lines"]), card["lines"])
        self.assertTrue(any("Nothing is waiting" in l for l in card["lines"]), card["lines"])
        checkup.mark_shown(self.vault, now=NOW)
        self.assertFalse(checkup.card(self.store, vault=self.vault, now=NOW)["show"],
                         "once shown, the next one waits its turn")

    def test_it_waits_about_a_month_before_showing_again(self) -> None:
        checkup.mark_shown(self.vault, now=NOW)
        self.assertFalse(checkup.due(self.vault, now=NOW + timedelta(days=29)))
        self.assertTrue(checkup.due(self.vault, now=NOW + timedelta(days=31)))

    def test_the_month_numbers_come_from_the_change_log(self) -> None:
        self._capture("My knee hurts when I run.", "I like tea in the morning.")
        # corrections and put-asides are logged by the manager layer, like the
        # real flows do (update_record alone never reaches the feed)
        import copy

        rec = self.store.list_records(status="active")[0]
        before = copy.deepcopy(rec)
        rec.body = "My knee hurts when I jog."
        self.store.update_record(rec, changed_by="owner")
        manager.log_record_change(self.store, action="update", before=before,
                                  after=rec, actor="owner", reason="edit")
        other = [r for r in self.store.list_records(status="active") if r.id != rec.id][0]
        was = copy.deepcopy(other)
        trashed = self.store.trash(other.id, reason="gone off it", by="owner")
        manager.log_record_change(self.store, action="remove", before=was,
                                  after=trashed, actor="owner", reason="forgot")
        month = checkup.summary(self.store, vault=self.vault, now=NOW)["month"]
        self.assertEqual(month, {"added": 2, "corrected": 1, "aside": 1}, month)

    def test_the_lines_say_whats_coming_and_whats_waiting(self) -> None:
        s = checkup.summary(self.store, vault=self.vault, now=NOW,
                            coming=[{"text": "call the bank", "revisit_at": "2026-01-01"}],
                            waiting=1)
        self.assertTrue(any("come back" in l and "past their date" in l for l in s["lines"]),
                        s["lines"])
        self.assertTrue(any("1 thing waiting for your answer" in l for l in s["lines"]),
                        s["lines"])
        s2 = checkup.summary(self.store, vault=self.vault, now=NOW, coming=[], waiting=0)
        self.assertTrue(any("Nothing to come back" in l for l in s2["lines"]), s2["lines"])


class CheckupApi(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.vault = Path(self.tmp.name) / "V"
        os.environ["MEMORY_OB_VAULT"] = str(self.vault)
        os.environ["MEMORY_OB_DB"] = str(Path(self.tmp.name) / "s.db")

    def test_home_shows_it_once_and_checkup_always_answers(self) -> None:
        from memory_ob import api
        try:
            from tests.helpers import AuthedClient, api_uses_reading_helper
        except ImportError:      # running as a script from inside tests/
            from helpers import AuthedClient, api_uses_reading_helper
        api_uses_reading_helper(api)

        store = Store(Path(self.tmp.name) / "s.db")
        manager.capture(store, text="My knee hurts when I run.",
                        model_call=lambda p: json.dumps([{"text": "My knee hurts when I run."}]),
                        vault=self.vault)

        client = AuthedClient.create(api.create_app(), self.vault)
        first = client.get("/api/home").json()
        self.assertTrue(first["checkup"]["show"], "the monthly summary appears")
        self.assertTrue(first["checkup"]["lines"])
        second = client.get("/api/home").json()
        self.assertFalse(second["checkup"]["show"], "it does not repeat until next month")
        on_demand = client.get("/api/checkup").json()
        self.assertTrue(on_demand["checkup"]["lines"], "Settings can always ask for it")


if __name__ == "__main__":
    unittest.main()
