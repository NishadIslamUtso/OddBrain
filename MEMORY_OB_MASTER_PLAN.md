# MEMORY_OB — The One Plan

*One page for every builder and judge. Written in plain words. Replaces the old
rulebook (BRAIN_PROMPT.md) as the working plan — that old document describes the
EARLIER design (approval cards, chapter drafts, chore queues). That design is
retired. Do not build its queues.*

**Status:** owner vision confirmed 2026-11 · builds live on branch `claude--made`
(the one the owner actually uses) and branch `hermes` (older parallel build).
Latest build: update-7 (`4d644ba`), 40 test suites green. Update-6 never reached
GitHub — ask where it went. **Live checklist: `TODO.md` — read it first; it is
the top-of-mind list that survives context compaction.**

---

## 1. What this product IS

The owner's words, kept whole:

> I just want everything smartly done by AI, the AI manages memory completely.
> You get one screen: a "recently remembered" feed that I can glance at or
> ignore. Everything else is hidden. No Review chores, no Inbox queue, no
> confirmations except genuine conflicts and doubts. I info-dump, it files
> smartly. Undo on everything.

Six screens, and only these: **Review** (the feed + genuine questions + search),
**Vault** (real Obsidian-style: collapsible tree, live graph, backlinks, Ctrl+O),
**People** (everyone, across platforms, owner says who is the same person,
"this is me"), **Journal** (biography + dated moments), **Me** (current life:
to-do, projects/ideas, coming-back-to dates), **Settings** (model = automatic by
default, only options that really work, look-and-feel follows the app).

