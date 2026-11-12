"""The Vault, People, Journal and Me screens, through the real HTTP API."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class ScreenCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = os.path.join(self.tmp, "vault")
        self.db = os.path.join(self.tmp, "mob.db")
        from memory_ob import api

        self._prev = api.settings
        api.configure(api.Settings.resolve(
            vault=self.vault, db=self.db, models_path=os.path.join(self.tmp, "models.json")))
        from tests.helpers import AuthedClient

        self.client = AuthedClient.create(api.create_app(), self.vault)

    def tearDown(self) -> None:
        from memory_ob import api

        api.configure(self._prev)

    def tell(self, text: str) -> dict:
        r = self.client.post("/api/tell", json={"text": text})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def notes(self, q: str = "") -> list[dict]:
        return self.client.get("/api/vault/notes", params={"q": q}).json()["notes"]


class Vault(ScreenCase):
    def setUp(self) -> None:
        super().setUp()
        self.tell("I have a peanut allergy")
        self.tell("I want to start a bakery business next year")
        self.tell("I train three days a week at the gym")

    def test_notes_are_sorted_into_obsidian_style_folders_and_nested_tags(self) -> None:
        data = self.client.get("/api/vault/notes").json()
        folders = {f["path"]: f["count"] for f in data["folders"]}
        self.assertEqual(folders["Health"], 2)          # the allergy and the gym
        tags = {t["tag"] for t in data["tags"]}
        self.assertTrue(any(t.startswith("topic/") for t in tags), tags)
        self.assertIn("topic", tags)            # a parent tag counts its children, like Obsidian
        self.assertIn("Health", data["categories"])

    def test_filters_work_like_obsidian(self) -> None:
        # the memory itself plus the conversation it came from
        self.assertEqual(len(self.notes("peanut")), 2)
        self.assertEqual(len(self.notes("peanut type:memory")), 1)
        self.assertEqual(len(self.notes("path:Health")), 2)
        self.assertEqual(len(self.notes("tag:#topic/health")), 2)
        self.assertEqual(len(self.notes("tag:#topic type:memory")), 3)
        self.assertEqual(len(self.notes("path:Health -peanut")), 1)
        self.assertEqual(len(self.notes('"peanut allergy" type:memory')), 1)
        self.assertEqual(self.notes("by:you type:memory"), [])       # the AI filed these
        self.assertEqual(len(self.notes("by:ai type:memory")), 3)
        self.assertEqual(len(self.notes("type:source")), 3)
        self.assertEqual(self.notes("zebra"), [])

    def test_a_note_opens_with_its_words_and_can_be_edited(self) -> None:
        note = self.notes("peanut type:memory")[0]
        got = self.client.get("/api/vault/note", params={"path": note["path"]}).json()
        self.assertIn("peanut allergy", got["body"])
        self.assertTrue(got["editable"])

        saved = self.client.put("/api/vault/note", json={"path": note["path"], "body": "I have a severe peanut allergy"})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertIn("severe", saved.json()["body"])

    def test_the_category_can_be_changed_and_the_note_moves_folder(self) -> None:
        note = self.notes("bakery type:memory")[0]
        r = self.client.put("/api/vault/note", json={"path": note["path"], "category": "Interests"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["path"].startswith("Interests/"))
        self.assertFalse((Path(self.vault) / note["path"]).exists())

    def test_bad_edits_are_refused_plainly(self) -> None:
        path = self.notes("peanut type:memory")[0]["path"]
        self.assertEqual(self.client.put("/api/vault/note", json={"path": path, "body": "  "}).status_code, 400)
        self.assertEqual(self.client.put("/api/vault/note", json={"path": path, "category": "Nonsense"}).status_code, 400)
        self.assertEqual(self.client.get("/api/vault/note", params={"path": "Health/nope.md"}).status_code, 404)

    def test_a_note_cannot_escape_the_vault(self) -> None:
        for path in ("../secret.md", "../../etc/passwd", "/etc/passwd", "Health/../../x.md"):
            r = self.client.get("/api/vault/note", params={"path": path})
            self.assertEqual(r.status_code, 404, path)

    def test_the_automatic_notes_cannot_be_edited_by_hand(self) -> None:
        r = self.client.put("/api/vault/note", json={"path": "Me.md", "body": "x"})
        self.assertIn(r.status_code, (400, 404))

    def test_the_graph_has_nodes_and_honours_filters(self) -> None:
        g = self.client.get("/api/vault/graph").json()
        self.assertEqual(len([n for n in g["nodes"] if n["type"] == "memory"]), 3)
        tagged = self.client.get("/api/vault/graph", params={"tags": "true"}).json()
        self.assertTrue(any(n["type"] == "tag" for n in tagged["nodes"]))
        only = self.client.get("/api/vault/graph", params={"q": "path:Health type:memory"}).json()
        self.assertEqual(len(only["nodes"]), 2)
        no_sources = self.client.get("/api/vault/graph", params={"sources": "false"}).json()
        self.assertEqual({n["type"] for n in no_sources["nodes"]}, {"memory"})

    def test_a_person_in_a_memory_is_linked_in_the_graph(self) -> None:
        self.tell("My sister Riya is a doctor")
        g = self.client.get("/api/vault/graph").json()
        self.assertTrue(any(n["type"] == "person" and "Riya" in n["label"] for n in g["nodes"]))
        self.assertTrue(g["edges"])

    def test_the_vault_is_real_obsidian_files(self) -> None:
        root = Path(self.vault)
        self.assertTrue((root / ".obsidian").is_dir())
        health = [p for p in (root / "Health").glob("*.md") if "peanut" in p.read_text(encoding="utf-8")]
        self.assertEqual(len(health), 1)
        text = health[0].read_text(encoding="utf-8")
        self.assertTrue(text.startswith("---\n"))
        self.assertIn("tags: [", text)


class People(ScreenCase):
    def test_someone_you_mention_gets_a_profile(self) -> None:
        self.tell("My sister Riya is a doctor in Sylhet")
        people = self.client.get("/api/people").json()["people"]
        self.assertEqual([p["name"] for p in people], ["Riya"])
        detail = self.client.get(f"/api/people/{people[0]['id']}").json()
        self.assertTrue(any("doctor" in m["text"] for m in detail["memory_list"]))

    def test_you_can_add_edit_and_remove_a_person(self) -> None:
        r = self.client.post("/api/people", json={"name": "Karim", "relation": "friend", "notes": "met at uni"})
        self.assertEqual(r.status_code, 200, r.text)
        pid = r.json()["id"]
        edited = self.client.put(f"/api/people/{pid}", json={"notes": "met at university", "aliases": ["Karim bhai"]})
        self.assertEqual(edited.status_code, 200, edited.text)
        got = self.client.get(f"/api/people/{pid}").json()
        self.assertEqual(got["notes"], "met at university")
        self.assertIn("Karim bhai", got["aliases"])
        self.assertEqual(self.client.delete(f"/api/people/{pid}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/people/{pid}").status_code, 404)

    def test_a_person_needs_a_name(self) -> None:
        self.assertEqual(self.client.post("/api/people", json={"name": "  "}).status_code, 400)
        pid = self.client.post("/api/people", json={"name": "Karim"}).json()["id"]
        self.assertEqual(self.client.put(f"/api/people/{pid}", json={"name": ""}).status_code, 400)

    def test_these_two_are_the_same_person(self) -> None:
        a = self.client.post("/api/people", json={"name": "Riya", "notes": "from WhatsApp"}).json()["id"]
        b = self.client.post("/api/people", json={"name": "Riya Rahman", "notes": "from ChatGPT"}).json()["id"]
        r = self.client.post("/api/people/merge", json={"keep_id": a, "other_id": b})
        self.assertEqual(r.status_code, 200, r.text)
        people = self.client.get("/api/people").json()["people"]
        self.assertEqual(len(people), 1)
        merged = self.client.get(f"/api/people/{a}").json()
        self.assertIn("Riya Rahman", merged["aliases"])
        self.assertIn("from WhatsApp", merged["notes"])
        self.assertIn("from ChatGPT", merged["notes"])

    def test_bad_merges_are_refused(self) -> None:
        a = self.client.post("/api/people", json={"name": "Riya"}).json()["id"]
        self.assertEqual(self.client.post("/api/people/merge", json={"keep_id": a, "other_id": a}).status_code, 400)
        self.assertEqual(self.client.post("/api/people/merge", json={"keep_id": a, "other_id": "x"}).status_code, 404)

    def test_the_profile_links_to_the_raw_conversations_from_every_platform(self) -> None:
        from memory_ob import manager
        from memory_ob.store import Store

        st = Store(self.db)
        chats = [
            {"title": "WhatsApp: Riya", "origin": "whatsapp", "people": ["Riya"],
             "parts": [{"role": "user", "content": "hi"}, {"role": "assistant", "name": "Riya", "content": "hello"}]},
            {"title": "Plans", "origin": "messenger", "people": ["Riya"],
             "parts": [{"role": "user", "content": "see you"}, {"role": "assistant", "name": "Riya", "content": "ok"}]},
        ]
        manager.store_chats(st, chats, source_name="mixed", vault=Path(self.vault))
        st.close()
        riya = next(p for p in self.client.get("/api/people").json()["people"] if p["name"] == "Riya")
        detail = self.client.get(f"/api/people/{riya['id']}").json()
        self.assertEqual(len(detail["conversation_list"]), 2)
        platforms = {c["platform"] for c in detail["conversation_list"]}
        self.assertEqual(platforms, {"WhatsApp", "Messenger"})
        raw = self.client.get(f"/api/conversations/{detail['conversation_list'][0]['id']}").json()
        self.assertTrue(raw["text"])

    def test_the_writes_need_the_key(self) -> None:
        self.assertEqual(self.client._client.post("/api/people", json={"name": "X"}).status_code, 401)


class Journal(ScreenCase):
    def test_a_dated_entry_keeps_its_own_date(self) -> None:
        r = self.client.post("/api/journal/entry", json={"text": "Started my first job", "day": "2024-03-01"})
        self.assertEqual(r.status_code, 200, r.text)
        entries = self.client.get("/api/journal").json()["entries"]
        self.assertEqual((entries[0]["day"], entries[0]["by"]), ("2024-03-01", "you"))

    def test_bad_entries_are_refused(self) -> None:
        self.assertEqual(self.client.post("/api/journal/entry", json={"text": " "}).status_code, 400)
        bad = self.client.post("/api/journal/entry", json={"text": "x y z w", "day": "March 1"})
        self.assertEqual(bad.status_code, 400)

    def test_the_biography_is_written_from_what_is_known(self) -> None:
        self.tell("I study computer science at BRAC University")
        self.tell("I have a peanut allergy")
        r = self.client.post("/api/journal/biography", json={"action": "rewrite"})
        self.assertEqual(r.status_code, 200, r.text)
        bio = r.json()
        self.assertIn("computer science", bio["text"])
        self.assertFalse(bio["locked"])
        # health stays out unless the owner allows it
        self.assertNotIn("peanut", bio["text"])
        self.client.post("/api/settings", json={"bio_sensitive": True})
        again = self.client.post("/api/journal/biography", json={"action": "rewrite"}).json()
        self.assertIn("peanut", again["text"])

    def test_your_own_wording_is_locked_against_ai_rewrites_until_you_unlock(self) -> None:
        self.tell("I study computer science at BRAC University")
        self.client.post("/api/journal/biography", json={"action": "rewrite"})
        saved = self.client.post("/api/journal/biography", json={"action": "save", "text": "My own words."}).json()
        self.assertTrue(saved["locked"])
        self.tell("I play chess every weekend")
        self.client.post("/api/tidy")                       # the nightly run must not overwrite it
        self.assertEqual(self.client.get("/api/journal").json()["biography"]["text"], "My own words.")
        unlocked = self.client.post("/api/journal/biography", json={"action": "unlock"}).json()
        self.assertFalse(unlocked["locked"])

    def test_an_empty_biography_or_unknown_action_is_refused(self) -> None:
        self.assertEqual(self.client.post("/api/journal/biography", json={"action": "save", "text": " "}).status_code, 400)
        self.assertEqual(self.client.post("/api/journal/biography", json={"action": "explode"}).status_code, 400)

    def test_the_biography_note_is_in_the_vault(self) -> None:
        self.tell("I study computer science at BRAC University")
        self.client.post("/api/journal/biography", json={"action": "rewrite"})
        note = Path(self.vault) / "Journal" / "Biography.md"
        self.assertIn("computer science", note.read_text(encoding="utf-8"))


class Me(ScreenCase):
    def test_what_is_current_is_separated_from_the_rest(self) -> None:
        self.tell("I am planning to start a bakery business")
        self.tell("I study computer science at BRAC University")
        self.tell("I have a peanut allergy")
        data = self.client.get("/api/me").json()
        sections = {s["key"]: s for s in data["sections"]}
        self.assertIn("now", sections)
        self.assertIn("work", sections)
        self.assertTrue(sections["health"]["sensitive"])
        self.assertTrue(any("bakery" in i["text"] for i in sections["now"]["items"]))

    def test_things_to_come_back_to_are_listed_with_their_date(self) -> None:
        self.tell("I want to start a bakery business, I will come back to it in a year")
        coming = [s for s in self.client.get("/api/me").json()["sections"] if s["key"] == "coming"]
        self.assertEqual(len(coming), 1)
        self.assertTrue(coming[0]["items"][0]["revisit_at"])

    def test_an_empty_page_is_empty_not_broken(self) -> None:
        self.assertEqual(self.client.get("/api/me").json(), {"sections": [], "total": 0})

    def test_me_md_is_written_into_the_vault(self) -> None:
        self.tell("I study computer science at BRAC University")
        self.client.post("/api/tidy")
        self.assertIn("computer science", (Path(self.vault) / "Me.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
