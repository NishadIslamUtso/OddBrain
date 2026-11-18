"""A memory is only filed when one real sentence of the owner's backs it (not a stitched-together guess)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from memory_ob import extract, manager  # noqa: E402
from memory_ob.config import Settings  # noqa: E402
from memory_ob.store import Store  # noqa: E402

SISTER = "My sister lives in Dhaka. I study at BRAC University."


class WhatBacksWhat(unittest.TestCase):
    def grounded(self, claim: str, said: str, **kw) -> bool:
        return extract.evidence_for(claim, said, **kw).grounded

    def test_somebody_elses_fact_is_not_the_owners(self) -> None:
        self.assertFalse(self.grounded("I live in Dhaka", SISTER))
        self.assertFalse(self.grounded("Lives in Dhaka", SISTER))
        self.assertFalse(self.grounded("I earn 50k", "My friend earns 50k. I study at BRAC."))

    def test_two_sentences_cannot_be_stitched_into_one_fact(self) -> None:
        self.assertFalse(self.grounded("I study in Dhaka", SISTER))

    def test_a_wish_is_not_a_fact(self) -> None:
        said = "I want to work at Google someday. I study at BRAC."
        self.assertFalse(self.grounded("I work at Google", said))
        self.assertTrue(self.grounded("I want to work at Google", said))

    def test_a_to_do_may_drop_the_wish_words(self) -> None:
        said = "I plan to renew my passport next month."
        self.assertFalse(self.grounded("Renew passport", said))
        self.assertTrue(self.grounded("Renew passport", said, forward_ok=True))

    def test_facts_about_the_person_the_claim_names_are_fine(self) -> None:
        self.assertTrue(self.grounded("My sister lives in Dhaka", SISTER))
        self.assertTrue(self.grounded("Riya lives in Dhaka", "My sister Riya lives in Dhaka."))
        self.assertTrue(self.grounded("Karim paid 20k", "Karim paid 20k yesterday."))

    def test_my_friend_and_i_still_counts_as_the_owner(self) -> None:
        self.assertTrue(self.grounded("I went to Cox's Bazar", "My friend and I went to Cox's Bazar last week."))

    def test_an_it_in_the_next_sentence_can_be_filled_in(self) -> None:
        said = "I started a bakery business called Sweet Rise.\nIt makes 50k a month."
        self.assertTrue(self.grounded("Sweet Rise bakery makes 50k a month", said))

    def test_a_number_must_be_one_the_owner_said(self) -> None:
        self.assertFalse(self.grounded("I earn 80k", "I earn 50k."))

    def test_unsure_words_travel_with_the_claim(self) -> None:
        said = "I live in Dhaka, maybe I will move to Canada."
        self.assertFalse(extract.evidence_for("I live in Dhaka", said).hedged)
        self.assertTrue(extract.evidence_for("I will move to Canada", said).hedged)

    def test_support_still_answers_in_the_old_shape(self) -> None:
        ok, quote = extract.support("I live in Dhaka", "I live in Dhaka.")
        self.assertTrue(ok)
        self.assertEqual(quote, "I live in Dhaka.")


class InThePipeline(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.vault = Path(self.tmp) / "vault"
        self.db = Path(self.tmp) / "mob.db"
        Settings.resolve(vault=self.vault, db=self.db).ensure_dirs()
        self.store = Store(self.db)

    def tearDown(self) -> None:
        self.store.close()

    def tell(self, text: str, *claims: dict):
        answer = "\n".join(json.dumps(c) for c in claims)
        return manager.capture(self.store, text=text, vault=self.vault, model_call=lambda _p: answer)

    def test_a_mixed_up_claim_is_dropped_and_the_true_one_kept(self) -> None:
        out = self.tell(SISTER, {"text": "I live in Dhaka"}, {"text": "I study at BRAC University"})
        self.assertEqual(out.ungrounded, 1)
        self.assertEqual(out.saved, 1)
        self.assertEqual([r.body for r in self.store.list_records(status="active")], ["I study at BRAC University"])

    def test_an_unsure_owner_stays_unsure_even_if_the_ai_drops_the_maybe(self) -> None:
        out = self.tell("Maybe I will switch to a new job at Google.", {"text": "I will switch to a new job at Google"})
        self.assertEqual(out.saved, 0)
        self.assertEqual(out.unsure, 1)


class SomeoneElseInTheOwnersLife(unittest.TestCase):
    """"My doctor lives in Dhaka" is about the doctor. It must never back "I live in Dhaka"."""

    ABOUT_OTHERS = [
        "My doctor lives in Dhaka.", "My coach said I should rest.", "My dentist works at a clinic.",
        "My landlord lives in Sylhet.", "My parents live in Sylhet.", "My family lives in Dhaka.",
        "My friends live in Rome.", "My new supervisor works at BRAC.", "My mother-in-law lives in Rome.",
        "My physio lives in Dhaka.",            # a word nobody listed: the general rule catches it
        "My cat lives in Dhaka.", "My tutor studies at BUET.",
    ]

    def test_none_of_them_is_the_owner(self) -> None:
        for said in self.ABOUT_OTHERS:
            self.assertEqual(extract.subject_of(said)[0], "other", said)

    def test_none_of_them_backs_a_fact_about_the_owner(self) -> None:
        for said in self.ABOUT_OTHERS:
            for claim in ("I live in Dhaka", "I work at a clinic", "I study at BUET"):
                if extract.evidence_for(claim, said).grounded:
                    # only allowed when the claim has nothing to do with the sentence at all
                    self.assertFalse(set(claim.lower().split()) & {"dhaka", "clinic", "buet"} & set(said.lower().replace(".", "").split()), (said, claim))

    def test_and_the_other_way_round_the_owners_own_sentence_cannot_back_somebody_elses_fact(self) -> None:
        for claim in ("Rahim lives in Dhaka", "Karim works at Google", "He lives in Dhaka"):
            self.assertFalse(extract.evidence_for(claim, "I live in Dhaka. I work at Google.").grounded, claim)
        self.assertTrue(extract.evidence_for("Rahim lives in Dhaka", "Rahim lives in Dhaka.").grounded)

    def test_the_same_sentence_still_backs_a_claim_about_that_person(self) -> None:
        self.assertTrue(extract.evidence_for("My doctor lives in Dhaka", "My doctor lives in Dhaka.").grounded)

    def test_you_and_them_together_is_you(self) -> None:
        for said in ("My doctor and I live in Dhaka.", "My parents and I live in Dhaka."):
            self.assertEqual(extract.subject_of(said)[0], "me", said)
            self.assertTrue(extract.evidence_for("I live in Dhaka", said).grounded, said)

    def test_things_that_are_the_owners_are_still_the_owners(self) -> None:
        for said in ("My laptop is a ThinkPad.", "My budget is 15000 taka a month.", "My laptop works fine."):
            self.assertNotEqual(extract.subject_of(said)[0], "me")           # unknown, never "other" by the verb rule
        self.assertTrue(extract.evidence_for("My budget is 15000 taka a month", "My budget is 15000 taka a month.").grounded)

    def test_the_mixed_message_keeps_only_what_is_true(self) -> None:
        tmp = Path(tempfile.mkdtemp())
        vault, db = tmp / "v", tmp / "m.db"
        Settings.resolve(vault=vault, db=db).ensure_dirs()
        store = Store(db)
        self.addCleanup(store.close)
        out = manager.capture(store, text="My doctor lives in Dhaka. I study CSE at BRAC University.", vault=vault,
                              model_call=lambda _p: "\n".join(json.dumps(c) for c in ({"text": "I live in Dhaka"}, {"text": "I study CSE at BRAC University"})))
        self.assertEqual(out.ungrounded, 1)
        self.assertEqual([r.body for r in store.list_records(status="active")], ["I study CSE at BRAC University"])

    def test_a_profile_is_made_for_the_new_roles_but_not_for_pets(self) -> None:
        self.assertEqual(manager.people_in("My doctor Rahman lives in Dhaka."), [("Rahman", "doctor")])
        self.assertEqual(manager.people_in("My coach Karim said hello."), [("Karim", "coach")])
        self.assertEqual(manager.people_in("My dog Max is two."), [])


if __name__ == "__main__":
    unittest.main()
