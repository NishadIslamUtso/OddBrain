# Memory_OB update-20 — hunting the flaky test (item E4)

**For: Nishad. Plain words.**
**Built on: update-19. Test state here: 57 of 57 suites pass on a Linux
checker. The real Windows machine must still install and run it (H1).**

## What this update is about

One test run failed **once** and never again in the runs after it (eight runs
by the previous builder, then twenty-seven full runs and seventy-five
single-suite runs here — several of them under heavy processor load). Nobody
caught it in the act, so nobody knows its name. This update does three honest
things about that: it hunts, it removes two real hazards that could cause a
"fails once in a while", and it builds a net so the next occurrence names
itself.

## What was hunted (and what was ruled out)

Every test was read for the classic ways a test can fail only sometimes:

- clock bounds ("must finish in half a second") — found four, all with wide
  margins; stressed them under load, none broke;
- tests fighting over a shared place — all test servers use fresh free ports;
  file listings are never asserted in a fragile order;
- threads, randomness, dates — nothing that can change between runs.

One real hazard was found and is now gone: the test runner pointed every run
at the **same** throwaway folder in the system's temp area and never cleaned
it. Any test that forgot to use its own folder would see whatever earlier runs
left behind — and what a run sees would then depend on how many runs came
before. That is exactly the shape of "fails once in a while". Now every run
gets a **fresh** throwaway folder of its own.

A second hazard: the relocation test waited 45 seconds for the "move the old
copy away" helper, but that helper deliberately waits up to 40 seconds first
(Windows needs time to let go of folders). Only 5 seconds of margin — on a
busy machine that can run out. The test now waits the full settle time plus
room to spare.

## The net: test-runs.log

`run_tests.py` now writes one plain line per suite to **`test-runs.log`**
(next to itself in the engine folder) — when, pass or fail, how long. If any
run ever fails again, the log says which suite it was. **Send that file if it
happens.** The runner also shouts `FAILED SUITE: <name>` on screen.

## What is unchanged

Everything else from update-19: the split-wobble fix, the whole-retirement
move, and the closing fixes from update-17.

## Still open after update-20

- **E4 stays open on purpose.** The flaky test was not caught in the act —
  the hazards above are removed and the net is up, but the name is only known
  when the log catches it.
- **E1:** the AI helper's 404 on the real machine (H7 steps in
  UPDATE-17-CHANGES.md).
- **E2:** re-run the filing test (H3) and "AI narration never saved as me"
  (H6) on the real machine once the helper answers.
- **E5:** one-tap corrections on the AI view — waiting for the owner's go.
- **E6:** the Windows fix-labelling tests — they only ever ran on a Linux
  checker.
