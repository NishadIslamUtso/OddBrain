# WHAT EXISTS — the real state of every surface

> Replaces the earlier two-doc setup (HANDOVER.md + DECISIONS.md were bloat —
> this one file is the truth). Every surface of the app, three columns:
> **what it does now · why it is kept · its honest state** (works / works-with
> gaps / broken-and-how / unproven). Written 2026-10-18.
> 113 test files / 822 tests, tsc clean, build green, smoke clean, CI green.
> Rebuilt 2026-10-18 on the session UI: the offline window is
> `resources/oddbrain-preview.html` (517,020 B, no external runtime or fonts).

---

## 1. THE CORE — works

| Surface | What it does · why it is like that | State |
|---|---|---|
| **The turn** | One send path for everything. Words stream live; thinking folds; a file-touch raises a card with the real diff/command → **Allow** takes the old file copy FIRST (failed keep ⇒ deny, never allow blind) → **Deny** reaches the engine as a real deny → every change **Restore**-able byte-exact, including brand-new files. Gears: Ask me / Plan first / Auto-edits / Full speed (Full speed turns cards off and says so on the gear itself). | **Works.** Proven against real claude v2.1.300+ (deny needs `message`; `manual`+`stdio` makes the CLI ask). Not yet proven by YOU on the TUF A15 with a signed-in claude — that is the acceptance bar. |
| **claude-code engine** | Spawned by absolute path, shell-quoted (your username has spaces — three bugs taught this), machine PATH merged from the registry, staged-folder probes first. Empty model = engine runs as itself (the invented `gemma4:cloud` is banned and migrates out of saved settings). Named brain rides its door; no brain forces no door (the retry-forever bug is dead; from retry 3 the line tells you to sign in). | **Works** (detection + launch + wire proven locally & CI). A **signed-in live turn on your machine is still unproven** — you have not run it yet. |
| **agy engine** | Same detection/launch care. Wire implemented (stdin stream-json, `--conversation` resume, reads `event:'result'`). Pictures refused with a spoken reason (its picture shape is unverified). Model list appears only signed-in (plan-gated by Google). | **Works-with-gaps:** a signed-in live turn was **never driven** — recorded unproven until you run it. |
| **Ollama (local brains)** | Not an engine — the free brain server. The app knocks `127.0.0.1:11434` and counts the brains. **At boot it now starts the server itself** — your INSTALLED copy first (`%LOCALAPPDATA%\Programs\Ollama\ollama.exe`, then PATH scan, staged copy last) — so the desktop app quitting fully no longer means no door. Stop kills only what the app started (pid in `userData/ollama/serve.pid`). "Model stays loaded" = `OLLAMA_KEEP_ALIVE=-1` (a JSON number — the string form is invalid), a machine flag + runtime env. | **Works** (unit-proven: found/start/honest-answer tests; server-side proven live). **Downloader fixed in code 2026-10-18** (runtime unpack limits 512 files / 1.5 GB per file / 4 GB unpacked, streamed progress); awaits your machine. |
| **Permission cards + checkpoints** | The heart of "reviewable, undoable". Card shows tool, summary, diff/detail. Checkpoint index writes are queued per folder (30 concurrent = 30 records). | **Works** (the CI flake here was root-fixed: waits on real events, not sleeps). |
| **Restore / Activity journal** | Every change journaled; restore is byte-exact; handoff writes the turn into the vault AND copies it. | **Works.** |

## 2. THE SCREENS — what is really on each

