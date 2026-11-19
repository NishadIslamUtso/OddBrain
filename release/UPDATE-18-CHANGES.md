# Memory_OB update-18 — what changed (plain words)

Built on update-17 (Claude's line on the `claude--made` branch). This is the
build he promised: **the old folder's move done properly and tested**.
**57 unit suites pass and the release passes from a clean unzip.**

*(The update-17 notes said "58 test suites". The tree has 57 test files — the
number was simply off by one. This run counts what the tree actually has.
Browser checks are separate and were not re-run here: this build machine has
no Windows and no browser.)*

## The old folder's move — now properly done

When the installer finds the engine in Downloads or a temp folder, it copies
it to its permanent home and retires the old copy. On Windows the move had a
hard case: the installer stands *inside* the old folder, and Windows will not
move a folder anyone is standing in. A detached helper does the move after
the installer leaves — update-17 started that, this build finishes it:

1. **Leftover debris is never merged into.** If an earlier attempt left a
   half-copied folder at the destination, the move now goes to a fresh name
   beside it. Nothing is ever deleted or overwritten.
2. **"Already moved" is a success, not an error.** A second helper (or an
   impatient re-run) no longer flails and no longer cries wolf.
3. **Failures leave a note you can find.** The helper runs in the background,
   where nobody can see its messages. If the move really cannot happen, it
   writes `Memory_OB-…-NOT-MOVED.txt` next to the retired copies, in plain
   words, saying where the old folder is and that nothing was deleted.

Four new tests pin all of this down (7 in the relocate suite in all).

## What is still open (said honestly)

- The **404 from the AI helper** on your machine: last seen, the Hermes proxy
  simply was not running on 8645. The diagnosis steps (H7) are in the
  update-17 notes; the fix on our side (showing the server's real error,
  picking a model from the proxy's own list, falling back to Hermes's main
  model) shipped in update-17.
- **H3 and H6 re-runs** on your machine (the filing test and the
  narration-never-saved test) — those need your machine, after the helper
  works.
- The **"3 vs 4" split wobble** (the same words filing as 3 memories one time
  and 4 another) is still not chased down.
- One unit run failed **once** and never again in 8 repeat runs — a flaky
  test exists somewhere; not found.
- The one-click corrections on each AI decision ("not important", "wrong
  shelf", "not me") were talked about but not built — waiting for your go.
