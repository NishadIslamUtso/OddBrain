# Memory_OB update-14 — what changed (plain words)

Built on top of update-13. **49 test suites pass** (including from a fresh
unpack of this zip).

## 1. The AI second opinion now covers everything in the check-up

The nightly check-up already asked the AI helper for a second look at
"these two memories disagree" and "the same thing saved twice". Now it also
asks about the two other kinds of findings:

- **"Still on your to-do list?"** — the helper checks whether the old to-do
  really still needs doing. If it is done or no longer matters, the question
  is set aside instead of nagging.
- **"I cannot find the proof for this one any more"** — the helper checks
  whether the proof really is broken, or whether the memory is still backed
  properly and the finding is a false alarm.

Same promises as before: the helper only ever changes the **list of
findings** — never a memory. No answer (or a broken helper) means the rules'
word stands. Nothing is asked about twice.

## Next on the list (see TODO.md)

- A11: update-6 recovery. A12: test-kit fresh-install fix.
