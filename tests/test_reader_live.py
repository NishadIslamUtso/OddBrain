"""The reader tells the truth about what it is doing, and one bad message cannot hold up the rest.

* Progress is per message (not per batch of five), with a total and a preview of the current one.
* A message the AI helper cannot read is set aside; the ones behind it are still read.
* Two failures in a row mean the helper is down: the run ends and nothing is touched.
* Every AI call has a time limit, is counted, and the owner can Stop.
* A long wait on one answer is reported as "stuck" so the screen can say so.
* What the AI decided about each line is listed, with the reason.
"""

from __future__ import annotations

import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))
sys.path.insert(0, str(PROJECT / "tests" / "browser"))

import fake_ai  # noqa: E402
from memory_ob import api, manager, models, notlife, reader  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402
from tests.helpers import AuthedClient  # noqa: E402


def offline(prompt: str) -> str:
    raise RuntimeError("offline")


class Case(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.vault, self.db = self.tmp / "vault", self.tmp / "m.db"
        self.settings = Settings.resolve(vault=self.vault, db=self.db, models_path=self.tmp / "models.json")
        self.settings.ensure_dirs()
        self.store = Store(self.db)
        reader._state.update(reader._fresh())
        reader._events.clear()
        self._helper, self._state = models.helper, models.helper_state

    def tearDown(self) -> None:
        models.helper, models.helper_state = self._helper, self._state
        for _ in range(100):
            if not reader.progress()["running"]:
                break
            time.sleep(0.05)
        self.store.close()

    def keep(self, *texts: str) -> None:
        for t in texts:
            manager.capture(self.store, text=t, model_call=offline, vault=self.vault)

    def use(self, call) -> None:
        models.helper = lambda cfg=None, slot_name="extract": call
        models.helper_state = lambda cfg=None, slot_name="extract": {"kind": "hermes", "ready": "yes"}

    def run_reader(self) -> dict:
        self.assertTrue(reader.kick(self.settings))
        for _ in range(400):
            if not reader.progress()["running"]:
                break
            time.sleep(0.05)
        return reader.progress()


class OneBadMessageDoesNotBlockTheRest(Case):
    def flaky(self, prompt: str) -> str:
        if "knee" in prompt:
            raise RuntimeError("model said no")
        return fake_ai.fake(prompt)

    def test_the_messages_behind_it_are_still_read(self) -> None:
        self.keep("I drink tea every morning.", "My knee hurts when I run.", "I live in Dhaka.")
        out = manager.process_waiting(self.store, model_call=self.flaky, vault=self.vault, limit=5)
        self.assertEqual((out.read, len(out.failed_ids)), (2, 1))
        self.assertEqual([c["text"] for c in self.store.unprocessed_conversations()], ["My knee hurts when I run."])

    def test_a_failed_message_is_not_asked_again_in_the_same_run(self) -> None:
        self.keep("My knee hurts when I run.", "I live in Dhaka.")
        first = manager.process_waiting(self.store, model_call=self.flaky, vault=self.vault, limit=5)
        again = manager.process_waiting(self.store, model_call=self.flaky, vault=self.vault, limit=5,
                                        skip=set(first.failed_ids))
        self.assertEqual((first.read, again.read, again.failed_ids), (1, 0, []))

    def test_two_failures_in_a_row_mean_the_helper_is_down(self) -> None:
        self.keep("I drink tea every morning.", "I live in Dhaka.", "I like cricket a lot.")
        out = manager.process_waiting(self.store, model_call=offline, vault=self.vault, limit=5)
        self.assertEqual((out.read, len(out.failed_ids)), (0, 2))
        self.assertEqual(self.store.count_unprocessed_conversations(), 3, "nothing was touched")

    def test_the_reason_is_kept_for_the_screen(self) -> None:
        self.keep("My knee hurts when I run.")
        seen: list[tuple[str, dict]] = []
        manager.process_waiting(self.store, model_call=self.flaky, vault=self.vault,
                                on_event=lambda k, d: seen.append((k, d)))
        failed = [d for k, d in seen if k == "failed"]
        self.assertEqual(len(failed), 1)
        self.assertIn("model said no", failed[0]["why"])


class WhatItDecided(Case):
    def test_each_line_says_what_happened_and_why(self) -> None:
        self.keep("My knee hurts when I run. My sister Riya is a doctor.")
        seen: list[tuple[str, dict]] = []
        manager.process_waiting(self.store, model_call=fake_ai.fake, vault=self.vault,
                                on_event=lambda k, d: seen.append((k, d)))
        kinds = [k for k, _ in seen]
        self.assertEqual(kinds[0], "start")
        self.assertEqual(kinds[-1], "done")
        kept = {d["text"]: d for k, d in seen if k == "decision" and d["decision"] == "kept"}
        self.assertIn("about you", kept["My knee hurts when I run."]["why"])
        self.assertIn("about someone else", kept["My sister Riya is a doctor."]["why"])
        self.assertTrue(kept["My knee hurts when I run."]["record_id"], "so a screen can offer to undo it")
        done = [d for k, d in seen if k == "done"][0]
        self.assertEqual(done["saved"], 2)

    def test_a_line_the_junk_filter_dropped_is_listed_with_its_reason(self) -> None:
        with notlife.collecting() as dropped:
            notlife.is_not_life("INFO: Application startup complete.")
            notlife.is_not_life("I live in Dhaka.")
        self.assertEqual(dropped, [("INFO: Application startup complete.", "server log")])

    def test_the_filter_listens_only_inside_the_block(self) -> None:
        with notlife.collecting() as dropped:
            pass
        notlife.is_not_life("INFO: Application startup complete.")
        self.assertEqual(dropped, [])


class TheLiveProgress(Case):
    def test_progress_moves_per_message_with_a_total(self) -> None:
        self.keep(*[f"Note number {n} about my day and my plans." for n in range(7)])
        steps: list[int] = []

        def slowish(prompt: str) -> str:
            steps.append(reader.progress()["read"])
            time.sleep(0.03)
            return fake_ai.fake(prompt)

        self.use(slowish)
        p = self.run_reader()
        self.assertEqual((p["read"], p["total"], p["left"], p["error"]), (7, 7, 0, ""))
        self.assertEqual(sorted(set(steps)), list(range(7)), "the count went up one message at a time, not five at a time")

    def test_a_bad_message_is_counted_and_explained_at_the_end(self) -> None:
        self.keep("I live in Dhaka.", "My knee hurts when I run.", "I drink tea every morning.")

        def flaky(prompt: str) -> str:
            if "knee" in prompt:
                raise RuntimeError("context too long")
            return fake_ai.fake(prompt)

        self.use(flaky)
        p = self.run_reader()
        self.assertEqual((p["read"], p["failed"], p["left"]), (2, 1, 1))
        self.assertIn("could not read 1", p["error"])
        self.assertIn("context too long", p["detail"])

    def test_the_helper_never_answering_is_said_plainly(self) -> None:
        self.keep("I live in Dhaka.", "I drink tea every morning.")
        self.use(offline)
        p = self.run_reader()
        self.assertEqual((p["read"], p["left"]), (0, 2))
        self.assertIn("did not answer", p["error"])

    def test_a_long_wait_on_one_answer_is_reported_as_stuck(self) -> None:
        reader._state.update(running=True, asking_since=time.time() - (reader.STUCK_AFTER + 5))
        p = reader.progress()
        self.assertTrue(p["stuck"])
        self.assertGreaterEqual(p["asking_for"], reader.STUCK_AFTER)
        reader._state.update(running=False, asking_since=0.0)

    def test_a_short_wait_is_not_stuck(self) -> None:
        reader._state.update(running=True, asking_since=time.time() - 3)
        self.assertFalse(reader.progress()["stuck"])
        reader._state.update(running=False, asking_since=0.0)

    def test_the_private_clock_fields_are_not_sent_to_the_screen(self) -> None:
        p = reader.progress()
        for key in ("asking_since", "last_answer", "started"):
            self.assertNotIn(key, p)


class EveryCallIsWatched(Case):
    def test_calls_are_counted_and_the_last_answer_time_is_known(self) -> None:
        call = reader.watched(lambda prompt: "fine")
        self.assertEqual(call("hi"), "fine")
        self.assertEqual(call("hi"), "fine")
        p = reader.progress()
        self.assertEqual(p["calls"], 2)
        self.assertLessEqual(p["last_answer_ago"], 2)

    def test_a_call_that_never_returns_is_given_up(self) -> None:
        original = reader.CALL_LIMIT
        reader.CALL_LIMIT = 0.2
        self.addCleanup(setattr, reader, "CALL_LIMIT", original)
        release = threading.Event()
        self.addCleanup(release.set)
        call = reader.watched(lambda prompt: release.wait(30) and "late")
        started = time.time()
        with self.assertRaises(TimeoutError):
            call("hi")
        self.assertLess(time.time() - started, 3)
        self.assertEqual(reader.progress()["asking_for"], 0, "it is no longer waiting on that call")

    def test_an_error_from_the_helper_comes_through_unchanged(self) -> None:
        call = reader.watched(offline)
        with self.assertRaises(RuntimeError):
            call("hi")

    def test_after_stop_no_new_call_is_made(self) -> None:
        reader._state["stopping"] = True
        made = []
        call = reader.watched(lambda prompt: made.append(prompt) or "x")
        with self.assertRaises(reader.Stopped):
            call("hi")
        self.assertEqual(made, [])
        reader._state["stopping"] = False


class Stopping(Case):
    def test_stop_with_nothing_running_says_so(self) -> None:
        self.assertFalse(reader.stop())

    def test_stop_between_messages_reads_nothing_more_and_fails_nothing(self) -> None:
        self.keep("I live in Dhaka.", "I drink tea every morning.")
        out = manager.process_waiting(self.store, model_call=fake_ai.fake, vault=self.vault,
                                      should_stop=lambda: True)
        self.assertEqual((out.read, out.failed_ids), (0, []))
        self.assertEqual(self.store.count_unprocessed_conversations(), 2)

    def test_stopping_a_real_run_leaves_the_rest_waiting_and_says_stopped(self) -> None:
        self.keep(*[f"Note number {n} about my day and my plans." for n in range(6)])
        started = threading.Event()

        def slow(prompt: str) -> str:
            started.set()
            time.sleep(0.15)
            return fake_ai.fake(prompt)

        self.use(slow)
        self.assertTrue(reader.kick(self.settings))
        self.assertTrue(started.wait(5))
        self.assertTrue(reader.stop())
        for _ in range(100):
            if not reader.progress()["running"]:
                break
            time.sleep(0.05)
        p = reader.progress()
        self.assertTrue(p["stopped"])
        self.assertEqual(p["error"], "", "a stop is not an error")
        self.assertGreater(self.store.count_unprocessed_conversations(), 0)
        self.assertLess(self.store.count_unprocessed_conversations(), 6 + 1)


class OnTheScreen(Case):
    def setUp(self) -> None:
        super().setUp()
        api.settings = api.Settings.resolve(vault=self.vault, db=self.db, models_path=self.tmp / "models.json")
        self.client = AuthedClient.create(api.create_app(), self.vault)

    def test_stop_over_the_api_when_idle(self) -> None:
        got = self.client.post("/api/waiting/stop").json()
        self.assertFalse(got["stopping"])

    def test_after_a_stop_the_card_says_stopped_not_will_retry(self) -> None:
        self.keep("I live in Dhaka.")
        self.use(fake_ai.fake)
        reader._state.update(stopped=True, running=False)
        self.assertEqual(self.client.get("/api/home").json()["waiting"]["why"], "stopped")

    def test_status_carries_the_live_numbers(self) -> None:
        r = self.client.get("/api/status").json()["reading"]
        for key in ("running", "read", "total", "left", "current", "calls", "asking_for", "stuck", "events", "stopping"):
            self.assertIn(key, r)


if __name__ == "__main__":
    unittest.main()
