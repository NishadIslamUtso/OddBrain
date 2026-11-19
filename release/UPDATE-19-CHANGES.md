# Memory_OB update-19 — the "3 vs 4 memories" wobble is fixed (item E3)

**For: Nishad. Plain words.**
**Built on: update-18. Test state here: 57 of 57 suites pass on a Linux
checker (one more suite than update-18: new tests joined the pack). The real
Windows machine must still install and run it (H1).**

## What was still wrong (owner item E3)

The same words could become **3 memories one time and 4 the next**. The
shape-stable cutting from update-15 already handled "the model gave one long
line this time and four short lines last time" — but there was a second,
hidden way for the count to change:

**Long texts are read in pieces** (a big chat is cut at sentence ends so one
model call never times out). The cut can fall **between a sentence and the
sentence that only continues it**:

> "My knee hurts when I run. ‖ It started last week. …"

Read in one go, "It started last week." joins "My knee hurts when I run." —
one memory. But when the piece boundary fell between them, each piece was cut
on its own, "It started last week." was read alone, and it became **its own
memory**. Same words, 3 vs 4, depending only on where the cuts happened to
fall. We proved it with a test model that answers only about the piece it was
given: whole text = 3 memories every time; cut-up text = 4 every time.

## What update-19 changes

- **A piece cut can never fall between a sentence and its continuation.**
  "It started last week.", "That was in March.", "and I could not sleep" —
  these travel with the sentence they continue, even when that makes the piece
  one sentence longer. Reading a text in pieces now gives **exactly** the same
  memories as reading it whole.
- The same rule covers a giant sentence cut at raw characters: a continuation
  after it stays glued to its tail.
- New tests (the pack grows to 58 with them — 57 suites): the same dump is
  filed once whole and once forced into four pieces, in three different model
  answer shapes, and must give identical memories; "It started last week." is
  never allowed to become its own memory.

## What is unchanged

Everything else from update-18: the whole-retirement move with its plain
failure note, the closing fixes from update-17, and all of update-16.

## Still open after update-19

- **E1:** the AI helper's 404 on the real machine (H7 diagnosis steps in
  UPDATE-17-CHANGES.md).
- **E2:** re-run the filing test (H3) and "AI narration never saved as me"
  (H6) on the real machine once the helper answers.
- **E4:** the test that fails once in a while (never reproduced yet).
- **E5:** one-tap corrections on the AI view ("not important", "wrong shelf",
  "not me") — waiting for the owner's go.
- **E6:** the Windows fix-labelling tests (update-17 + update-18 helpers) —
  they only ever ran on a Linux checker.
