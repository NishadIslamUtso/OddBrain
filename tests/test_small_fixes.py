"""Small safety fixes: what counts as "on this computer", private memories' numbers, zip bombs."""

from __future__ import annotations

import io
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from memory_ob import importers, manager, models
from memory_ob.models import ModelSlot
from memory_ob.store import Store


class TestOnThisComputer(unittest.TestCase):
    def local(self, address: str) -> bool:
        return ModelSlot(provider="openai", model="m", base_url=address).is_local

    def test_real_local_addresses(self) -> None:
        for address in ("http://localhost:11434", "http://127.0.0.1:8080/v1", "http://[::1]:8080", "localhost:8080",
                        "http://llama.localhost:9000"):
            self.assertTrue(self.local(address), address)

    def test_look_alikes_are_not_local(self) -> None:
        for address in ("https://localhost.example.com/v1", "https://example.com/?127.0.0.1",
                        "https://127.0.0.1.evil.net", "https://api.openai.com/v1", "https://example.com/localhost"):
            self.assertFalse(self.local(address), address)

    def test_local_only_does_not_let_a_look_alike_through(self) -> None:
        slot = ModelSlot(provider="openai", model="m", base_url="https://localhost.example.com/v1")
        with mock.patch.object(models, "_server_up", return_value=True) as up:
            self.assertFalse(models.is_available(slot))
        up.assert_not_called()


class TestPrivateNumbers(unittest.TestCase):
    def test_a_private_memory_loses_its_meaning_search_numbers(self) -> None:
        tmp = Path(tempfile.mkdtemp())
        for key in ("MEMORY_OB_VAULT", "MEMORY_OB_DB", "MEMORY_OB_TOKEN", "MEMORY_OB_MODELS"):
            os.environ.pop(key, None)
        store = Store(tmp / "m.db")
        self.addCleanup(store.close)
        manager.capture(store, parts=[{"role": "user", "content": "I need to renew my passport."}], vault=tmp / "V")
        rid = next(r.id for r in store.list_records() if "passport" in r.body)
        store.set_embedding(rid, [0.1, 0.2, 0.3], model="m")
        self.assertIsNotNone(store.get_embedding(rid))
        manager.make_private(store, rid, vault=tmp / "V")
        self.assertIsNone(store.get_embedding(rid))
        manager.bring_back(store, rid, vault=tmp / "V")
        self.assertIn(rid, store.missing_embeddings(model="m"))      # it will be prepared again


class TestZipSize(unittest.TestCase):
    def test_a_zip_that_unpacks_to_far_too_much_is_refused(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("conversations.json", "[]")
        data = buf.getvalue()
        with mock.patch.object(importers, "MAX_UNZIPPED_BYTES", 1):
            with self.assertRaises(importers.ImportError_) as caught:
                importers.parse("export.zip", data)
        self.assertIn("too large", str(caught.exception))

    def test_a_normal_zip_still_opens(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("conversations.json", "[]")
        try:
            importers.parse("export.zip", buf.getvalue())
        except importers.ImportError_ as exc:
            self.assertNotIn("too large", str(exc))


if __name__ == "__main__":
    unittest.main()
