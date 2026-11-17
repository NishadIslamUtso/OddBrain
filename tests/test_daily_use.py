"""Everyday talk: saying you did a to-do closes it, small talk is ignored, and the little rules that keep Memory_OB quiet."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob import conflicts, feed, manager, topics  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402


class Case(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.vault, db = self.tmp / "vault", self.tmp / "m.db"
        Settings.resolve(vault=self.vault, db=db).ensure_dirs()
        self.store = Store(db)

    def tearDown(self) -> None:
        self.store.close()

    def say(self, text: str):
        return manager.capture(self.store, text=text, vault=self.vault)       # simple rules, no AI helper

    def todos(self, done: bool = False) -> list[str]:
        tag = topics.DONE_TAG if done else topics.TODO_TAG
        return sorted(r.body for r in self.store.list_records(status="active") if tag in r.tags)

    def bodies(self) -> list[str]:
        return sorted(r.body for r in self.store.list_records(status="active"))


class FinishingATodo(Case):
    def test_saying_you_did_it_ticks_it_off(self) -> None:
        self.say("I need to submit my thesis proposal by December 5.")
        self.assertEqual(len(self.todos()), 1)
        out = self.say("I submitted my thesis proposal.")
        self.assertEqual(out.finished, 1)
        self.assertEqual(out.saved, 0)
        self.assertIn("Ticked off 1 to-do", manager.describe(out))
        self.assertEqual(self.todos(), [])
        self.assertEqual(len(self.todos(done=True)), 1)
        self.assertEqual(len(self.bodies()), 1)           # the sentence itself is not kept as a second memory

    def test_the_feed_says_so_and_undo_puts_it_back(self) -> None:
        self.say("I need to renew my passport.")
        self.say("I renewed my passport.")
        top = feed.build(self.store)[0]
        self.assertEqual(top["verb"], "Ticked off")
        self.assertEqual(top["by"], "AI")
        self.assertTrue(top["can_undo"])
        manager.undo(self.store, top["seq"], vault=self.vault)
        self.assertEqual(len(self.todos()), 1)
        self.assertEqual(self.todos(done=True), [])

    def test_a_finishing_word_is_enough_when_the_thing_matches(self) -> None:
        self.say("I have an assignment due on Friday.")
        out = self.say("I finished my assignment.")
        self.assertEqual(out.finished, 1)

    def test_irregular_verbs(self) -> None:
        self.say("I need to pay the electricity bill.")
        out = self.say("I paid the electricity bill.")
        self.assertEqual(out.finished, 1)

    def test_it_never_closes_the_wrong_thing(self) -> None:
        self.say("I need to pay the electricity bill.")
        self.say("I need to call the bank.")
        for sentence in (
            "I paid the rent.",                      # another thing
            "I didn't pay the electricity bill.",    # negated
            "I will pay the electricity bill tomorrow.",
            "I want to pay the electricity bill.",
            "Maybe I paid the electricity bill.",    # unsure
            "I called my mom.",                      # same verb, other thing
        ):
            out = self.say(sentence)
            self.assertEqual(out.finished, 0, sentence)
        self.assertEqual(len(self.todos()), 2)

    def test_two_possible_to_dos_means_neither_is_touched(self) -> None:
        self.say("I need to submit the lab report.")
        self.say("I have to submit the lab report again for the retake.")
        out = self.say("I submitted the lab report.")
        self.assertEqual(out.finished, 0)
        self.assertEqual(len(self.todos()), 2)


class SmallTalk(Case):
    def test_thanks_and_goodbyes_are_not_queued_for_later(self) -> None:
        for sentence in ("thanks, that's all for now", "Thank you so much!", "ok, got it", "good night", "see you later"):
            out = self.say(sentence)
            self.assertEqual((out.saved, out.waiting), (0, 0), sentence)
            self.assertEqual(manager.describe(out), "There was nothing in that to remember.")

    def test_a_fact_that_starts_with_thanks_is_still_kept(self) -> None:
        out = self.say("Thanks, I live in Dhaka.")
        self.assertEqual(out.saved, 1)


class People(Case):
    def test_my_younger_brother_has_a_profile(self) -> None:
        self.say("My younger brother Tanvir is in class 9.")
        self.assertIsNotNone(self.store.find_person("Tanvir"))

    def test_other_modifiers(self) -> None:
        self.say("My old friend Karim lives in Rome.")
        self.assertIsNotNone(self.store.find_person("Karim"))


class SameThingDifferentWords(Case):
    def test_based_in_is_the_same_as_live_in(self) -> None:
        self.say("I live in Dhaka with my parents.")
        out = self.say("I'm based in Dhaka.")
        self.assertEqual((out.saved, out.asked, out.duplicates), (0, 0, 1))

    def test_with_whom_you_live_is_not_where(self) -> None:
        self.assertEqual(conflicts.compare("I live in Dhaka.", "I live in Dhaka with my parents."), conflicts.DUPLICATE)

    def test_a_different_city_still_asks(self) -> None:
        self.say("I live in Dhaka with my parents.")
        out = self.say("I am living in Sylhet now.")
        self.assertEqual(out.asked, 1)


class ProjectNames(Case):
    def test_an_app_called_x_is_project_x(self) -> None:
        self.assertEqual(topics.thread_of("I'm building an app called StudyBuddy with my friend Rahim."), "Study Buddy")
        self.assertEqual(topics.thread_of("My startup called Sweet Rise is growing."), "Sweet Rise")

    def test_later_mentions_join_it(self) -> None:
        self.say("I'm building an app called StudyBuddy.")
        self.say("We decided to launch StudyBuddy in March.")
        tags = [t for r in self.store.list_records(status="active") for t in r.tags if t.startswith("project/")]
        self.assertEqual(set(tags), {"project/study-buddy"})
        self.assertEqual(len(tags), 2)

    def test_a_plain_bakery_business_still_works(self) -> None:
        self.assertEqual(topics.thread_of("I want to start a bakery business"), "Bakery")


class PassingMoments(Case):
    """Without an AI helper the simple rules must still tell "how I am right now" from "how I am"."""

    PASSING = [
        "I'm so tired today.", "I'm hungry.", "I'm at the library right now.", "I have a headache.", "I'm watching Netflix.",
        "I feel sad.", "I'm bored.", "I slept late last night.", "I had biryani for lunch.", "I'm in a meeting.",
        "I'm feeling anxious right now.", "I'm heading to the gym.", "I just woke up.", "I'm in a bad mood",
        "I'm eating dinner", "I'm on the bus", "I'm sick today", "I don't feel like studying", "I'm waiting for my friend",
        "I'm kind of annoyed at my roommate", "I'm free this evening", "I'm busy", "I'm so happy right now", "I'm cold",
        "I feel like crying", "I'm done with exams today", "I'm fine", "I'm at the gym",
    ]
    LASTING = [
        "I live in Dhaka.", "I'm allergic to peanuts.", "I feel anxious in crowds.", "I'm tired of my job and want to switch.",
        "I usually sleep at 11.", "I'm studying CSE at BRAC University.", "I'm working at Google.", "I'm at BRAC University.",
        "I'm happy with my job.", "I'm good at math.", "I'm busy with my startup this semester.", "I'm in the CSE department.",
        "I always feel tired in the afternoon.", "I have a cold shower every morning.", "I'm ready to start my thesis.",
        "I'm proud of my sister.", "I have diabetes.",
    ]

    def test_passing_things_are_moments(self) -> None:
        self.assertEqual([t for t in self.PASSING if not topics.is_moment(t)], [])

    def test_lasting_things_are_not(self) -> None:
        self.assertEqual([t for t in self.LASTING if topics.is_moment(t)], [])

    def test_a_passing_thing_goes_to_the_journal_not_the_facts(self) -> None:
        out = self.say("I'm in a meeting right now.")
        self.assertEqual(out.saved, 1)
        rec = next(iter(self.store.list_records(status="active")))
        self.assertIn(topics.MOMENT_TAG, rec.tags)


class NoFalseAlarms(unittest.TestCase):
    """Two things that can both be true must not interrupt you; real changes still must."""

    QUIET = [
        ("I eat rice for lunch.", "I don't eat rice for dinner."),
        ("My budget for food is 5000 taka.", "My budget for rent is 12000 taka."),
        ("I like coffee.", "I like tea."),
        ("I go to the gym on Sunday.", "I go to the gym on Tuesday."),
        ("I'm learning Rust.", "I'm learning Go."),
    ]
    CHANGES = [
        ("My monthly salary is 60000 taka.", "My salary is 50000 taka."),
        ("My budget is now 18000 taka a month.", "My monthly budget is 15000 taka."),
        ("I no longer eat meat.", "I eat meat."),
        ("I weigh 68 kg.", "I weigh 72 kg."),
        ("I'm not allergic to peanuts anymore.", "I'm allergic to peanuts."),
        ("My rent is 14000 taka.", "My rent is 12000 taka."),
    ]

    def test_two_true_things_do_not_ask(self) -> None:
        for new, old in self.QUIET:
            self.assertIsNone(conflicts.compare(new, old), (new, old))

    def test_real_changes_still_ask(self) -> None:
        for new, old in self.CHANGES:
            self.assertEqual(conflicts.compare(new, old), conflicts.CONFLICT, (new, old))


if __name__ == "__main__":
    unittest.main()
