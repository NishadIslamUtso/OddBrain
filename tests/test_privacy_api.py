"""Keep private, to-do and delete-person, through the real HTTP API."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.test_screens import ScreenCase  # noqa: E402


class PrivateThroughTheApi(ScreenCase):
    def setUp(self) -> None:
        super().setUp()
        self.tell("I need to renew my passport.")
        self.tell("I live in Dhaka.")
        recs = self.client.get("/api/records").json()
        rows = recs["records"] if isinstance(recs, dict) else recs
        self.rid = next(r["id"] for r in rows if "passport" in r["body"])

    def everything_visible(self) -> str:
        """All the text the screens can show."""
        parts = []
        for path in ("/api/records", "/api/conversations", "/api/me", "/api/home", "/api/vault/notes",
                     "/api/people", "/api/journal"):
            r = self.client.get(path)
            if r.status_code == 200:
                parts.append(r.text)
        for conv in self.client.get("/api/conversations").json()["conversations"]:
            parts.append(self.client.get(f"/api/conversations/{conv['id']}").text)
        for note in self.notes():
            r = self.client.get("/api/vault/note", params={"path": note["path"]})
            if r.status_code == 200:
                parts.append(r.text)
        return "\n".join(parts).lower()

    def test_a_private_memory_and_its_sentence_vanish_from_every_screen(self) -> None:
        self.assertIn("passport", self.everything_visible())
        r = self.client.post(f"/api/records/{self.rid}/private")
        self.assertEqual(r.status_code, 200, r.text)
        seen = self.everything_visible()
        self.assertNotIn("passport", seen)
        self.assertIn("dhaka", seen)                                # the rest is untouched

    def test_settings_lists_ids_only_and_bring_back_restores(self) -> None:
        self.client.post(f"/api/records/{self.rid}/private")
        listing = self.client.get("/api/neversend")
        self.assertEqual(listing.json(), {"ids": [self.rid]})
        self.assertNotIn("passport", listing.text.lower())
        self.assertEqual(self.client.post(f"/api/neversend/{self.rid}").status_code, 200)
        self.assertEqual(self.client.get("/api/neversend").json(), {"ids": []})
        self.assertIn("passport", self.everything_visible())

    def test_a_todo_can_be_ticked_off_and_back(self) -> None:
        self.assertEqual(self.client.post(f"/api/records/{self.rid}/done", json={"done": True}).status_code, 200)
        sections = {s["key"]: s for s in self.client.get("/api/me").json()["sections"]}
        self.assertNotIn("todo", sections)                           # nothing left to do
        self.assertTrue(sections["earlier"]["items"][0]["done"])     # kept, as done
        self.assertEqual(self.client.post(f"/api/records/{self.rid}/done", json={"done": False}).status_code, 200)
        sections = {s["key"]: s for s in self.client.get("/api/me").json()["sections"]}
        self.assertEqual(sections["todo"]["items"][0]["text"], "I need to renew my passport.")


if __name__ == "__main__":
    unittest.main()
