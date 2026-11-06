"""The connection graph (§6): typed edges, shared tags, owner curation."""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest
import warnings

from memory_ob import api
from memory_ob.store import AUTO_EDGE_LABEL, GRAPH_LABELS


class GraphCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = os.path.join(self.tmp, "vault")
        self.db = os.path.join(self.tmp, "mob.db")
        os.environ["MEMORY_OB_VAULT"] = self.vault
        os.environ["MEMORY_OB_DB"] = self.db

        api.settings = api.Settings.resolve(vault=self.vault, db=self.db)
        from tests.helpers import AuthedClient

        self.client = AuthedClient.create(api.create_app(), self.vault)
        from memory_ob.store import Store

        self.store = Store(self.db)

    def tearDown(self) -> None:
        self.store.close()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ResourceWarning)
            shutil.rmtree(self.tmp, ignore_errors=True)

    def _rec(self, rid: str, tags: list[str], **over) -> None:
        from memory_ob.records import Record

        self.store.add_record(
            Record(
                id=rid,
                kind="profile",
                subject="self",
                speaker="user",
                trust=0.9,
                title=over.get("title", rid),
                body=over.get("body", f"body of {rid}"),
                tags=tags,
                status="active",
            )
        )


class TestSharedTagEdges(GraphCase):
    def test_shared_tag_produces_an_edge(self) -> None:
        self._rec("a", ["dhaka", "tea"])
        self._rec("b", ["dhaka", "coffee"])
        self._rec("c", ["unrelated"])
        n = self.store.rebuild_shared_edges()
        self.assertEqual(n, 1)
        labels = [l for _, _, l in self.store.edges()]
        self.assertEqual(labels, [AUTO_EDGE_LABEL])

    def test_rebuild_is_disposable(self) -> None:
        self._rec("a", ["dhaka"])
        self._rec("b", ["dhaka"])
        self.store.rebuild_shared_edges()
        self.assertEqual(len(self.store.edges()), 1)
        # Re-running must not duplicate, and removing a tag must drop the edge.
        self.store.rebuild_shared_edges()
        self.assertEqual(len(self.store.edges()), 1)
        self._rec("b", ["coffee"])
        self.store.rebuild_shared_edges()
        self.assertEqual(self.store.edges(), [])

    def test_owner_link_survives_a_rebuild(self) -> None:
        self._rec("a", ["dhaka"])
        self._rec("b", ["dhaka"])
        self.store.link("a", "b", "supports")
        self.store.rebuild_shared_edges()
        labels = sorted(l for _, _, l in self.store.edges())
        self.assertEqual(labels, [AUTO_EDGE_LABEL, "supports"])


class TestOwnerCuration(GraphCase):
    def test_link_stores_a_typed_edge(self) -> None:
        self._rec("a", [])
        self._rec("b", [])
        self.client.post(
            "/api/graph/link", json={"src": "a", "dst": "b", "label": "contradicts"}
        )
        edges = self.client.get("/api/graph").json()["edges"]
        self.assertEqual(edges, [{"src": "a", "dst": "b", "label": "contradicts"}])

    def test_link_replaces_a_previous_curated_edge(self) -> None:
        self._rec("a", [])
        self._rec("b", [])
        self.client.post("/api/graph/link", json={"src": "a", "dst": "b", "label": "supports"})
        self.client.post(
            "/api/graph/link", json={"src": "a", "dst": "b", "label": "supersedes"}
        )
        edges = self.client.get("/api/graph").json()["edges"]
        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0]["label"], "supersedes")

    def test_unknown_label_is_rejected(self) -> None:
        self._rec("a", [])
        self._rec("b", [])
        r = self.client.post(
            "/api/graph/link", json={"src": "a", "dst": "b", "label": "shares_tag"}
        )
        self.assertEqual(r.status_code, 400, r.text)

    def test_missing_record_is_404(self) -> None:
        self._rec("a", [])
        r = self.client.post(
            "/api/graph/link", json={"src": "a", "dst": "ghost", "label": "supports"}
        )
        self.assertEqual(r.status_code, 404, r.text)

    def test_unlink_removes_only_the_curated_edge(self) -> None:
        self._rec("a", ["dhaka"])
        self._rec("b", ["dhaka"])
        self.store.rebuild_shared_edges()
        self.client.post("/api/graph/link", json={"src": "a", "dst": "b", "label": "cites"})
        self.client.post("/api/graph/unlink", json={"src": "a", "dst": "b"})
        labels = [l for _, _, l in self.store.edges()]
        self.assertEqual(labels, [AUTO_EDGE_LABEL])

    def test_graph_labels_are_typed_not_just_tags(self) -> None:
        self.assertGreaterEqual(
            GRAPH_LABELS, {"supports", "contradicts", "supersedes"}
        )

    def test_link_is_logged(self) -> None:
        self._rec("a", [])
        self._rec("b", [])
        self.client.post("/api/graph/link", json={"src": "a", "dst": "b", "label": "supports"})
        actions = [a["action"] for a in self.store.activity(limit=5)]
        self.assertIn("link", actions)

    def test_rebuild_route(self) -> None:
        self._rec("a", ["dhaka"])
        self._rec("b", ["dhaka"])
        r = self.client.post("/api/graph/rebuild")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["rebuilt"], 1)


class TestGraphExitGate(GraphCase):
    def test_edge_to_a_withheld_record_is_dropped(self) -> None:
        from memory_ob.records import Record

        self._rec("a", [])
        self.store.add_record(
            Record(
                id="priv",
                kind="profile",
                subject="self",
                speaker="user",
                trust=0.9,
                title="secret",
                body="secret body",
                status="active",
                never_send=True,
            )
        )
        self.store.add_edge("a", "priv", "supports")
        data = self.client.get("/api/graph").json()
        self.assertEqual(data["edges"], [])
        self.assertEqual([n["id"] for n in data["nodes"]], ["a"])


if __name__ == "__main__":
    unittest.main()
