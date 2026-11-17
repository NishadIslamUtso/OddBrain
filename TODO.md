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
- [ ] **A4 · Feed clearing + 4th answer (owner decision D2).**
  (a) "Got it" clear button on cards; (b) "clear all at once" for the
  "Recently remembered" feed; (c) conflict cards answer with FOUR buttons:
  Keep new · Keep old · Keep both · **Neither / none of these**.
- [ ] **A5 · Stable splitting.** The same run-on dump must file the same way
  every time (currently 1 memory vs 4 between runs — reproduced on update-5
  and update-7). Deterministic clause-splitting when the AI result is
  empty/unstable.
- [ ] **A6 · One-time vault junk clean-up.** Sweep the junk lines (same
  classifier as A1) out of existing notes: listed first, `--apply` removes
  with an undo log. Owner presses the button; nothing permanent.
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
- [ ] **A10 · Second opinion coverage.** Extend the AI second opinion to
  stale to-dos and broken-proof findings (now covers disagreements/repeats
  only).
- [ ] **A11 · Update-6 recovery.** Find out what update-6 was (zip exists
  only on the owner's machine per P1: extracted folders for update-2/5/7
  only) — confirm nothing unique was lost between 5 and 7, or re-upload it.
- [ ] **A12 · Test-kit fresh-install fix.** pyproject test extra must include
  the renamed test package (`httpx2`) or pin starlette — fresh machines trip
  on it every time.

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
