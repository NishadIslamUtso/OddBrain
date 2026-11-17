# ⏳ TODO — READ THIS FIRST

*The top-of-mind list. Nothing lives only in a chat that can be compacted.
If you are an AI resuming work: read this file before anything else, update the
checkboxes as you go, and never drop an item. Owner decisions recorded in
`MEMORY_OB_MASTER_PLAN.md` (§5). Latest build: update-7 (`4d644ba`) — this list
produces **update-8**.*

**Status legend:** ☐ todo · 🔄 in progress · ✅ done · ❌ blocked/needs someone

---

## A. CODE FIXES (build update-8 from `claude--made` @ 4d644ba)

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
- [ ] **A5 · Stable splitting.** The same run-on dump must file the same way
  every time (currently 1 memory vs 4 between runs — reproduced on update-5
  and update-7). Deterministic clause-splitting when the AI result is
  empty/unstable.
- [x] **A6 · One-time vault junk clean-up.** ✅ DONE in update-11: Settings
  → "Clean up old junk" (shows count, asks first) — the not-life junk moves
  to the trash (undoable, never deleted); stray-word folder names ("From",
  "What"…) cleaned while the memories inside stay; real projects untouched.
- [x] **A7 · Settings honesty fix.** ✅ DONE in update-8: automatic mode no
  longer shows the fake `11434` default; the meaning-search model shows its
  real address (18435 llama.cpp); and the hidden bug is fixed — saving
  Settings used to ERASE the meaning model's server address (that is how the
  wrong address appeared).
- [ ] **A8 · Engine install to a permanent home.** install.ps1 must place the
  engine in `Documents\Hermes\Memory_OB-engine` (not Downloads), re-point
  `plugins\memory_ob\.memory_ob_home`, and retire Downloads copies into
  `_retired/` (never delete). *(Owner's engine currently lives in
  `Downloads\Memory_OB-update-7` — clean Downloads = death.)*
- [ ] **A9 · Monthly check-up summary.** Nightly check-up exists; add the
  monthly roll-up (what was found/fixed/asked that month).
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
- [ ] **B3 · Live with update-8** when it lands: real info-dumps, real chats;
  report any junk or misfiling with the exact words you used.
- [ ] **B4 · Reboot** (optional — only to finish the WSL uninstall cleanly).

## C. VERIFICATION (Hermes prompts, after update-8)

- [ ] **C1 · Re-run the P5 filing test** (bakery message) + then check the
  Vault for junk: no logs, no agent text, no From/What/With projects. Paste
  the Vault note titles back.
- [ ] **C2 · In-Hermes screen speed** (the path we could not time from
  outside): click through the six screens and say if they feel instant.
- [ ] **C3 · Feed clearing check:** answer a card, press the new "Got it" /
  "clear all" — does "Recently remembered" actually empty?

## D. STANDING RULES (never do these)

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
