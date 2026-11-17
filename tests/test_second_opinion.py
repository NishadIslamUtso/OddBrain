"""The AI helper's second opinion: on conflicts found while saving, and in the check-up.

It may drop a false alarm, put a finding in the right box, or notice a paraphrase the word rules
missed. It never changes a memory, a firm rule answer is never overruled, and when the helper is
missing or answers badly the rules' answer stands.
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob import audit, conflicts, doubts, manager, topics  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402
from tests.test_audit import Case as AuditCase  # noqa: E402


def rec(text: str):
    return SimpleNamespace(title=text, body=text, id=text)


def says(*words: str):
    """A stand-in helper answering the numbered items in order, and counting its calls."""
    calls: list[str] = []

    def judge(prompt: str) -> str:
        calls.append(prompt)
        return json.dumps({str(i): w for i, w in enumerate(words, 1)})

    judge.calls = calls  # type: ignore[attr-defined]
    return judge


class WhileSaving(unittest.TestCase):
    def test_a_guess_from_the_words_is_put_to_the_helper_and_it_can_be_a_false_alarm(self) -> None:
        judge = says("unrelated")
        self.assertIsNone(conflicts.decide("I weigh 68 kg", [rec("I weigh 72 kg")], judge))
        self.assertEqual(len(judge.calls), 1)

    def test_the_helper_agreeing_with_the_rules_is_said_so(self) -> None:
        found = conflicts.decide("I weigh 68 kg", [rec("I weigh 72 kg")], says("update"))
        self.assertEqual((found[0], found[2]), (conflicts.CONFLICT, "both"))

    def test_without_a_helper_the_rules_decide_and_say_so(self) -> None:
        found = conflicts.decide("I weigh 68 kg", [rec("I weigh 72 kg")])
        self.assertEqual((found[0], found[2]), (conflicts.CONFLICT, "rules"))

    def test_a_firm_rule_answer_is_final_and_the_helper_is_not_even_asked(self) -> None:
        judge = says("unrelated")
        found = conflicts.decide("I live in Sylhet now", [rec("I live in Dhaka")], judge)
        self.assertEqual((found[0], found[2]), (conflicts.CONFLICT, "rules"))
        self.assertEqual(judge.calls, [])

    def test_a_helper_that_fails_or_rambles_leaves_the_rules_answer_standing(self) -> None:
        def broken(prompt: str) -> str:
            raise RuntimeError("down")

        for judge in (broken, lambda p: "I am not sure what you mean", lambda p: '{"1": "banana"}'):
            found = conflicts.decide("I weigh 68 kg", [rec("I weigh 72 kg")], judge)
            self.assertEqual((found[0], found[2]), (conflicts.CONFLICT, "rules"))

    def test_a_paraphrase_the_words_miss_is_found_by_the_helper(self) -> None:
        found = conflicts.decide("My weight is 72 kg", [rec("I weigh 68 kg")], says("update"))
        self.assertEqual((found[0], found[2]), (conflicts.CONFLICT, "ai"))
        self.assertIsNone(conflicts.decide("My weight is 72 kg", [rec("I weigh 68 kg")]))

    def test_find_keeps_its_old_shape(self) -> None:
        self.assertEqual(conflicts.find("I live in Sylhet now", [rec("I live in Dhaka")])[0], conflicts.CONFLICT)


class AskedWhileSaving(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.vault, self.db = self.tmp / "vault", self.tmp / "m.db"
        Settings.resolve(vault=self.vault, db=self.db).ensure_dirs()
        self.store = Store(self.db)

    def tearDown(self) -> None:
        self.store.close()

    def helper(self, verdict: str):
        def call(prompt: str) -> str:
            if "NEW:" in prompt:
                return json.dumps({"1": verdict, "2": verdict, "3": verdict})
            claim = prompt.split("Message")[-1] if "Message" in prompt else ""
            return json.dumps({"claims": [{"text": "I weigh 68 kg.", "kind": "profile"}]})

        return call

    def test_the_question_says_who_noticed(self) -> None:
        manager.capture(self.store, text="I weigh 72 kg", vault=self.vault)
        manager.capture(self.store, text="I weigh 68 kg", vault=self.vault)
        card = next(d for d in doubts.list_doubts(self.store) if d["kind"] == "changed")
        self.assertEqual(card["found_by"], "rules")

    def test_a_false_alarm_is_not_asked_when_the_helper_says_unrelated(self) -> None:
        manager.capture(self.store, text="I weigh 72 kg", vault=self.vault)
        out = manager.capture(self.store, text="I weigh 68 kg", vault=self.vault, model_call=self.helper("unrelated"))
        self.assertEqual(out.asked, 0)
        self.assertEqual([d for d in doubts.list_doubts(self.store) if d["kind"] == "changed"], [])


class InTheCheckUp(AuditCase):
    def test_a_false_alarm_is_set_aside_and_not_asked_again(self) -> None:
        self.say("I weigh 72 kg", age=30)
        self.say("I weigh 68 kg", age=1)
        self.assertEqual(self.kinds(self.run_audit()), ["disagree"])           # the rules alone
        judge = says("unrelated")
        report = self.run_audit(judge=judge)
        self.assertEqual(report["findings"], [])
        self.assertEqual((report["ai"]["dropped"], report["ai"]["looked"]), (1, 1))
        self.run_audit(judge=judge)
        self.assertEqual(len(judge.calls), 1, "the same pair, with the same words, is not asked twice")

    def test_a_finding_the_helper_agrees_with_says_both_found_it(self) -> None:
        self.say("I weigh 72 kg", age=30)
        self.say("I weigh 68 kg", age=1)
        report = self.run_audit(judge=says("update"))
        self.assertEqual([(f["kind"], f["found_by"]) for f in report["findings"]], [("disagree", "both")])

    def test_rules_only_findings_say_rules(self) -> None:
        self.say("I weigh 72 kg", age=30)
        self.say("I weigh 68 kg", age=1)
        report = self.run_audit()
        self.assertEqual([f["found_by"] for f in report["findings"]], ["rules"])
        self.assertFalse(report["ai"]["used"])

    def test_a_disagreement_that_is_really_the_same_thing_moves_to_the_right_box(self) -> None:
        self.say("I weigh 72 kg", age=20)
        self.say("I weigh 68 kg", age=1)
        self.assertEqual(self.kinds(self.run_audit()), ["disagree"])
        report = self.run_audit(judge=says("same"))
        self.assertEqual([(f["kind"], f["found_by"]) for f in report["findings"]], [("twice", "both")])

    def test_a_paraphrase_the_words_missed_is_listed_as_noticed_by_the_helper(self) -> None:
        self.say("I work as a software engineer", age=30)
        self.say("My job is software engineer at a startup", age=1)
        self.assertEqual(self.run_audit()["findings"], [])
        report = self.run_audit(judge=says("same"))
        self.assertEqual([(f["kind"], f["found_by"]) for f in report["findings"]], [("twice", "ai")])
        self.assertEqual(report["ai"]["added"], 1)
        f = report["findings"][0]
        self.assertEqual([a["key"] for a in f["actions"]], ["join", "keep_both"])

    def test_the_helper_only_changes_the_list_never_a_memory(self) -> None:
        self.say("I work as a software engineer", age=30)
        self.say("My job is software engineer at a startup", age=1)
        before = sorted(r.id + r.body for r in self.store.list_records(status="active"))
        self.run_audit(judge=says("same"))
        self.assertEqual(before, sorted(r.id + r.body for r in self.store.list_records(status="active")))

    def test_a_helper_that_fails_changes_nothing(self) -> None:
        self.say("I weigh 72 kg", age=30)
        self.say("I weigh 68 kg", age=1)

        def broken(prompt: str) -> str:
            raise RuntimeError("down")

        report = self.run_audit(judge=broken)
        self.assertEqual([(f["kind"], f["found_by"]) for f in report["findings"]], [("disagree", "rules")])
        self.assertFalse(report["ai"]["used"])

    def test_a_private_memory_is_never_shown_to_the_helper(self) -> None:
        self.say("I work as a software engineer", age=30)
        secret = self.say("My job is software engineer at a secret startup", age=1)
        self.store.set_never_send(secret.id, value=True)
        judge = says("same")
        report = self.run_audit(judge=judge)
        self.assertEqual(report["findings"], [])
        self.assertEqual(judge.calls, [])
        self.assertNotIn("secret", json.dumps(report))

    def test_the_helper_is_asked_about_a_bounded_number_of_pairs(self) -> None:
        for n in range(25):
            self.say(f"I keep notebook number {n} on my desk", age=30)         # 300 pairs for the rules to flag
        calls = says(*["unrelated"] * audit.AI_BATCH)
        self.run_audit(judge=calls)
        self.assertTrue(calls.calls)
        self.assertLessEqual(len(calls.calls), (audit.AI_ASK_AT_MOST + audit.AI_PAIRS_PER_RUN) // audit.AI_BATCH)

    def test_an_answer_found_by_the_helper_can_be_acted_on_like_any_other(self) -> None:
        self.say("I work as a software engineer", age=30)
        self.say("My job is software engineer at a startup", age=1)
        report = self.run_audit(judge=says("same"))
        f = report["findings"][0]
        out = audit.act(self.store, self.vault, f["id"], "join")
        self.assertEqual(out["result"], "done")
        self.assertEqual(len(self.store.list_records(status="active")), 1)


if __name__ == "__main__":
    unittest.main()
