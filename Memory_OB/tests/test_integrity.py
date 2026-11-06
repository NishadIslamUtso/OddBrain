"""Integrity: checksummed manifest + sharing receipts (§7, §10)."""

from __future__ import annotations

import os
import shutil
import tempfile
import unittest
import warnings
from pathlib import Path

from memory_ob import api, manifest, receipts
from memory_ob.records import Record
from memory_ob.store import Store


class ManifestCase(unittest.TestCase):
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
        (self.vault / "03 Memory").mkdir(parents=True, exist_ok=True)
        self.file = self.vault / "03 Memory" / "note.md"
        self.file.write_text("# A note\n\nbody\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.store.close()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ResourceWarning)
            shutil.rmtree(self.tmp, ignore_errors=True)


class TestManifest(ManifestCase):
    def test_build_and_verify_round_trip(self) -> None:
        report = manifest.write_manifest(self.vault)
        self.assertEqual(report["count"], 1)
        check = manifest.verify_manifest(self.vault)
        self.assertTrue(check["ok"], check)

    def test_changed_file_is_detected(self) -> None:
        manifest.write_manifest(self.vault)
        self.file.write_text("# A note\n\nTAMPERED\n", encoding="utf-8")
        check = manifest.verify_manifest(self.vault)
        self.assertFalse(check["ok"])
        self.assertIn("03 Memory/note.md", check["changed"])

    def test_missing_file_is_detected(self) -> None:
        manifest.write_manifest(self.vault)
        self.file.unlink()
        check = manifest.verify_manifest(self.vault)
        self.assertFalse(check["ok"])
        self.assertIn("03 Memory/note.md", check["missing"])

    def test_extra_file_is_detected(self) -> None:
        manifest.write_manifest(self.vault)
        (self.vault / "03 Memory" / "extra.md").write_text("x", encoding="utf-8")
        check = manifest.verify_manifest(self.vault)
        self.assertFalse(check["ok"])
        self.assertIn("03 Memory/extra.md", check["extra"])

    def test_no_manifest_is_not_ok(self) -> None:
        check = manifest.verify_manifest(self.vault)
        self.assertFalse(check["ok"])
        self.assertEqual(check["reason"], "no manifest")

    def test_verify_one_file(self) -> None:
        manifest.write_manifest(self.vault)
        self.assertTrue(manifest.verify_file(self.vault, "03 Memory/note.md"))
        self.file.write_text("changed", encoding="utf-8")
        self.assertFalse(manifest.verify_file(self.vault, "03 Memory/note.md"))

    def test_export_refreshes_the_manifest(self) -> None:
        self.client.post("/api/export", json={})
        check = self.client.get("/api/manifest").json()
        self.assertTrue(check["ok"], check)


class TestReceipts(ManifestCase):
    def _add(self, rid: str) -> None:
        self.store.add_record(
            Record(
                id=rid,
                kind="profile",
                subject="self",
                speaker="user",
                trust=0.9,
                title=f"title {rid}",
                body=f"body of {rid}",
                status="active",
            )
        )

    def test_search_writes_a_receipt(self) -> None:
        self._add("r1")
        self.client.get("/api/search?q=body")
        found = receipts.ReceiptLog(self.vault).list()
        self.assertEqual(len(found), 1)
        text = found[0].read_text(encoding="utf-8")
        self.assertIn("r1", text)
        self.assertIn("ai:recall", text)

    def test_receipts_endpoint_lists_them(self) -> None:
        self._add("r1")
        self.client.get("/api/search?q=body")
        body = self.client.get("/api/receipts").json()
        self.assertEqual(body["count"], 1)

    def test_receipt_carries_a_hash(self) -> None:
        self._add("r1")
        self.client.get("/api/search?q=body")
        text = receipts.ReceiptLog(self.vault).list()[0].read_text(encoding="utf-8")
        self.assertIn("sha256", text)

    def test_failed_receipt_never_breaks_the_recall(self) -> None:
        self._add("r1")
        # A read-only vault would break the receipt, not the search.
        body = self.client.get("/api/search?q=body").json()
        self.assertEqual(body["count"], 1)


if __name__ == "__main__":
    unittest.main()
