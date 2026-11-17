"""The memory file: an old one is brought up to date, and ideas nothing used are gone."""

from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob.store import Store  # noqa: E402


def columns(db: Path, table: str) -> set[str]:
    con = sqlite3.connect(db)
    try:
        return {row[1] for row in con.execute(f"PRAGMA table_info({table})")}
    finally:
        con.close()


class TheFactsTable(unittest.TestCase):
    def test_a_new_file_has_no_unused_trust_column(self) -> None:
        db = Path(tempfile.mkdtemp()) / "m.db"
        Store(db).close()
        self.assertNotIn("corroborated", columns(db, "facts"))
        self.assertIn("trust", columns(db, "facts"))               # the score itself is used

    def test_an_old_file_loses_it_and_keeps_its_facts(self) -> None:
        db = Path(tempfile.mkdtemp()) / "m.db"
        con = sqlite3.connect(db)
        con.executescript("""
            CREATE TABLE facts (id TEXT PRIMARY KEY, text TEXT NOT NULL, trust REAL NOT NULL DEFAULT 0.3,
                status TEXT NOT NULL DEFAULT 'candidate', source TEXT NOT NULL DEFAULT '{}',
                meta TEXT NOT NULL DEFAULT '{}', corroborated INTEGER NOT NULL DEFAULT 0,
                demo INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL);
            INSERT INTO facts(id, text, trust, created, corroborated) VALUES ('f1', 'I like tea', 0.5, '2026-01-01T00:00:00Z', 2);
        """)
        con.commit()
        con.close()
        store = Store(db)
        self.addCleanup(store.close)
        self.assertNotIn("corroborated", columns(db, "facts"))
        self.assertEqual([r["text"] for r in store.conn.execute("SELECT text FROM facts")], ["I like tea"])
        fid = store.add_fact("I like coffee", trust=0.4)            # new facts still go in
        self.assertTrue(fid)


if __name__ == "__main__":
    unittest.main()
