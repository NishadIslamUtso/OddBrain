# Memory_OB update-9 — what changed (plain words)

Built on top of update-8. **44 test suites pass** (43 from update-8 + a new
9-check suite for this change), including from a fresh unpack of this zip.

## Wait-for-AI — the rules never take over again (your decision D1)

Before: when the AI helper failed, crashed, or answered unreadably, simple
rules would quietly chop your message into pieces and file them *as if the
AI had read it*. That is where fragments, drafts and junk came from.

Now:

- **If the AI helper does not read a message** (it fails, answers blank,
  refuses, or writes something unreadable) **your message is kept WHOLE** —
  never chopped — and you are told plainly: *"The AI helper did not answer
  properly, so I kept this aside."*
- The whole message is **read again properly when a helper answers** (the
  background reader picks it up), or when you press **Tidy now**. Anything
  already saved the first time is not saved twice.
- A helper that says "none" (read it, nothing to keep) is believed — nothing
  is filed and nothing waits.
- **The only jobs rules still do while a message waits:** hiding passwords
  and card numbers, and honouring "forget that…" commands. Nothing else.
- The raw conversation is always kept in Sources either way — nothing is
  ever lost.

## Also in this update

- Model answers are checked more strictly: apologies/refusals ("I am sorry
  but I cannot…") and answer scaffolding ("Here are the facts:") are never
  filed as memories.
- 21 test suites were brought in line with the new contract (3 old tests
  asserted the old fallback behaviour and now assert the new one).

## Known limits (next on the list — see TODO.md)

- The clear-buttons for the feed ("Got it", "clear all at once", the 4th
  conflict answer "Neither / none of these") = A4, next.
- The one-time vault clean-up button for junk already saved = A6.
- Stable splitting of run-on messages = A5.