How big memory apps stay accurate (Claude app, ChatGPT — owner's question):
a strong model decides everything with full context, the saved set stays small
and visible, mistakes get corrected in one click. Rules never lead.
**Memory_OB must work the same way: AI first, rules only as a safety net**
(secrets, quote-backing, private/never-send).

---

## 2. What WORKS today (all judges agree)

- The six screens exist, readable in light and dark, plain wording, no fake options.
- One summary card per info-dump ("Saved 7 things"), per-line undo + Undo all.
- "This is me" owner profile. Every save honestly says who did it (AI's saves
  marked as the AI's, owner's edits as the owner's). Nothing pretends the owner
  approved something they did not. **Keep this forever.**
- Check-up ("Worth a look"): disagreements, repeats, stale to-dos, quotes that
  no longer match their source; nightly + "Check now" + `memory-ob sweep`;
  answers remembered; second opinion from the AI helper on disagreements/repeats.
- Keep-everything-on-this-computer is hardened (fake addresses, redirects,
  environment tricks all refused).
- Secrets blanked before storing (rest of the message kept); "forget that…"
  works in chat; Keep-private with leak fixes; imports (ChatGPT, Claude,
  WhatsApp, Telegram, Messenger, Instagram, notes) with undo-import; uninstall
  with backup; Hermes notes sync (fixed); wrong-screen bug (fixed); screens
  speed fix (code side); projects/ideas notes; people join/un-join; night tidy.

---

## 3. What is BROKEN (every complaint, by who found it)

| # | Problem | Who found it |
|---|---|---|
| B1 | **The silent fallback mess (root cause).** When the AI helper fails or answers in a shape the code cannot read, simple rules quietly cut the message into sentence fragments and file them AS IF the AI had filed them → unrelated pieces, wrong tags, no connections, doubts about meaningless fragments | Owner (symptoms) + Claude (found the cause) |
| B2 | **Splitting is unstable.** The same run-on dump files as 1 memory one time and 4 memories another time (reproduced on update-5 AND update-7 — not a regression, it is inconsistency) | Other judge |
| B3 | **Undo does not clear.** A greyed "Undone" row stays on the feed | Owner + other judge |
| B4 | **Dumb doubts.** Questions fire from loose word rules (any different number, any opposite word) about fragments; not real conflicts | Owner |
| B5 | **Review does not clear after answering** (owner says; update-6 claimed a fix) — the fix is confirmed present in the current program and locked by tests (A11, `release/UPDATE-6-RECOVERY.md`); real-machine glance remains a C-section verify | Owner |
| B6 | **Never run inside real Hermes on Windows.** Installer untested there. Every "green" so far is workshop testing | All |
| B7 | **Engine lives in `Downloads\Memory_OB-update-2`.** Clean Downloads → Memory_OB dies | Other judge |
| B8 | **Meaning search unconfirmed on the owner's machine** ("isn't it semantic?? why still weak") | Owner + me |
| B9 | **Update-6 never reached GitHub** — work exists only as a zip somewhere — ✅ **closed by A11**: the work was on GitHub all along (update-5→7 diff on the `claude--made` branch) and nothing unique was lost; see `release/UPDATE-6-RECOVERY.md` | Me |
| B10 | Second opinion covers disagreements/repeats only — not stale to-dos or broken-proof findings | Other judge |
| B11 | Test kit trips on a renamed test package on fresh machines (builder pain) — ✅ **fixed in update-15** (A12): both package names with working ranges in the test extra; fresh setup = one command | Me |
| B12 | Filing accuracy with the free Hermes model is the real gap vs Claude/ChatGPT memory | Owner + Claude |

---

## 4. THE PLAN (build in this order)

1. **Kill the silent fallback (B1). — APPROVED (D1: wait).** If the helper
   does not answer properly, NOTHING is cut into pieces. The message is kept
   whole and unread, shown as *"The AI helper did not answer properly, so I
   kept this aside"*, and read later (when the model returns, or on "Tidy
   now"). Rules never decide what to save again (they keep only their safety
   jobs: secrets, quote-backing, private/never-send).
2. **AI-first filing (B12).** The model reads every message and decides: who is
   it about, what is lasting, what is a moment, what conflicts. Rules keep only
   the safety jobs: secrets, quote-backing ("your own sentence must back it"),
   private/never-send. This is the change that makes it behave like Claude/ChatGPT.
3. **Stable splitting (B2).** The same input must file the same way every time.
4. **Smart doubts only (B4).** Ask ONLY for a real conflict — same fact, new
   value ("I live in Dhaka" / "I live in Sylhet") — and, when a helper is up,
   only when the helper agrees. The card shows your ORIGINAL sentences, never
   fragments. Loose guesses stay silent; both memories are kept.
   **Conflict cards get FOUR answers** (owner decision D2a): Keep new ·
   Keep old · Keep both · **Neither / none of these** (both are wrong —
   discard the new statement and put the old one aside as disputed).
5. **Clearing (B3, B5) — owner decision D2b.** A "Got it" clear button on
   cards, AND a "clear all at once" option for the feed. No greyed leftovers.
   Shipped in update-10; the "clears after answering" half is confirmed fixed
   and tested in the current program (A11, `release/UPDATE-6-RECOVERY.md`).
6. **Test button in Settings (B12).** Sends one sample message through the real
   Hermes model and shows exactly what came back (answered? filed right? raw
   reply). This tells the truth about whether the free model can do this job.
7. **Extend second opinion (B10)** to stale to-dos and broken-proof findings.
8. **Move the engine out of Downloads (B7)** — installer places it permanently
   (e.g. `Documents\Hermes\Memory_OB-engine`) and re-points the plugin.
9. **Monthly check-up summary** (nightly exists; add the monthly one).
10. **Verify on the real machine (B6, B8)** — see the Hermes prompts below.

---

## 5. Decisions — mostly SETTLED by the owner (2026-11)

- **D1 — when the AI is down: WAIT. ✅ DECIDED.** "It takes all and keeps it,
  then waits for the AI." Nothing is chopped by rules ever again. The message
  is kept whole and unread until the AI can read it (or "Tidy now" is pressed).
- **D2 — clearing: ✅ DECIDED.** A "Got it" clear button **plus** a
  "clear all at once" option. And conflict cards answer with **four** buttons:
  Keep new · Keep old · Keep both · **Neither / none of these**.
- **D3 — replace the `Documents\Hermes\Workspace` code copy with a fresh
  download? ✅ DECIDED — YES (2026-11-18).** The owner approved
  re-downloading the code copy into `Documents\Hermes\Workspace`. It is only
  about a code-copy folder — no memories are involved. This unblocks the
  judge/audit workflow that reads the code from there.
- **D4 — ✅ CONFIRMED.** No "ask me before saving" switch; no hiding other
  people's chats from the AI. **"What I decided with Claude stays"** — all
  owner decisions made in the Claude sessions stand.

**Backup location (owner question, answered from code):** clicking
**Make backup** writes a zip into `Memory_OB\.brain\backups\` — a hidden
folder INSIDE the memories folder. Settings shows the last 5. Nothing is
deleted; a restore always unpacks into a fresh folder.

---

## 6. Prompts for Hermes (copy-paste, one at a time)

Run these in Hermes on the real machine. Each says what to report.

**P1 — what is installed and where**
> In PowerShell run: `Get-ChildItem 'C:\Users\Nishad Islam Utso' -Recurse -Filter 'Memory_OB-update-*.zip' -ErrorAction SilentlyContinue | Select-Object FullName`
> Then find the Memory_OB folder the app actually runs from and read its RELEASE_FILES.txt first line (or README.md first line). Report: the list of zips found, the full path the app runs from, and that first line. Change nothing.

**P2 — is meaning search alive**
> In Memory_OB Settings, copy the exact text of the "meaning search" switch and the model name field. In PowerShell run: `Get-Process | Where-Object { $_.ProcessName -like '*ollama*' -or $_.ProcessName -like '*llama*' } | Select-Object ProcessName`. Then search in Memory_OB for the word `employer` and report exactly which lines come back. Change nothing.

**P3 — the Review clear bug**
> Open Memory_OB → Review. If any question card is showing, answer it with its first button. Take a screenshot and save it as `Documents\Hermes\Workspace\review-after-answer.png`. Then answer in plain words: does the card you answered still show? What does it look like now (greyed? "Undone"? nothing?)?

**P4 — the undo clear bug**
> Open Memory_OB → Review. Find any remembered line with an Undo button and press Undo. Screenshot → `Documents\Hermes\Workspace\undo-after.png`. Answer: is the row still visible? What text does it show now?

**P5 — the filing test (the most important one)**
> In Memory_OB → Review, paste this exact message into the top box and send it: `My bakery budget is 5 lakh. I am learning Rust for the bakery app. My knee hurts when I run.` Then open the Vault and list EVERY note title you see, with any line written under each. Report exactly what you see — do not clean it up.

**P6 — screens speed**
> Open each Memory_OB screen (Review, Vault, People, Journal, Me, Settings) one at a time and report roughly how many seconds each takes before its content shows. Plain numbers.

**P7 — which model is doing the work**
> Report exactly: (a) the AI helper/model name shown in Memory_OB Settings, (b) the model name Hermes itself is using right now. Copy both texts exactly.

---

## 7. Retractions (so nobody rebuilds the old chores)

The old rulebook items — approval cards for every memory, proposal cards with
retry, batch review, "create a profile?" asks, Life Story chapter drafts
waiting for approval, a Monthly Audit *page*, the 12-folder shelf, hash-chained
attics, "disputed" states — are **NOT missing features**. They belong to the
retired design (chore queues the owner explicitly rejected). Do not build them.

The ONE line kept from the old design: **a memory must never claim the owner
approved it when they did not** (now implemented as "who really said it" marks —
keep it).

Personal project/idea notes (the bakery, StudyBuddy) are WANTED. "Projects are
banned" referred to the old conversation-projects idea only. That confusion is
closed.
