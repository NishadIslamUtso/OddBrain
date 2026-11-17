# ⏳ TODO — READ THIS FIRST

*The top-of-mind list. Nothing lives only in a chat that can be compacted.
If you are an AI resuming work: read this file before anything else, update the
checkboxes as you go, and never drop an item. Owner decisions recorded in
`MEMORY_OB_MASTER_PLAN.md` (§5). Latest build: update-7 (`4d644ba`) — this list
produces **update-8**.*

**Status legend:** ☐ todo · 🔄 in progress · ✅ done · ❌ blocked/needs someone

---

## A. CODE FIXES (build update-8 from `claude--made` @ 4d644ba)

- [ ] **A1 · Not-life filter (TOP PRIORITY).** Tool-talk, agent instructions,
  pasted reports, documentation text, server logs (`INFO: 127.0.0.1:…`), and
  system notices ("do not treat as user input") must NEVER become memories.
  High-precision patterns first: HTTP/terminal log lines · explicit internal
  notices · code/terminal lines (`git grep`, `pip install`, `def test_`, …) ·
  markdown table rows · agent instruction boilerplate ("Change nothing.",
  "Report exactly…", "Screenshot →", "Copy-paste") · system tags
  (`vision_analyze`, `[INTERNAL NOTIFICATION`). Raw conversations in Sources
  are untouched (nothing is lost). *(Found by owner's P5 vault dump 2026-11:
  my own audit text in Health, drafts in To-do, server logs in Notes.)*
- [ ] **A2 · Junk-project guard.** A project starts ONLY from clear project
  wording ("my … business/project/idea", "an app/site/game called X"). Never
  from stray nouns. Plus a stopword-title guard (never a project named From,
  What, With, Note(s), Windows, Macos, Application, Imports, Independent).
- [ ] **A3 · Wait-for-AI (owner decision D1).** Kill the silent rules fallback:
  if the AI helper fails/unreadable, the message is kept whole + shown as
  "The AI helper did not answer properly, so I kept this aside", re-read later
  (helper returns / Tidy now). Rules keep ONLY safety jobs (secrets,
  quote-backing, private/never-send). Never chop into fragments.
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
- [ ] **A7 · Settings honesty fix.** "Where your AI server is running" shows
  `http://127.0.0.1:11434` (Ollama default) while the embed model actually
  uses `http://127.0.0.1:18435/v1` (llama.cpp). Show the address actually in
  use, per slot.
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