| Screen | What is on it · why | State |
|---|---|---|
| **Chat** | Transcript with streaming, thinking blocks (collapsed until you open one — then always open, one shared flag), find-in-conversation (max 6 hits), rewrite with versions, read aloud on replies (the window's own voice, queued in sentence-sized pieces so a long answer is not cut off after fifteen seconds), caret, quiet scrollbars, mascot pairing words (flavour, never replacing the honest state name). | **Works.** The scroll chain is PROVEN by the smoke run on every build (it forces overflow and demands real movement — your "chat doesn't scroll" bug can't return silently). |
| **Engine strip** (above composer) | The turn's record: engine · model · vault · phase · tokens; Stop/Copy/Edit/Hand off/Compact/Review; the work line when busy. **Collapsible** (your wish), **force-unfolds while a permission waits** (Allow can never hide). | **Works.** |
| **Composer** | Model menu leads with "the engine's own choice — its own login", then only machine-produced models (cloud chips / GB sizes); engine picker states "not installed" in words, never a dot; attachments; dictation; project picker; global busy→queue ("In the line"). Attachments decode by kind, not by extension: any window-readable picture becomes PNG, PDFs are read only when they carry a text layer, docx/xlsx/pptx report what they left out, audio is refused with its measured length, and nothing is silently sent to a provider that cannot read it. | **Works** (54 pins across decode, speech and storage). |
| **Sidebar** | Search, New chat, nav (Chat/Artifacts/Today/Projects/Vault/Brain), honest "No conversations yet", profile row (initials + idle mascot) into Settings. | **Works.** |
| **Engine bay** (Settings→Engine) | Engine cards with `installed · 2.1.302` on the face, path on hover, **Re-scan** (skips the 30s cache; detection probes npm dir, `.local\bin`, Programs, and the app's staging ground FIRST); downloads column; watch setup; model/gear/vault pickers. | **Works** for detection+launch. The downloads column's Ollama button now uses the runtime unpack limits, so the official 1.47 GB archive is accepted. |
| **Connectors** | Three cards (Claude Code / agy / Ollama): the machine's actual answer in words + the one action that improves it (Use this engine / copyable install line / official page / knock on 11434 and count brains). **Check all** re-asks every door. Ollama card: **"Start the brain door"** starts the found binary (your installed copy first) and says which copy answered; install-it-yourself route stays (`winget install Ollama.Ollama`, copyable). Claude Code + agy cards: **"Point to the exe…"** — pick the binary in a dialog; it persists in `userData/engine-binaries.json`, beats every probe and every launch; **"Use automatic detection"** clears it; re-validated at boot. | **Works** (99-file suite covers find/start/override paths). On YOUR machine still to be seen live: agy via the pointed exe, Ollama auto-start — you run the newest build and check. |
| **Vault view** | Folder choose/default, structure seeding (00 System…10 People, templates, CLAUDE.md/AGENTS.md rulebooks), conflict settle (Keep-mine/Use-new/Both/Combine, recorded), link checks (dead/ambiguous; templates exempt). | **Works** (tested). Unproven on your machine at real scale. |
| **Brain view** | Memory map: canvas force graph — resolved links only, 400-node cap; details compressed collapsible. | **Works** (1 test). Cosmetic scale unproven. |
| **Artifacts** | Every engine-written file previews (HTML/MD/code/SVG/charts), pop-out window, PDF export, rewrite with versions + restore, artifact styling with the 16 design token sets. | **Works** (many tests). PDF path unproven on your machine. |
| **Today** | Day view from the vault/journal. | **Works** (3 tests). Thin — it is the least-developed screen. |
| **Projects** | Group work by project; composer rides the project. | **Works** (5 tests). |
| **First run** | 3 steps: name (prefilled from the machine — your `""` lesson), engine pick (real detection), vault folder (default one click). Animated brain greets. | **Works.** |
| **Quick-ask window** | Global hotkey, minimal box, "the same engine, the same cards". Menu bar: every item does a real thing. Single instance (second launch focuses the first). | **Works** (hotkey unproven on your machine). |

## 3. THE FEATURE PANES (Settings)

| Pane | What · why | State |
|---|---|---|
| **Appearance** | **Design system gallery FIRST** — all 16 (Claude, Linear, Apple, Stripe, Notion, Vercel, Airbnb, Glassmorphism, Neobrutalism, Editorial, Retro, Dashboard, Shadcn, Minimal, Modern, Default) applied to EVERY screen via the app's tokens (palette/type/radii/shadows); system owns accent+reading type while active; one look at a time. Then: theme, 5 accents (WCAG-checked ink), width, text size, font, motion (System/Calm/Balanced/Playful/Still), mascot words, row explanations. | **Works** (7 dedicated tests; whole-token-set pin so a skeleton can't return). |
| **Connectors** | See §2. | **Works.** |
| **Agent access** | Per-provider enables + capture switch; keyed providers are the ones a permission can govern. | **Works.** |
| **Hooks / House rules / Recipes / Skills catalog / Memory** | Hooks = tool-call hooks; House rules = deployed rulebooks; Recipes = reusable orders; Skills catalog = deploys real skills into the engines' own skill folders; Memory = the pass button (goes through the one send path). | **Work** (tested). Real-data runs on your machine: unproven. |
| **Watch** (bay) | Folder change → order after quiet; deletions don't fire; its own writes suppressed one cooldown. | **Works** (tested). |
| **Plugins/Mods** | Pack store: folder+https indexes, sha-256 digests, tamper refusal BEFORE install, starter/looks/prompt-starters/anthropic-skills shipped, export-as-pack, pack themes = FULL stylesheets (anti-skeleton law, tested). | **Works.** Store phase 2 is built into this panel: a source picker asks the installed engine what its own `plugin marketplace` command documents (read-only, 6 s), shows the engine's answer unchanged, and runs `claude plugin marketplace add` only after a confirm card showing the exact line. agy has no documented marketplace command and the panel says so. **Unproven against a real claude binary** — the A15 run is still the bar. Phase 3 (agy catalog) is blocked upstream: Google has shipped no catalog. |
| **Models / Performance / System** | Provider keys (ride the ENGINE's env; machine credentials stripped; clearing a key stops only an engine launched with THAT key), inference sizes to your 8GB/4GB, startup/warm/keep-loaded machine flags. | **Works** (tested; keep-alive number-form per Ollama FAQ). |
| **Browser control** | Playwright-MCP driving through the engine. | **Works-with-gaps:** unproven live. |

## 4. BROKEN / GAP LIST — the honest one

1. **In-app Ollama download — fixed in code 2026-10-18, unconfirmed on your machine.** Measured 2026-10-17: the zip is **1.47 GB**, unpacks to **1.94 GB**, biggest file **692 MB**. The old unpack step used pack-sized limits (200 MB/file, 400 MB total) and refused the archive. Runtime downloads now carry their own limits (512 files / 1.5 GB per file / 4 GB unpacked), stream progress every 250 ms, and abort cleanly on the cap. The RUNNING problem is also fixed independently: the app starts your installed Ollama at boot. Your machine still has to confirm the download.
2. **Store phase 2 is built; phase 3 is blocked upstream.** Phase 2 (Claude Code marketplaces) is a read-only probe of the installed engine's own help plus a confirm card before its own `add` command runs. It is unproven until it meets a real signed-in claude binary. Phase 3 (agy catalog) has nothing to integrate: Google has shipped no catalog for the CLI.
3. **agy signed-in live turn — never driven.** The wire is built and unit-proven; the real thing is not. **agy-not-found on your machine — fixed in code 2026-10-18:** "Point to the exe…" on the agy card, pick `agy.exe` once, it persists and beats every probe; if the auto probe still misses, the pointed exe is used. Awaiting your machine.
4. **The full acceptance checklist is unrun** — real turn → Allow/Deny → Restore → always-loaded → startup → extension capture, by YOU, on the TUF A15, on the newest build. This is the actual bar for "works".
5. **CI has two known flakes** (fixed-sleep races). One is root-fixed (`engine-media`). Protocol if one shows: identical commit green on the other branch ⇒ re-run failed jobs before suspecting code.
6. **Unsigned installer** — Windows shows "unknown publisher". No certificate exists; stated, not hidden.
7. **The two real-machine bugs you reported 2026-10-18 — FIXED IN CODE, pending your machine.** ① App found no Ollama and the desktop app quits fully, so you had to run `ollama serve` by hand → now the app starts your installed copy at boot (`%LOCALAPPDATA%\Programs\Ollama\ollama.exe` → PATH → staged copy), the Ollama card has "Start the brain door", and the honest answer names which copy started. ② agy not found → "Point to the exe…" on the agy card persists your pick in `userData/engine-binaries.json` and it beats every probe/launch; "Use automatic detection" undoes it. Both covered by 7 new tests (99 files / 723 total). Install the newest CI artifact and check on the TUF A15 — that closes them for real.

## 5. THE LAWS (kept, and what made me keep them)

- **Honesty over polish** — your "fake green dots / fake model names". Words, never colored claims; no invented names; retries name the fix; crashed panes speak (error boundary). Kept because one lie costs more than ten features.
- **"Not your skeleton"** — themes carry the ENTIRE style; a test refuses shipped themes without stylesheets.
- **Engines are exactly two**; Ollama is a brain server. Your law.
- **The engine installs its own things** (marketplaces via its own carded commands — never hand-copied folders).
- **Capture everything, default ON** (blocklist honored; your overrule of the judges, twice).
- **Desktop only · English only · local-first · no telemetry**; the interface must work with no connection.
- **One landing = one commit** to both branches; CI is the truth; artifacts are the only builds you install.
- **Your machine is the acceptance lab.** CI-green ≠ world-clean.

## 6. SECURITY WALLS (each behind a real attack — kept because each was earned)

Parsed-origin IPC guard (a judge's `@attacker.example` smuggle killed the regex version) · navigation lock · extension pairing token (401 + drop, never queue page content without consent) · outbox semantics (200 delivered / 401-403 drop with metadata / 5xx keep — the old flush deleted on any error) · manifest loopback grant (the relay literally had no permission) · classic sendResponse (Promise-onMessage breaks pre-148 Chromium) · checkpoints before Allow · per-folder queued checkpoint index (30 concurrent = 30 records) · zip walls (declared AND measured caps; traversal refused; a forged zero once smuggled real bytes) · download pins by host (publishers' own redirects once broke byte-exact pins) · command arrays + `MODEL_PATTERN` + shell-quoting only on Windows engine spawns · Electron fuses · CSP (no remote anything) · loopback-http interface (never `file://`).

## 7. NUMBERS (measured, kept because they are the machine's truth)

Ollama zip **1.47 GB → 1.94 GB, 87 entries, max 692 MB** · download cap **2.5 GB** · runtime unpack limits **512 files / 1.5 GB per file / 4 GB unpacked** · stderr tail **600 chars** · detection cache **30 s** · PATH re-read **5 min** · a11y caps **400/12/120 announced** · memory graph **400 nodes** · find bar **6 hits** · thinking budget **31999 (Extended only)** · keep-alive **-1 (number)** · installer **~96 MB, en-US only, one click, keeps your data on uninstall**.

---

*This file is the single truth now. HANDOVER.md and DECISIONS.md are superseded
by it and should be deleted in the next landing unless you want them kept.*
Update it every landing — a stale truth-file is a lie with better manners.
Written at `7ad6b7c`, 2026-10-17.
