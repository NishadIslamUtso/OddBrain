# Update-6 recovery — what it was, and the proof that nothing was lost

*Owner list item A11. Plain words, with the evidence.*

## The question

Update-6's zip never made it to GitHub. The only trace of it was a note in
the master plan: *"update-6 claimed a fix"* for **B5 — "Review does not clear
after answering"**. Question: did update-6 contain anything unique that was
lost when update-7 replaced it?

## Where the lost work turned out to be

The `claude--made` branch of **this same repository** (always on GitHub,
just not on the working branch) holds the whole build history:

| commit | what it is |
|---|---|
| `8a57d89` | update-2 build |
| `cf0a308` | update-4 build |
| `96047e6` | **update-5 build** (audit, browser tests, local servers, summary card) |
| `4d644ba` | **update-7 build** (keep-local, owner card, second opinion, schema) |

There is **no update-6 commit** — update-5 and update-7 sit next to each
other. So everything that shipped in update-6 **and** update-7 together is
the diff between `96047e6` and `4d644ba` (28 files, +1,514 lines). That diff
is preserved on GitHub and can never be lost again.

So B9's fear ("update-6 exists only as a zip somewhere") is only half true:
the **work** reached GitHub as part of the update-7 commit; only its
separate zip was never uploaded.

## The proof that nothing unique was lost

The updates are whole-program zips: each one is the complete program, and
installing = extracting it over the old one. So update-7 already contained
update-6's work, and everything since (update-8…14) is built on top. What
was checked file by file, in today's program (update-14):

1. **Every source line** added between update-5 and update-7 either still
   exists word-for-word today, or was later extended by a newer update —
   never removed. (13 program files checked: 4 lines were extended — e.g.
   the feed's "hide undone rows" line later also hides "Got it" rows; the
   check-up's counter line today also counts the second-opinion look. Zero
   lines dropped.)
2. **Every test area** the update-5→7 work added is still alive and passing
   today: keep-local, second opinion, schema, grounding, daily use (moments
   → journal), summary card, small fixes, and the browser tests for the
   owner card. All green in the 49-suite run.
3. **The one named update-6 fix (B5)** — "Review does not clear after
   answering" — works end-to-end today and is locked by tests: answering a
   question resolves it, it drops out of the pending list, and Review
   re-renders without it (`tests/test_filing.py`, `tests/test_second_opinion.py`,
   `tests/test_feed_clear.py`). Its sibling B3 ("undo does not clear") is
   covered by the same "hide undone rows" work, and update-10 later
   re-shipped the whole clearing behaviour ("Got it" / "Clear all") with its
   own tests — so the behaviour is guaranteed twice over.

## Verdict

**Nothing unique from update-6 was lost.** No re-upload is needed — and
uploading the old update-6 zip today would actually be harmful, since its
program is two updates behind the live line (update-14).

*Not checked (stated honestly):* the exact split of which lines inside the
update-5→7 diff were update-6's and which were update-7's. It does not
matter for the verdict: the whole diff is preserved and the whole diff
survives.

## For the record — where the history lives now

`git log --oneline origin/claude--made` shows the builds: update-2, update-4,
update-5, update-7. (Update-3 has no named commit — *not checked* what
exactly it carried.) The update-7 tree is browsable at
`https://github.com/NishadIslamUtso/OddBrain/tree/claude--made`.
