"""Demo data quarantine (§15 rule 7).

Shipped sample records live apart from real data and are excluded from
search, context, graph, health counts and sync unless the owner explicitly
includes them.
"""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest
import warnings
from pathlib import Path

from memory_ob import api, sync
from memory_ob.records import Record
from memory_ob.store import Store


class DemoCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.vault = self.tmp / "vault"
        self.db = self.tmp / "mob.db"
        os.environ["MEMORY_OB_VAULT"] = str(self.vault)
        os.environ["MEMORY_OB_DB"] = str(self.db)
        api.settings = api.Settings.resolve(vault=self.vault, db=self.db)
        from tests.helpers import AuthedClient

        self.client = AuthedClient.create(api.create_app(), self.vault)
        self.store = Store(self.db)

    def tearDown(self) -> None:
        self.store.close()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ResourceWarning)
            shutil.rmtree(self.tmp, ignore_errors=True)

    def _add(self, rid: str, *, demo: bool = False, trust: float = 0.9,
             tags: list[str] | None = None) -> None:
        self.store.add_record(
            Record(
                id=rid,
                kind="profile",
                subject="self",
                speaker="user",
                trust=trust,
                title=f"title {rid}",
                body=f"body of {rid}",
                tags=tags or [],
                status="active",
                demo=demo,
            )
        )


class TestQuarantine(DemoCase):
    def test_demo_hidden_from_listings(self) -> None:
        self._add("real")
        self._add("sample", demo=True)
        ids = [r["id"] for r in self.client.get("/api/records").json()]
        self.assertEqual(ids, ["real"])

    def test_demo_hidden_from_search(self) -> None:
        self._add("sample", demo=True)
        body = self.client.get("/api/search?q=sample").json()
        self.assertEqual(body["results"], [])

    def test_demo_hidden_from_health_counts(self) -> None:
        self._add("real")
        self._add("sample", demo=True)
        stats = self.client.get("/api/health").json()["stats"]
        self.assertEqual(stats["records"], 1)

    def test_demo_hidden_from_graph(self) -> None:
        self._add("real", tags=["dhaka"])
        self._add("sample", demo=True, tags=["dhaka"])
        self.client.post("/api/graph/rebuild", json={})
        data = self.client.get("/api/graph").json()
        self.assertEqual(data["edges"], [])

    def test_demo_never_syncs(self) -> None:
        self._add("sample", demo=True)
        self.assertEqual(sync.confirmed_records(self.store), [])

    def test_demo_fact_hidden(self) -> None:
        self.store.add_fact("sample fact", trust=0.4, demo=True)
        body = self.client.get("/api/search?q=sample").json()
        self.assertEqual(body["candidates"], [])

    def test_owner_can_include_demo(self) -> None:
        self._add("real")
        self._add("sample", demo=True)
        ids = [
            r["id"]
            for r in self.client.get("/api/records?include_demo=1").json()
        ]
        self.assertEqual(sorted(ids), ["real", "sample"])

    def test_migration_adds_the_column(self) -> None:
        """An older database without the demo column still opens."""
        import sqlite3

        old = self.tmp / "old.db"
        conn = sqlite3.connect(str(old))
        conn.execute(
            "CREATE TABLE records (id TEXT PRIMARY KEY, kind TEXT, subject TEXT,"
            " speaker TEXT, status TEXT, trust REAL, title TEXT, body TEXT,"
            " tags TEXT, source TEXT, event_time TEXT, capture_time TEXT,"
            " confirmed_by TEXT, never_send INTEGER, links TEXT,"
            " created TEXT, modified TEXT)"
        )
        conn.commit()
        conn.close()
        Store(old)  # must not raise
        check = sqlite3.connect(str(old))
        check.row_factory = sqlite3.Row
        cols = {
            r["name"] for r in check.execute("PRAGMA table_info(records)")
        }
        check.close()
        self.assertIn("demo", cols)


if __name__ == "__main__":
    unittest.main()
