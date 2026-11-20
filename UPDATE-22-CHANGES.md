# Memory_OB update-22 — what changed (plain words)

Built on update-21 (the other agent's updates 18–21 on top of my 16–17). I read every file that changed
between 17 and 21, ran its tests, then ran the browser checks it had skipped. Its work is sound, with the
problems below fixed here. **All unit suites and all 11 browser checks pass (light and dark, desktop and phone).**

## Fixed from reviewing update-21

1. **A pasted chat could lose your own words (serious).** Update-21 put back a rule for pasted
   "User: … / Assistant: …" text. It threw away ordinary notes: "System: I sleep at 11pm and wake at 6am"
   became empty and was never saved; lines starting "Tool:", "Model:", "Agent:" or "AI:" vanished. And a
   multi-line assistant reply leaked through as if you had written it. The rule is now narrow: only clear
   speaker names count (User, You, Me, Human, Owner / Assistant, Claude, ChatGPT, Hermes, Gemini, Copilot),
   a paste is a transcript only when **both** sides are there, and a line with no label belongs to whoever spoke
   last. A normal note is never touched. 8 new tests.
2. **The "Not important / Wrong shelf / Not me" buttons (update-21) had never been opened in a browser.** Now
   they have, in light and dark, and two problems were found:
   * After you pressed "Not important", the old "Remembered…" row still offered the three buttons, and
     pressing one would only say "that memory no longer exists". The buttons now show only while that row is
     still the latest word on that memory.
   * "Wrong shelf" listed the shelf the memory was already on. It no longer does.
   New browser check `ui_corrections.js` (each correction, its Undo, the rows that must not offer buttons).
3. **`tests/test_owner.py` (the owner-card tests) was missing from the repository.** It was in my update-16 and
   17 zips but never reached the repo, so it silently stopped running. Restored.

## The AI helper that was never reached

Your H7 output showed **nothing listening on port 8645: Hermes's AI connection (`hermes proxy`) was switched
off.** Nothing in Memory_OB ever switched it on, so nothing was ever read. Now:

* **"Read now" and "Test the AI helper" switch it on for you** when there is no AI and Hermes is installed, then
  say so ("I switched on the connection to Hermes's AI"). If it will not come up, you are told in plain words
  and your messages stay safe. It is only ever done by *your click*, never in the background, and never if you
  chose another AI in Settings.
* **The model name.** Your Hermes main model is `meituan/longcat-2.5:free`. The connection may not offer that
  name, which would explain the old 404. Memory_OB now asks the connection which models it has and goes
  straight to one of them, preferring one marked free, instead of making a call that is sure to be refused.
* Plainer words in the hints (no command names where they are not needed).

**Not proven yet:** I cannot reach your connection from here. After installing, press **Test the AI helper**
once and send me the exact sentence it shows. If it says "It answered", everything waiting will be read.

## Also in update-21 and kept (reviewed)

* Old-folder move: a helper moves the old Downloads copy after the installer leaves it; it never deletes,
  never merges into leftover debris, and leaves a plain note if it cannot. **Windows-only behaviour, untested
  on Windows** (it was only run on a Linux checker). One known weakness: if Windows blocks the rename, Python
  copies then deletes, and a half-finished attempt can leave the old copy split between two `_retired`
  folders. Nothing is lost.
* The "3 vs 4 memories" split wobble, fixed. A flaky-test hunt: every run now gets a fresh scratch folder and
  `test-runs.log` names the suite if it ever fails again.
* A search change in `store.py` that the other agent's notes did not mention: long pasted text no longer
  builds a search too deep for SQLite (it keeps at most 40 distinct words). Reviewed, harmless.

## Tests

New: `test_transcript_paste.py` (8), `test_bridge_wake.py` (10), `ui_corrections.js` (browser), more cases in
`test_corrections.py` and `test_hermes_proxy.py`. Restored: `test_owner.py`.
Still never run on the real machine: Windows tests (`test_relocate`, `test_checkup`, the retire helper),
reading with the real free Hermes model, real meaning-search scores.
