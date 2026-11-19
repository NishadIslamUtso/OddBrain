# Memory_OB update-16 — what changed (plain words)

Built on update-15. It is a **check-and-fix** update: every screen was opened in light and dark, on a
desktop and a phone, with a stand-in AI helper, and what was rough or broken was fixed.
**54 test suites pass, and all 9 browser checks pass** (before this update, 6 of the 7 browser
checks failed, because nothing in them had an AI helper any more).

## Bugs fixed

1. **Messages vanished when the AI did not answer.** When Hermes said "ready" but its model failed,
   your message was kept aside and then shown nowhere: no list, no banner, no button. Review now has
   **Waiting to be read** (your words, why they wait, **Read now**, **Skip this one**). The banner on
   other screens now also appears when the helper is connected but not answering.
2. **Wrong wording.** With no helper at all, it said "the AI helper did not answer properly". It now says
   "No AI helper is connected right now…". Tidy now no longer says "All tidy." while messages still wait.
3. **"Keep the old one" and the fourth answer could not be undone**, and undoing "the new one is right"
   silently lost what you had just said. Every answer now has an Undo, and undoing it **puts the question
   back** (and the memories back as they were). The fourth answer was a clumsy "Neither / none of these"; it is now one plain
   label, **"Discard both"** (the old memory goes, the new line is not saved, Undo brings it back). It shows one
   line ("Discarded both"), not a wrongly worded "Kept your earlier answer" plus a "Removed".
4. **Me showed a to-do twice** (under To do and under Coming back to). Once now. Due dates still reach Review.
5. **"My sister Aisha is a doctor…" was listed under "About you".** A fact about a person who has a
   profile now lives on that profile only. "I live with Aisha" is still about you. Facts about people
   without a profile stay visible.
6. **A reasoning model's "<think>…</think>" notes were read as part of its answer** (free and local
   reasoning models write them), so its working-out could be filed as memories. They are dropped.
7. **Two sentences joined into one run-on** ("…business I'll come back to…") when the AI left off the full stop.
8. **Phone screen:** the Me and Settings tabs were cut off; "Got it" and "Undo all" wrapped their words.
   All six tabs fit at 360 px, buttons stay on one line.
9. **Settings:** the native "Choose File" button now matches the other buttons.
10. **Search returned almost everything.** Real embedding models give even unrelated lines a middling
    similarity (0.4–0.5 is common), and the floor was a fixed 0.30, so a meaning search let the whole vault
    through. A match must now also be near the best match and clearly above what a typical memory scores,
    and a question nothing stands out for returns nothing. (Tested with a stand-in model built to behave
    this way; **not measured on the real nomic model**, which could not be downloaded here.)
11. **Word search matched on filler words.** "what is my budget" also found every memory containing "my"
    (and "i" matched anything starting with i). Filler words are now ignored in the word search.
12. **The Vault header said "laid out like an Obsidian vault".** Removed; it now says what it is.
    Settings now says where meaning search is used (the search box on Review, and when Hermes looks
    something up).
13. **"Check now" said "Everything looks fine" with no AI helper.** Without one, the check-up runs on
    word rules only, so it now says so ("My own checks found nothing. The AI helper could not give a
    second look...") instead of sounding sure. A fresh install with empty screens was also looked at,
    on desktop, phone, light and dark: nothing else needed changing.

## New

* **Test the AI helper** (Settings → AI helper): asks it one small question and says plainly whether it
  answered, and if not, why. If messages were waiting and it answers, they are read.

## For whoever tests this

* The browser checks use a stand-in AI helper (`tests/browser/fake_ai.py`) that a script can switch to
  `down` or `junk`. New checks: `ui_waiting.js`, `ui_phone.js`. `test_owner.py` (dropped in update-9)
  is back.
* New suites: `test_waiting_screen.py`, `test_undo_answer.py`, `test_thinking.py`.

## Not changed on purpose

* The search box **inside the Vault** matches words and filters only (it has no meaning search). Meaning
  search covers the Review search box and what Hermes looks up.
* The Vault tree shows a folder with one note of the same name ("Health" > "Health") as two rows. It is
  odd but not wrong, and flattening it touches keyboard navigation. Say if you want it.
