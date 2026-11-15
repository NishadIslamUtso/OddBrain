"""Notes by subject: how memories are filed into notes, the move from one-note-per-memory, and what stays out."""

from __future__ import annotations

import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path

from memory_ob import manager, vault
from memory_ob.records import Record
from memory_ob.store import Store
from tests.helpers import sign


class Base(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.vault = self.tmp / "vault"
        self.store = Store(self.tmp / "m.db")
        self.addCleanup(self.store.close)

    def add(self, rid: str, text: str, *, tags: list[str] | None = None, kind: str = "note",
            people: list[str] | None = None, never_send: bool = False, status: str = "active") -> Record:
        rec = sign(self.store, Record(id=rid, kind=kind, subject="self", speaker="user", trust=0.9, title=text,
                                       body=text, tags=tags or [], never_send=never_send,
                                       source={"people": people or []}))
        return rec

    def text(self, rel: str) -> str:
        return (self.vault / rel).read_text(encoding="utf-8")


class Filing(Base):
    def test_default_note_is_the_folder_note_and_a_named_note_has_its_own_file(self) -> None:
        a = self.add("a", "I am allergic to peanuts", tags=["topic/health"])
        b = self.add("b", "My doctor said to carry an epipen", tags=["topic/health", "note/Peanut allergy"])
        self.assertEqual(vault.note_target(a), ("Health", "Health"))
        self.assertEqual(vault.note_target(b), ("Health", "Peanut allergy"))
        vault.rebuild(self.store, self.vault)
        self.assertIn("allergic to peanuts", self.text("Health/Health.md"))
        self.assertNotIn("epipen", self.text("Health/Health.md"))
        self.assertIn("epipen", self.text("Health/Peanut allergy.md"))

    def test_journal_goes_in_a_note_for_its_month_and_todos_in_one_list(self) -> None:
        j = self.add("j", "Felt tired this morning", kind="journal")
        j.event_time = "2026-03-09"
        self.assertEqual(vault.note_target(j), ("Journal", "2026-03 March"))
        t = self.add("t", "Renew my passport", tags=["todo"])
        self.assertEqual(vault.note_target(t), ("Plans", "To-do"))
        d = self.add("d", "Buy milk", tags=["todo", "done"])
        vault.rebuild(self.store, self.vault)
        text = self.text("Plans/To-do.md")
        self.assertIn("## Open", text)
        self.assertIn("- [ ]", text)
        self.assertIn("## Done", text)
        self.assertIn("- [x]", text)

    def test_every_line_ends_with_its_id_and_names_link_to_people_who_have_a_note(self) -> None:
        self.add("a", "My sister Mim moved to Chittagong", tags=["topic/life"], people=["Mim"])
        self.store.upsert_person("Mim", relation="sister")
        vault.rebuild(self.store, self.vault)
        line = next(l for l in self.text("Life/Life.md").splitlines() if "Mim" in l and l.startswith("- "))
        self.assertTrue(line.endswith("^a"), line)
        self.assertIn("[[Mim]]", line)
        person = self.text("People/Mim.md")
        self.assertIn("moved to Chittagong", person)
        self.assertIn("[[Life/Life|Life]]", person)

    def test_a_name_with_no_note_is_not_a_dangling_link(self) -> None:
        self.add("a", "I owe Karim some money", tags=["topic/money"], people=["Karim"])
        vault.rebuild(self.store, self.vault)
        self.assertNotIn("[[Karim]]", self.text("Money/Money.md"))

    def test_a_project_is_one_note_with_the_whole_story_in_order(self) -> None:
        self.add("a", "I want to open a bakery", tags=["topic/projects-ideas", "project/bakery"])
        self.add("b", "The bakery budget is 8 lakh", tags=["topic/projects-ideas", "project/bakery"])
        self.add("c", "Call the landlord about the bakery", tags=["topic/projects-ideas", "project/bakery", "todo"])
        vault.rebuild(self.store, self.vault)
        files = list((self.vault / "Projects & Ideas" / "Bakery").glob("*.md"))
        self.assertEqual([f.name for f in files], ["Bakery.md"])
        text = self.text("Projects & Ideas/Bakery/Bakery.md")
        for heading in ("## Where it stands", "## To do", "## Timeline"):
            self.assertIn(heading, text)
        idx = vault._load_index(self.vault)
        self.assertEqual(idx["project:bakery"], "Projects & Ideas/Bakery/Bakery.md")

    def test_a_long_note_is_grouped_by_month(self) -> None:
        for i in range(35):
            rec = self.add(f"r{i:02d}", f"Fact number {i} about the owner", tags=["topic/life"])
        vault.rebuild(self.store, self.vault)
        self.assertIn("## 20", self.text("Life/Life.md"))

    def test_the_same_title_in_another_letter_case_is_the_same_file(self) -> None:
        self.add("a", "I like tea", tags=["topic/interests", "note/Drinks"])
        self.add("b", "I like coffee", tags=["topic/interests", "note/drinks"])
        vault.rebuild(self.store, self.vault)
        names = [p.name for p in (self.vault / "Interests").glob("*.md")]
        self.assertEqual(len(names), 1, names)

    def test_forgetting_or_making_private_takes_the_line_out_and_an_empty_note_goes(self) -> None:
        a = self.add("a", "I am allergic to peanuts", tags=["topic/health", "note/Peanut allergy"])
        self.add("b", "I train three days a week", tags=["topic/health"])
        vault.rebuild(self.store, self.vault)
        self.assertTrue((self.vault / "Health" / "Peanut allergy.md").is_file())
        manager.make_private(self.store, "a", vault=self.vault)
        self.assertFalse((self.vault / "Health" / "Peanut allergy.md").exists())
        for path in self.vault.rglob("*.md"):
            self.assertNotIn("peanuts", path.read_text(encoding="utf-8"), str(path))
        self.assertIn("train three days", self.text("Health/Health.md"))

    def test_a_project_folder_with_nothing_left_is_tidied_away(self) -> None:
        self.add("a", "I want to open a bakery", tags=["topic/projects-ideas", "project/bakery"])
        vault.rebuild(self.store, self.vault)
        self.assertTrue((self.vault / "Projects & Ideas" / "Bakery").is_dir())
        manager.make_private(self.store, "a", vault=self.vault)
        self.assertFalse((self.vault / "Projects & Ideas" / "Bakery").exists())
        self.assertNotIn("project:bakery", vault._load_index(self.vault))

    def test_chats_with_hermes_are_not_one_file_each_but_imported_chats_are_kept(self) -> None:
        manager.capture(self.store, parts=[{"role": "user", "content": "I need to renew my passport."}],
                        vault=self.vault)
        self.assertEqual(list((self.vault / "Sources" / "Conversations").glob("*.md")), [])
        manager.store_chats(self.store, [{"title": "Chat with Rina", "when": "", "origin": "whatsapp",
                                          "people": ["Rina"], "parts": [{"role": "user", "content": "Hi Rina"},
                                                                         {"role": "assistant", "name": "Rina", "content": "Hello"}]}],
                            source_name="WhatsApp", vault=self.vault)
        self.assertEqual(len(list((self.vault / "Sources" / "Conversations").glob("*.md"))), 1)

    def test_no_hub_notes_and_no_me_note(self) -> None:
        self.add("a", "I want to open a bakery", tags=["topic/projects-ideas", "project/bakery"])
        (self.vault).mkdir(parents=True, exist_ok=True)
        (self.vault / "Me.md").write_text("old", encoding="utf-8")
        vault.rebuild(self.store, self.vault)
        self.assertFalse((self.vault / "Me.md").exists())


class MovingAnOldVault(Base):
    def _old_vault(self) -> dict[str, str]:
        """A vault the way version 1 left it: one file per memory, an index, no layout marker."""
        self.add("a", "I am allergic to peanuts", tags=["topic/health"])
        self.add("b", "I train three days a week", tags=["topic/health"])
        self.vault.mkdir(parents=True, exist_ok=True)
        vault.ensure_layout(self.vault)
        (self.vault / "Health").mkdir(exist_ok=True)
        idx = {}
        for rid, name in (("a", "I am allergic to peanuts"), ("b", "I train three days a week")):
            rel = f"Health/{name}.md"
            (self.vault / rel).write_text(f"---\nid: {rid}\nkind: note\ntitle: {name}\n---\n\n{name}\n", encoding="utf-8")
            idx[rid] = rel
        (self.vault / "Me.md").write_text("old me", encoding="utf-8")
        vault._save_index(self.vault, idx)
        return idx

    def test_an_old_vault_is_backed_up_then_moved(self) -> None:
        idx = self._old_vault()
        self.assertTrue(vault.needs_subject_layout(self.vault))
        out = vault.migrate_to_subject_notes(self.store, self.vault)
        self.assertTrue(out["migrated"])
        self.assertTrue(out["backup"].startswith("before-notes-by-subject"))
        with zipfile.ZipFile(self.vault / ".brain" / "backups" / out["backup"]) as zf:
            self.assertIn("Health/I am allergic to peanuts.md", zf.namelist())     # the old files are in the backup
        for rel in idx.values():
            self.assertFalse((self.vault / rel).exists(), rel)
        self.assertFalse((self.vault / "Me.md").exists())
        text = self.text("Health/Health.md")
        self.assertIn("allergic to peanuts", text)
        self.assertIn("train three days", text)
        self.assertFalse(vault.needs_subject_layout(self.vault))
        self.assertEqual(json.loads((self.vault / ".brain" / "vault-layout.json").read_text())["layout"], 2)

    def test_moving_twice_does_nothing(self) -> None:
        self._old_vault()
        vault.migrate_to_subject_notes(self.store, self.vault)
        self.assertEqual(vault.migrate_to_subject_notes(self.store, self.vault), {"migrated": False})

    def test_your_own_notes_in_the_vault_are_never_touched(self) -> None:
        self._old_vault()
        mine = self.vault / "Health" / "My own diary.md"
        mine.write_text("written by hand", encoding="utf-8")
        vault.migrate_to_subject_notes(self.store, self.vault)
        self.assertEqual(mine.read_text(encoding="utf-8"), "written by hand")

    def test_a_new_vault_needs_no_move(self) -> None:
        self.assertFalse(vault.needs_subject_layout(self.vault))
        vault.rebuild(self.store, self.vault)
        self.assertFalse(vault.needs_subject_layout(self.vault))

    def test_start_up_moves_an_old_vault(self) -> None:
        from memory_ob import startup
        from memory_ob.api import Settings

        self._old_vault()
        self.store.close()
        settings = Settings.resolve(vault=str(self.vault), db=str(self.tmp / "m.db"), models_path=str(self.tmp / "models.json"))
        startup._done.discard(str(self.vault.resolve()))
        report = startup.prepare(settings)
        self.assertTrue(report["subject_notes"]["migrated"])
        self.assertTrue((self.vault / "Health" / "Health.md").is_file())
        self.store = Store(self.tmp / "m.db")


class ComingBack(Base):
    def test_a_vault_can_rebuild_its_memories_from_the_notes(self) -> None:
        self.add("a", "I am allergic to peanuts", tags=["topic/health", "note/Peanut allergy"], people=["Mim"])
        self.add("b", "Renew my passport", tags=["topic/plans", "todo"])
        self.add("c", "I want to open a bakery", tags=["topic/projects-ideas", "project/bakery"])
        j = self.add("j", "Felt tired", kind="journal")
        self.store.upsert_person("Mim", relation="sister")
        vault.rebuild(self.store, self.vault)
        fresh = Store(self.tmp / "fresh.db")
        self.addCleanup(fresh.close)
        self.assertEqual(vault.import_vault(self.vault, fresh), 4)
        got = {r.id: r for r in fresh.list_records()}
        self.assertEqual(got["a"].body, "I am allergic to peanuts")
        self.assertIn("note/Peanut allergy", got["a"].tags)
        self.assertEqual(got["a"].source["people"], ["Mim"])
        self.assertIn("todo", got["b"].tags)
        self.assertIn("project/bakery", got["c"].tags)
        self.assertEqual(got["j"].kind, "journal")
        self.assertEqual(vault.import_vault(self.vault, fresh), 0)             # nothing twice


if __name__ == "__main__":
    unittest.main()


class VaultScreenData(unittest.TestCase):
    """What the Vault screen is given: matching lines for a search, and links between related notes."""

    def setUp(self) -> None:
        from tests.helpers import AuthedClient
        from memory_ob import api

        self.tmp = Path(tempfile.mkdtemp())
        api.settings = api.Settings.resolve(vault=self.tmp / "v", db=self.tmp / "m.db", models_path=self.tmp / "models.json")
        self.client = AuthedClient.create(api.create_app(), self.tmp / "v")

    def tell(self, text: str) -> None:
        self.assertTrue(self.client.post("/api/tell", json={"text": text}).json()["ok"])

    def test_a_search_result_shows_the_lines_that_matched(self) -> None:
        self.tell("I plan to learn Rust next month.")
        self.tell("I study CSE at BRAC University.")
        found = self.client.get("/api/vault/notes", params={"q": "rust"}).json()["notes"]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["hits"], ["I plan to learn Rust next month."])
        self.assertNotIn("_lines", found[0])

    def test_graph_nodes_say_how_big_their_note_is(self) -> None:
        self.tell("I want to start a small online clothing business.")
        graph = self.client.get("/api/vault/graph").json()
        self.assertTrue(graph["nodes"])
        self.assertTrue(all("count" in n for n in graph["nodes"]))
