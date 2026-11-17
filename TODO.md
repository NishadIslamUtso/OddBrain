# ⏳ TODO — READ THIS FIRST

*The top-of-mind list. Nothing lives only in a chat that can be compacted.
If you are an AI resuming work: read this file before anything else, update the
checkboxes as you go, and never drop an item. Owner decisions recorded in
`MEMORY_OB_MASTER_PLAN.md` (§5). **Latest build: update-15 (`c0494fe`) — the
A1–A12 build list is COMPLETE.***

**Status legend:** ☐ todo · 🔄 in progress · ✅ done · ❌ blocked/needs someone

---

## A. CODE FIXES (all shipped — update-8 … update-15)

- [x] **A1 · Not-life filter (TOP PRIORITY).** ✅ DONE in update-8
  (`release/Memory_OB-update-8.zip`): tool-talk, agent instructions, pasted
  reports, documentation text, server logs, internal notices, markdown
  tables/headings, review-marker lines, quoted-example prose, pasted note
  lines, underscore code identifiers — never memories. Raw conversations in
  Sources untouched. 3 new test suites (18 checks incl. real P5 junk).
- [x] **A2 · Junk-project guard.** ✅ DONE in update-8: `topics.
  valid_thread_title()` — report words (From/What/With/Note/Notes/Windows/
  Macos/Application/Imports/Independent/…) can never be project names, on
  both the AI-filing path and the word-matcher path. Real names pass.
- [x] **A3 · Wait-for-AI (owner decision D1).** ✅ DONE in update-9: the
  silent rules fallback is dead. A helper that fails/blank/refuses/unreadable
  → the message is kept WHOLE + the plain line "The AI helper did not answer
  properly, so I kept this aside", re-read when a helper returns or via Tidy
  now. Rules keep ONLY safety jobs (secret-hiding, forget commands). 9 new
  contract tests; 3 old fallback tests rewritten; 21 suites aligned.
- [x] **A4 · Feed clearing + 4th answer (owner decision D2).** ✅ DONE in
  update-10: "Got it" on every feed card + "Clear all" for the "Recently
  remembered" list (list only — memories and history untouched); conflict
  cards answer with FOUR buttons incl. **"Neither / none of these"** (both
  versions go away, old one trashed = undoable). 6 new tests.
- [x] **A5 · Stable splitting.** ✅ DONE in update-12: one canonical cut —
  the same dump files the same memories however the AI helper hands it over
  (continuation lines never become their own memories). 6 tests.
- [x] **A6 · One-time vault junk clean-up.** ✅ DONE in update-11: Settings
  → "Clean up old junk" (shows count, asks first) — the not-life junk moves
  to the trash (undoable, never deleted); stray-word folder names ("From",
  "What"…) cleaned while the memories inside stay; real projects untouched.
- [x] **A7 · Settings honesty fix.** ✅ DONE in update-8: automatic mode no
  longer shows the fake `11434` default; the meaning-search model shows its
  real address (18435 llama.cpp); and the hidden bug is fixed — saving
  Settings used to ERASE the meaning model's server address (that is how the
  wrong address appeared). Plus the honest **"Delete all data"** (shipped in
  update-11): backs up first (never the key), deletes nothing without a
  copy, all in plain words.
- [x] **A8 · Engine install to a permanent home.** ✅ DONE in update-12:
  install.ps1 moves the engine to `Documents\Hermes\Memory_OB-engine` when
  found in Downloads/temp, re-points `plugins\memory_ob\.memory_ob_home`,
  and retires the old copy into `_retired/` (never deleted). 3 end-to-end
  tests run the real installer. *(Owner still needs to RUN update-12/15's
  installer once — that is B3 below.)*
- [x] **A9 · Monthly check-up summary.** ✅ DONE in update-13: about once a
  month the Review screen shows one short "how your memory is doing" card
  (totals, what is new/corrected/put aside, what is coming back to, what
  waits for you); Settings → "How is my memory doing?" answers any time.
  5 tests.
- [x] **A10 · Second opinion coverage.** The AI second opinion now covers
  stale to-dos and broken-proof findings too (not just disagreements/
  repeats) — false alarms set aside, rules' word stands with no answer —
  **shipped in update-14**.
- [x] **A11 · Update-6 recovery.** ✅ CLOSED — the lost work was on GitHub
  all along (update-5→7 diff on the `claude--made` branch); every source
  line and test of that window survives in today's program (or was later
  extended, never dropped); its one known fix (B5 "review clears after
  answering") confirmed present and tested. No re-upload needed — see
  `release/UPDATE-6-RECOVERY.md`.
- [x] **A12 · Test-kit fresh-install fix.** ✅ DONE — the test extra now
  carries both package names with working ranges (`httpx2` + `httpx<0.29`);
  one `pip install -e ".[test]"` sets up a fresh machine completely
  (verified: fresh venv, 49 suites green, zero manual steps) — **shipped in
  update-15**.

## B. OWNER ACTIONS (small, one paste each)

- [x] **B1 · WSL removal** — owner is uninstalling it (never needed).
- [ ] **B2 · Tell Hermes (paste once):** `From now on use PowerShell only.
  Never run bash, sh, or wsl commands.`
- [ ] **B3 · Live with update-15** (run its `install.ps1` once — it also moves
  the engine to `Documents\Hermes\Memory_OB-engine`): real info-dumps, real
  chats; report any junk or misfiling with the exact words you used.
- [ ] **B4 · Reboot** (optional — only to finish the WSL uninstall cleanly).

## C. VERIFICATION (Hermes prompts, after update-15 is installed)

- [ ] **C1 · Re-run the P5 filing test** (bakery message) + then check the
  Vault for junk: no logs, no agent text, no From/What/With projects. Paste
  the Vault note titles back.
- [ ] **C2 · In-Hermes screen speed** (the path we could not time from
  outside): click through the six screens and say if they feel instant.
- [ ] **C3 · Feed clearing check:** answer a card, press the new "Got it" /
  "clear all" — does "Recently remembered" actually empty?

## D. STANDING RULES (never do these)

- PR #12's two red security checks (CodeQL + npm audit) are the **retired
  old app's** debt, accepted by the owner (decision D5) — expected red, do
  not "fix" them; details in `release/PR12-SECURITY-FINDINGS.md`.

- No ask-before-save switch · no approval-card queues · no batch/retry chores ·
  no conversation-project linking · no Monthly Audit PAGE · no 12-folder
  shelf · no chapter-approval flow. (Old rulebook = retired.)
- A memory must never claim the owner approved it when they did not.
- Agents on the owner's machine: PowerShell only, never bash/WSL.
- Projects (personal ideas like the bakery) STAY. "Projects banned" = the old
  conversation-projects idea only.

---

*Update this file every working turn. Done items move to the ✅ log at the
bottom with the date. When the context is compacted: this file is the memory.*
