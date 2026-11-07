"""The owner's signature, and the cold start it fixes.

From an empty vault nothing could become truth: only a Review card could sign,
and every card type needed a record that already existed. These tests drive the
real store and the real HTTP surface.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))


def _settings(vault, db):
    from memory_ob.config import Settings

    return Settings.resolve(vault=vault, db=db)


class ColdStartCase(unittest.TestCase):
    """The loop must be closable from an empty vault."""

    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = Path(self.tmp) / "vault"
        self.db = Path(self.tmp) / "mob.db"
        self.settings = _settings(self.vault, self.db)
        self.settings.ensure_dirs()
        from memory_ob.store import Store

        self.store = Store(self.db)

    def tearDown(self) -> None:
        self.store.close()

    def _capture(self, text: str) -> str:
        return self.store.add_fact(text, trust=0.45, source={"origin": "test"})

    def test_an_empty_vault_can_produce_truth(self) -> None:
        """The bug: no record existed, so no card could exist, so nothing signed."""
        from memory_ob.owner import remember_fact

        fid = self._capture("I do not eat dairy")
        card = remember_fact(self.store, fid)

        records = self.store.list_records()
        self.assertEqual(len(records), 1)
        self.assertTrue(records[0].is_truth)
        # sign_record stamps "<card id>@<timestamp>" as the signature.
        self.assertTrue(records[0].confirmed_by.startswith(card.id))

    def test_the_signature_is_recorded_honestly(self) -> None:
        from memory_ob.owner import remember_fact

        fid = self._capture("I prefer dark mode")
        card = remember_fact(self.store, fid, by="owner")

        rec = self.store.list_records()[0]
        self.assertTrue(rec.confirmed_by.startswith(card.id))
        self.assertGreaterEqual(rec.trust, 0.8)

    def test_a_card_is_still_the_mechanism(self) -> None:
        """The law holds: sign_record is the only path, and a card exists."""
        from memory_ob.owner import remember_fact
        from memory_ob.review import CardStore

        fid = self._capture("I prefer dark mode")
        card = remember_fact(self.store, fid)

        stored = CardStore(self.store).get(card.id)
        self.assertIsNotNone(stored)
        self.assertEqual(stored.status, "resolved")
        self.assertEqual(stored.resolution, "approve")
        self.assertEqual(stored.resolved_by, "owner")

    def test_the_fact_leaves_the_candidate_pool(self) -> None:
        from memory_ob.owner import PROMOTED, candidates, remember_fact

        fid = self._capture("I prefer dark mode")
        remember_fact(self.store, fid)
        fact = self.store.get_fact(fid)
        self.assertIsNotNone(fact)
        self.assertEqual(fact["status"], PROMOTED)
        self.assertEqual(candidates(self.store), [])

    def test_a_remembered_fact_keeps_its_evidence(self) -> None:
        from memory_ob.owner import remember_fact

        fid = self._capture("I prefer dark mode")
        remember_fact(self.store, fid)
        rec = self.store.list_records()[0]
        self.assertEqual(rec.source.get("fact_id"), fid)

    def test_the_kind_comes_from_the_text(self) -> None:
        from memory_ob.owner import remember_fact

        fid = self._capture("I prefer dark mode")
        remember_fact(self.store, fid)
        self.assertEqual(self.store.list_records()[0].kind, "profile")

    def test_missing_fact_raises(self) -> None:
        from memory_ob.owner import remember_fact

        with self.assertRaises(LookupError):
            remember_fact(self.store, "fact-nope")

    def test_dismiss_keeps_the_text_but_drops_it_from_the_pool(self) -> None:
        from memory_ob.owner import REJECTED, dismiss_fact

        fid = self._capture("I am a teapot")
        dismiss_fact(self.store, fid)
        self.assertEqual(self.store.get_fact(fid)["status"], REJECTED)
        self.assertEqual(self.store.get_fact(fid)["text"], "I am a teapot")
        self.assertEqual(self.store.list_records(), [])


class HttpCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = os.path.join(self.tmp, "vault")
        self.db = os.path.join(self.tmp, "mob.db")
        os.environ["MEMORY_OB_VAULT"] = self.vault
        os.environ["MEMORY_OB_DB"] = self.db

        from memory_ob import api

        self._prev = api.settings
        api.configure(api.Settings.resolve(vault=self.vault, db=self.db))
        from tests.helpers import AuthedClient

        self.client = AuthedClient.create(api.create_app(), self.vault)

    def tearDown(self) -> None:
        from memory_ob import api

        api.configure(self._prev)

    def _capture(self, text: str) -> str:
        from memory_ob.store import Store

        st = Store(self.db)
        try:
            return st.add_fact(text, trust=0.45)
        finally:
            st.close()

    def test_candidates_are_listed(self) -> None:
        self._capture("I prefer dark mode")
        r = self.client.get("/api/candidates")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()["candidates"]), 1)

    def test_remember_creates_truth(self) -> None:
        fid = self._capture("I prefer dark mode")
        r = self.client.post(f"/api/candidates/{fid}/remember")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["ok"])
        records = self.client.get("/api/records").json()
        self.assertEqual(len(records), 1)
        self.assertGreaterEqual(records[0]["trust"], 0.8)

    def test_remember_needs_the_token(self) -> None:
        """A request without the dashboard token must be refused."""
        fid = self._capture("I prefer dark mode")
        r = self.client._client.post(f"/api/candidates/{fid}/remember")
        self.assertEqual(r.status_code, 401)

    def test_remember_a_missing_fact_is_404(self) -> None:
        r = self.client.post("/api/candidates/fact-nope/remember")
        self.assertEqual(r.status_code, 404)

    def test_dismiss(self) -> None:
        fid = self._capture("I am a teapot")
        r = self.client.post(f"/api/candidates/{fid}/dismiss")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client.get("/api/candidates").json()["candidates"], [])


class AgentCannotSign(unittest.TestCase):
    def test_the_provider_exposes_no_signature_tool(self) -> None:
        """The agent's tools import the library; there is no remember tool."""
        import ast

        src = (PROJECT / "provider" / "memory_ob" / "__init__.py").read_text(
            encoding="utf-8"
        )
        tree = ast.parse(src)
        names: list[str] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for t in node.targets:
                    if isinstance(t, ast.Name) and t.id.endswith("_SCHEMA"):
                        names.append(t.id)
        for n in names:
            self.assertNotIn("REMEMBER", n)
            self.assertNotIn("SIGN", n)
            self.assertNotIn("CONFIRM", n)

    def test_the_store_has_no_cardless_approval(self) -> None:
        """The trap law: sign_record needs a card, and nothing else signs."""
        from memory_ob.store import Store

        self.assertFalse(hasattr(Store, "approve_without_card"))
        self.assertTrue(hasattr(Store, "sign_record"))


