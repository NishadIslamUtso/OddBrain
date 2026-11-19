# Memory_OB update-17 — what changed (plain words)

Built on update-16. The theme: **you can now see whether the AI is really reading, or stuck**, and the
four things that went wrong on your machine are fixed (one of them only partly; see "Not proven yet").
**58 test suites pass and all 10 browser checks pass** (light and dark, desktop and phone).

## The four problems you reported

1. **"15 things waiting. The AI helper did not answer…" and nothing happened.**
   Before, one message the AI could not read stopped the whole queue, and there was no way to tell
   "slow" from "dead". Now each message is read on its own: one that fails is set aside **for this run**
   and the ones behind it are still read. Two failures in a row mean the helper is down, so it stops
   instead of hammering it, and says why. Every single AI call has a 150-second limit, so a call that
   hangs can no longer hold everything up forever.
2. **"Cannot set properties of null (setting 'onclick')" on "How is my memory doing?"** The question
   popup looked for a "No" button that this popup does not have. Fixed, and a browser check now opens that
   popup.
3. **"All tidy. Now reading what was waiting…"** was a contradiction. Tidy now says what it did and what
   it is doing in one honest sentence.
4. **"Test the AI helper" → `HTTP Error 404: Not Found` from `127.0.0.1:8645/v1/chat/completions`.**
   What was wrong on our side: the real answer from the server was thrown away, the "is the proxy up?"
   check trusted a page that does not prove the chat address works, the model name was guessed, and
   if the proxy failed nothing else was tried. Now: the server's own message is shown (with a plain
   hint for 401/403/404/429/5xx), the proxy's own model list is asked for a model that exists, an
   unknown model is retried with another one, and if the proxy fails Hermes's own main model address is
   tried next. **I cannot see why 8645 answered 404 on your machine** (see below).

## Watch the AI work (new)

While it reads, Review shows a live block, and every other screen shows a small banner:

* **Reading message 3 of 5 · 12s so far**, with a progress bar and the first words of that message.
* **"The AI helper has answered 4 times, the last one 2s ago."** If it has been silent for 45 seconds it
  says so in words: *"The AI helper has not answered for 1m 15s. It may be stuck. You can wait, or press Stop."*
* **A list of what it decided about each line**, newest first, with the reason: *Kept — Life · about you*,
  *Already known*, *Asked you*, *Not sure*, *Ticked off*, *Left out — pasted document / server log / the AI
  agent's own notes…*, *Set aside*.
* **Stop.** It finishes the message it is on, then stops. Nothing already saved is undone, the rest stay
  waiting, and the card says "You stopped reading." **Read now** carries on.
* Very long messages are read in pieces ("piece 2 of 5"). If any piece fails, the whole message stays
  waiting and nothing half-read is saved.
* The numbers change in place. The Stop button is never rebuilt under your finger, and the page notices
  by itself (every 15 seconds) when something starts reading in the background.

**Not built yet (stage 2 and 3, we said we would talk later):** one-click corrections on each line
("not important", "wrong shelf", "that's not me") and "Ask why". The list already carries the ids they
need, so this is a screen change, not an engine change.

## Junk that was not about you

* The **not-life filter** now also catches an AI agent's working notes ("Let me fetch 9-13…", "I've been
  grading it against the DEAD spec", "Click **Done**…"), bold and list markup, bare file names,
  snake_case names, check marks, and plain lines that sit inside a pasted block. It was checked against
  the real lines from your vault, and against 16 real-life sentences that must **not** be caught
  (including "I am building Memory_OB, a Hermes plugin for my thesis.").
* The filter runs **before** the AI sees a message, so junk is not even sent. A message that is all junk
  never waits for the AI.
* A project name may now contain an underscore (`Memory_OB`); stray words ("From", "What", "Windows")
  are still refused.
* The old-junk sweep removes the new classes too, to the trash, with Undo (tested against the same real lines).
* Checked and tested: what the assistant says, and the Hermes gateway's "INTERNAL NOTIFICATION" in the
  user's seat, never become your memories. Your own words in the same turn are still kept.

## From Hermes's own fixes (reviewed, then merged selectively)

* Long messages are split at sentence ends before being sent (kept, with a fix: its splitter glued
  sentences together as "off.I did").
* `release.py` no longer packs `*.egg-info`.

## Tests

* New: `test_reader_live.py`, `test_long_reading.py`, `test_notlife_agent.py`, `test_hermes_proxy.py`,
  browser check `ui_reading.js` (watching, Stop, "stuck" wording), more steps in `ui_waiting.js`.
* Windows: `test_relocate.py` compares real paths (Windows may spell the same folder two ways), and
  `test_checkup.py` closes its database before deleting the folder (Windows refuses to delete an open file).
  **I could not run these on Windows**; they were reasoned from your Hermes report.
* While building the browser check, it found two real bugs in my own first version: the Stop button was
  rebuilt every poll (so a click could miss), and the Review card and the banner shared one element id.
  Both fixed.
* `python run_tests.py` runs every suite in its own process, as designed. Running all tests together in
  one process shows two failures (`test_import_migrate`, `test_model_slots`); they are the same in update-16
  (shared global state between suites), not new.
* One `run_tests.py` run (of 58 suites) failed once and I could not make it fail again in 8 more runs, three of
  them under heavy load. I do not know which suite it was.

## Not proven yet (I cannot test these here)

* **Why 8645 gave 404.** It could be: not signed in to Nous Portal in `hermes proxy`, a model name
  your account does not have, or another program on port 8645. After this update **Test the AI helper**
  shows the server's own sentence; send me that sentence. Hermes can also check with the commands in the
  message I gave you (`hermes proxy status`, `curl http://127.0.0.1:8645/v1/models`).
* **Real free Hermes model.** All reading tests use a stand-in AI. Real answers may be slower, shorter or
  differently shaped.
* **Real meaning-search scores** (the nomic model could not be downloaded here), **Windows install**, and
  the junk filter against your *whole* vault (it was checked against the lines you showed me).
