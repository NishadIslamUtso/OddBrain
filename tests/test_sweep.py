"""The one-time clean-up of junk older versions saved (owner's list item A6).

It only moves things to the trash (undoable, never deleted) and only what the
not-life filter can prove is not life. The junk is seeded the way it really
exists in the owner's vault: records saved before the filter existed.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from memory_ob import ids, manager, topics  # noqa: E402
from memory_ob.records import Record  # noqa: E402
from memory_ob.store import Store  # noqa: E402

try:
    from tests.helpers import sign
except ImportError:      # running as a script from inside tests/
    from helpers import sign


def make_record(body: str, **kw) -> Record:
    base: dict = dict(
        id=ids.new_id(), kind="note", subject="self", speaker="user", status="active",
        trust=0.5, title=body[:40], body=body, tags=[], source={}, event_time=None,
        capture_time=None, confirmed_by=None, never_send=False, demo=False, links={},
    )
    base.update(kw)
    return Record.from_dict(base)


class SweepJunk(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = Path(self.tmp.name) / "V"
        self.store = Store(Path(self.tmp.name) / "s.db")

    def tearDown(self) -> None:
        self.store.close()
        self.tmp.cleanup()

    def test_dry_run_reports_without_touching_anything(self) -> None:
        sign(self.store, make_record("My knee hurts when I run."))
        sign(self.store, make_record('INFO: 127.0.0.1:1 - "GET /api/vault/notes HTTP/1.1" 200 OK'))
        out = manager.sweep_junk(self.store, vault=self.vault, apply=False)
        self.assertEqual(out["found"], 1)
        self.assertEqual(out["trashed"], 0)
        self.assertEqual(len(self.store.list_records(status="active")), 2)

    def test_apply_moves_only_the_junk_to_the_trash(self) -> None:
        sign(self.store, make_record("My knee hurts when I run."))
        sign(self.store, make_record('INFO: 127.0.0.1:1 - "GET /api/vault/notes HTTP/1.1" 200 OK'))
        sign(self.store, make_record("Change nothing."))
        out = manager.sweep_junk(self.store, vault=self.vault, apply=True)
        self.assertEqual((out["found"], out["trashed"]), (2, 2))
        self.assertEqual([r.body for r in self.store.list_records(status="active")],
                         ["My knee hurts when I run."])
        self.assertTrue(self.store.list_records(status="trash"),
                        "the junk goes to the trash - undoable, never deleted")

    def test_a_junk_folder_name_is_cleaned_but_the_memory_stays(self) -> None:
        sign(self.store, make_record("My bakery budget is 5 lakh.",
                                    tags=[topics.thread_tag("From")]))
        out = manager.sweep_junk(self.store, vault=self.vault, apply=True)
        self.assertEqual(out["tag_stripped"], 1)
        rec = self.store.list_records(status="active")[0]
        self.assertEqual(rec.body, "My bakery budget is 5 lakh.", "the memory stays")
        self.assertFalse([t for t in (rec.tags or []) if t.startswith("project/")],
                         "the stray-word folder is gone")

    def test_a_real_project_is_left_alone(self) -> None:
        sign(self.store, make_record("I am learning Rust for the bakery app.",
                                    tags=[topics.thread_tag("Bakery")]))
        out = manager.sweep_junk(self.store, vault=self.vault, apply=True)
        self.assertEqual(out["tag_stripped"], 0)
        rec = self.store.list_records(status="active")[0]
        self.assertIn("project/bakery", rec.tags or [])

    def test_the_sweep_clears_the_lines_that_really_got_into_the_vault_and_spares_real_life(self) -> None:
        from tests.test_notlife_agent import FROM_THE_REAL_VAULT, REAL_LIFE

        for line in FROM_THE_REAL_VAULT + REAL_LIFE:
            sign(self.store, make_record(line))
        out = manager.sweep_junk(self.store, vault=self.vault, apply=True)
        left = [r.body for r in self.store.list_records(status="active")]
        self.assertEqual(sorted(left), sorted(REAL_LIFE), "only the owner's real life is left")
        self.assertEqual(out["trashed"], len(FROM_THE_REAL_VAULT))

    def test_everything_the_sweep_moved_can_be_put_back(self) -> None:
        sign(self.store, make_record("Let me fetch 9-13 to complete the reading."))
        out = manager.sweep_junk(self.store, vault=self.vault, apply=True)
        self.assertEqual(out["trashed"], 1)
        trashed = self.store.list_records(status="trash")
        self.assertEqual(len(trashed), 1, "moved to the trash, not deleted")
        self.assertEqual(trashed[0].body, "Let me fetch 9-13 to complete the reading.")


if __name__ == "__main__":
    unittest.main()