class MergeCase(unittest.TestCase):
    """The dream's dedup scan proposes merges between candidate facts."""

    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = Path(self.tmp) / "vault"
        self.db = Path(self.tmp) / "mob.db"
        self.settings = _settings(self.vault, self.db)
        self.settings.ensure_dirs()
        from memory_ob.store import Store

        self.store = Store(self.db)

    def tearDown(self) -> None:
        self.store.close()

    def test_merging_two_facts_actually_does_something(self) -> None:
        """The bug: the card resolved, logged "done", and changed nothing."""
        from memory_ob.review import MERGE_IT, CardStore

        a = self.store.add_fact("I prefer dark mode", trust=0.45)
        b = self.store.add_fact("I prefer dark mode on every machine", trust=0.45)

        cards = CardStore(self.store)
        card = cards.propose_merge(record_id=a, other_id=b, title="Duplicate")
        cards.resolve(card.id, MERGE_IT, by="owner")

        self.assertEqual(self.store.get_fact(b)["status"], "merged")
        self.assertEqual(self.store.get_fact(a)["status"], "candidate")

    def test_merging_two_records_still_works(self) -> None:
        from memory_ob.records import Record
        from memory_ob.review import MERGE_IT, CardStore

        a = Record(id="rec-a", kind="note", subject="self", speaker="user", body="a", trust=0.9)
        b = Record(id="rec-b", kind="note", subject="self", speaker="user", body="b", trust=0.9)
        self.store.add_record(a, changed_by="owner")
        self.store.add_record(b, changed_by="owner")

        cards = CardStore(self.store)
        card = cards.propose_merge(record_id="rec-a", other_id="rec-b")
        cards.resolve(card.id, MERGE_IT, by="owner")

        self.assertEqual(self.store.get_record("rec-b").status, "superseded")
        self.assertIn("rec-b", self.store.get_record("rec-a").links.get("merged", []))


if __name__ == "__main__":
    unittest.main()
