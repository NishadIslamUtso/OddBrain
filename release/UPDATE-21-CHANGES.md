# Memory_OB update-21 — one-click corrections on each AI decision (item E5)

**For: Nishad. Plain words.**
**Built on: update-20. Test state here: 58 of 58 suites pass on a Linux
checker (one more suite than update-20: the new corrections tests). The real
Windows machine must still install and run it (H1). Browser checks were not
re-run here (no browser on this checker).**

## What is new

When the AI files something, its decision now carries **three one-click
corrections**, right on the row in your Review feed:

- **Not important** — "this was not worth remembering." The memory goes to the
  trash (never destroyed) and the feed says *you said it was not important*.
  **Undo brings it back.**
- **Wrong shelf** — one click shows the real shelves; click the right one and
  the memory moves there. Undo puts the old shelf back.
- **Not me** — "this is about someone else, not me." The memory is kept and
  stays filed where it is, but it stops counting as your own fact: it leaves
  your truth-checks and your own-facts list. Undo puts it back.

Every correction:

- is **undoable** from the same feed (the same Undo as everything else);
- is logged as **your** words ("you said it was not important"), never as the
  AI approving itself;
- only appears on **AI decisions** — your own lines are already your words.

## Small wording fixes that came with it

- A shelf move in the feed now reads **"Moved"** with the new shelf chip — no
  more "Before: (the same text)".
- "Not me" reads **"Marked as about someone else"** (and back reads "Marked as
  about you").

## One rule of the house that this fixed

The memory book has a standing rule: a *note* is about you only (journal,
story and note are your own kinds). So "Not me" turns such a memory into a
**profile fact** (the kind for a fact about a person) at the same time — the
book would not even open a note that claimed to be about someone else. Undo
puts the old kind back too.

## What is unchanged

Everything else from update-20 and before: the flake net (`test-runs.log`),
the split-wobble fix, the whole-retirement move.

## Still open after update-21

- **E1:** the AI helper's 404 on the real machine (H7 steps in
  UPDATE-17-CHANGES.md).
- **E2:** re-run the filing test (H3) and "AI narration never saved as me"
  (H6) on the real machine once the helper answers.
- **E4:** the flaky test — the net is up (`test-runs.log` names any failing
  suite); send that file if a run ever fails.
- **E6:** the Windows fix-labelling tests — they only ever ran on a Linux
  checker.
