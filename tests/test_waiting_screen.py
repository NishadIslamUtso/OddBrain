"""What the owner sees while messages wait for an AI helper, and the Me screen's two fixes.

* "Waiting to be read" on Review: the kept-whole messages, why they wait, Read now, Skip.
* No helper at all is said differently from a helper that did not answer.
* Me: a to-do with a come-back date is listed once; a fact about someone else leaves "About you".
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))
sys.path.insert(0, str(PROJECT / "tests" / "browser"))

import fake_ai  # noqa: E402
from memory_ob import api, manager, me  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402
from tests.helpers import AuthedClient  # noqa: E402


def broken(prompt: str) -> str:
    raise RuntimeError("offline")


class Case(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.vault, db = self.tmp / "vault", self.tmp / "m.db"
        Settings.resolve(vault=self.vault, db=db).ensure_dirs()
        self.store = Store(db)
        api.settings = api.Settings.resolve(vault=self.vault, db=db, models_path=self.tmp / "models.json")
        self.client = AuthedClient.create(api.create_app(), self.vault)

    def tearDown(self) -> None:
        self.store.close()


class WordsForNoHelper(Case):
    def test_no_helper_at_all_is_not_called_a_bad_answer(self) -> None:
        out = manager.capture(self.store, text="My knee hurts when I run.", model_call=None, vault=self.vault)
        said = manager.describe(out)
        self.assertTrue(out.no_helper)
        self.assertIn("No AI helper is connected", said)
        self.assertNotIn("did not answer", said)

    def test_a_helper_that_fails_says_so_and_where_to_look(self) -> None:
        out = manager.capture(self.store, text="My knee hurts when I run.", model_call=broken, vault=self.vault)
        said = manager.describe(out)
        self.assertFalse(out.no_helper)
        self.assertIn("did not answer properly", said)
        self.assertIn("Waiting to be read", said)


class TheWaitingList(Case):
    def keep(self, *texts: str) -> None:
        for t in texts:
            manager.capture(self.store, text=t, model_call=broken, vault=self.vault)

    def test_nothing_waiting_is_an_empty_list(self) -> None:
        got = manager.waiting_list(self.store)
        self.assertEqual((got["count"], got["items"]), (0, []))

    def test_a_kept_message_is_listed_in_the_owners_own_words(self) -> None:
        self.keep("I am allergic to peanuts.")
        got = manager.waiting_list(self.store)
        self.assertEqual(got["count"], 1)
        self.assertEqual(got["items"][0]["preview"], "I am allergic to peanuts.")

    def test_a_long_message_is_cut_short_and_the_list_is_bounded(self) -> None:
        self.keep("I like cricket " * 40, *[f"Note number {n} about my day." for n in range(12)])
        got = manager.waiting_list(self.store, limit=8)
        self.assertEqual((got["count"], len(got["items"])), (13, 8))
        self.assertLessEqual(len(got["items"][0]["preview"]), 161)

    def test_skipping_one_stops_the_wait_and_keeps_it_in_sources(self) -> None:
        self.keep("I am allergic to peanuts.")
        cid = manager.waiting_list(self.store)["items"][0]["id"]
        self.assertEqual(manager.skip_waiting(self.store, cid)["result"], "skipped")
        self.assertEqual(manager.waiting_list(self.store)["count"], 0)
        self.assertIsNotNone(self.store.get_conversation(cid))
        self.assertEqual(self.store.list_records(), [], "nothing was made from it")
        self.assertEqual(manager.skip_waiting(self.store, cid)["result"], "gone")

    def test_reading_it_later_empties_the_list(self) -> None:
        self.keep("I am allergic to peanuts.")
        manager.process_waiting(self.store, model_call=fake_ai.fake, vault=self.vault)
        self.assertEqual(manager.waiting_list(self.store)["count"], 0)
        self.assertEqual([r.body for r in self.store.list_records(status="active")], ["I am allergic to peanuts."])


class OnTheScreen(Case):
    def test_home_says_what_waits_and_why(self) -> None:
        manager.capture(self.store, text="I am allergic to peanuts.", model_call=broken, vault=self.vault)
        w = self.client.get("/api/home").json()["waiting"]
        self.assertEqual(w["count"], 1)
        self.assertIn(w["why"], {"no_helper", "not_answering", "will_retry"})
        self.assertEqual(w["items"][0]["preview"], "I am allergic to peanuts.")

    def test_read_now_without_a_helper_says_so_and_changes_nothing(self) -> None:
        manager.capture(self.store, text="I am allergic to peanuts.", model_call=broken, vault=self.vault)
        got = self.client.post("/api/waiting/read").json()
        if not got["started"]:
            self.assertIn(got["reason"], {"no_helper", "busy"})
        self.assertEqual(self.client.get("/api/home").json()["waiting"]["count"], 1)

    def test_read_now_with_nothing_waiting(self) -> None:
        got = self.client.post("/api/waiting/read").json()
        self.assertEqual((got["started"], got["reason"]), (False, "nothing"))

    def test_skip_over_the_api(self) -> None:
        manager.capture(self.store, text="I am allergic to peanuts.", model_call=broken, vault=self.vault)
        cid = self.client.get("/api/home").json()["waiting"]["items"][0]["id"]
        got = self.client.post(f"/api/waiting/{cid}/skip").json()
        self.assertEqual((got["result"], got["waiting"]["count"]), ("skipped", 0))
        self.assertEqual(self.client.post(f"/api/waiting/{cid}/skip").json()["result"], "gone")


class TestingTheHelper(Case):
    def with_helper(self, call):
        from memory_ob import api as api_mod

        original = api_mod._helper
        api_mod._helper = lambda *a, **k: call
        self.addCleanup(setattr, api_mod, "_helper", original)

    def test_no_helper_is_said_plainly(self) -> None:
        self.with_helper(None)
        self.assertEqual(self.client.post("/api/settings/ai/test").json(), {"ok": False, "reason": "no_helper"})

    def test_a_helper_that_answers_is_ok(self) -> None:
        self.with_helper(lambda p: "<think>easy</think>OK")
        got = self.client.post("/api/settings/ai/test").json()
        self.assertEqual((got["ok"], got["said"]), (True, "OK"))

    def test_a_helper_that_fails_gives_the_reason(self) -> None:
        self.with_helper(broken)
        got = self.client.post("/api/settings/ai/test").json()
        self.assertEqual((got["ok"], got["reason"]), (False, "failed"))
        self.assertIn("offline", got["detail"])

    def test_a_blank_answer_is_not_an_answer(self) -> None:
        self.with_helper(lambda p: "  ")
        self.assertEqual(self.client.post("/api/settings/ai/test").json()["reason"], "empty")


class OnTheMeScreen(Case):
    def say(self, text: str):
        return manager.capture(self.store, text=text, vault=self.vault, model_call=fake_ai.fake)

    def sections(self) -> dict:
        return {s["key"]: s for s in me.build(self.store, vault=self.vault)["sections"]}

    def test_a_to_do_with_a_date_is_listed_once(self) -> None:
        self.say("I need to renew my passport, I will come back to it in a year")
        sections = self.sections()
        self.assertIn("todo", sections)
        self.assertNotIn("coming", sections)
        self.assertTrue(sections["todo"]["items"][0]["revisit_at"])

    def test_it_still_shows_up_on_review_when_it_is_due(self) -> None:
        self.say("I need to renew my passport, I will come back to it in a year")
        from datetime import datetime, timedelta, timezone

        later = datetime.now(timezone.utc) + timedelta(days=400)
        got = me.build(self.store, now=later, vault=self.vault)
        self.assertEqual(len(got["due"]), 1)
        self.assertEqual(self.client.get("/api/home").json()["due"], [])    # not due yet today

    def test_a_fact_about_a_known_person_is_not_under_about_you(self) -> None:
        self.say("My sister Aisha is a doctor and she lives in Sylhet.")
        self.say("I live in Dhaka.")
        life = self.sections()["life"]["items"]
        self.assertEqual([i["text"] for i in life], ["I live in Dhaka."])

    def test_a_fact_about_someone_with_no_profile_stays_visible(self) -> None:
        self.say("My neighbour is a retired teacher.")
        texts = [i["text"] for s in self.sections().values() for i in s["items"]]
        self.assertIn("My neighbour is a retired teacher.", texts)

    def test_I_live_with_a_person_is_still_about_me(self) -> None:
        self.say("My sister Aisha is a doctor.")
        self.say("I live with Aisha in Dhaka.")
        texts = [i["text"] for i in self.sections()["life"]["items"]]
        self.assertEqual(texts, ["I live with Aisha in Dhaka."])


if __name__ == "__main__":
    unittest.main()
