# WHAT EXISTS — the real state of every surface

> Replaces the earlier two-doc setup (HANDOVER.md + DECISIONS.md were bloat —
> this one file is the truth). Every surface of the app, three columns:
> **what it does now · why it is kept · its honest state** (works / works-with
> gaps / broken-and-how / unproven). Written 2026-10-18.
> Integration status on `arena/9781cd95-oddbrain`, 2026-10-18: **115 test files / 802 passing tests**, typecheck and production/portable-preview builds green; six Chromium UI checks pass. This branch has not run CI or native Electron/Windows smoke, and no installer has been produced. The 99-file / 723-test figure is the original main snapshot, not this branch.

---

## 1. THE CORE — works

| Surface | What it does · why it is like that | State |
|---|---|---|
| **The turn** | One send path for everything. Words stream live; thinking folds; a file-touch raises a card with the real diff/command → **Allow** takes the old file copy FIRST (failed keep ⇒ deny, never allow blind) → **Deny** reaches the engine as a real deny → every change **Restore**-able byte-exact, including brand-new files. Gears: Ask me / Plan first / Auto-edits / Full speed (Full speed turns cards off and says so on the gear itself). | **Works.** Proven against real claude v2.1.300+ (deny needs `message`; `manual`+`stdio` makes the CLI ask). Not yet proven by YOU on the TUF A15 with a signed-in claude — that is the acceptance bar. |
| **claude-code engine** | Spawned by absolute path, shell-quoted (your username has spaces — three bugs taught this), machine PATH merged from the registry, staged-folder probes first. Empty model = engine runs as itself (the invented `gemma4:cloud` is banned and migrates out of saved settings). Named brain rides its door; no brain forces no door (the retry-forever bug is dead; from retry 3 the line tells you to sign in). | **Works** (detection + launch + wire proven locally & CI). A **signed-in live turn on your machine is still unproven** — you have not run it yet. |
| **agy engine** | Same detection/launch care. Wire implemented (stdin stream-json, `--conversation` resume, reads `event:'result'`). Pictures refused with a spoken reason (its picture shape is unverified). Model list appears only signed-in (plan-gated by Google). | **Works-with-gaps:** a signed-in live turn was **never driven** — recorded unproven until you run it. |
| **Ollama (local brains)** | Not an engine — the free brain server. The app knocks `127.0.0.1:11434` and counts the brains. At boot it starts the installed copy first (`%LOCALAPPDATA%\Programs\Ollama\ollama.exe`, PATH, then staged copy). Stop kills only what the app started. "Model stays loaded" uses `OLLAMA_KEEP_ALIVE=-1` (JSON number). | **Fixture-proven; Windows unverified.** The in-app downloader now has bounded large-runtime ZIP extraction and staged replacement. The actual 1.47 GB Ollama archive has **not** been installed in this sandbox; see §4. |
| **Permission cards + checkpoints** | The heart of "reviewable, undoable". Card shows tool, summary, diff/detail. Checkpoint index writes are queued per folder (30 concurrent = 30 records). | **Works** (the CI flake here was root-fixed: waits on real events, not sleeps). |
| **Restore / Activity journal** | Every change journaled; restore is byte-exact; handoff writes the turn into the vault AND copies it. | **Works.** |

## 2. THE SCREENS — what is really on each

| Screen | What is on it · why | State |
|---|---|---|
| **Chat** | Streaming transcript, thinking disclosure, find (max 6 hits), versioned rewrites, local-system-voice read-aloud on messages and completed engine replies (long answers chunked, Stop cancels), caret and honest scroll state. | **Browser + unit proven.** Scroll/turn checks pass in Chromium; native Windows voice availability and scroll behavior await the installed app. |
| **Engine strip** (above composer) | The turn's record: engine · model · vault · phase · tokens; Stop/Copy/Edit/Hand off/Compact/Review; the work line when busy. **Collapsible** (your wish), **force-unfolds while a permission waits** (Allow can never hide). | **Works.** |
| **Composer** | Model and engine pickers, project picker, busy queue, files and on-demand dictation. Text and bounded PDF/Office/EPUB content is extracted locally; pictures and sampled video frames go to a **verified** vision-capable selected model or to a saved, enabled provider only after an explicit per-file choice. Audio needs an explicit compatible provider; transcripts enter the draft or attachments, never a silent send. | **Browser workflow proven with mocked provider replies.** Encrypted/corrupt/unsupported files are refused; real provider transcription/vision, camera/mic hardware and provider costs await your machine. |
| **Sidebar** | Search, New chat, nav (Chat/Artifacts/Today/Projects/Vault/Brain), honest "No conversations yet", profile row (initials + idle mascot) into Settings. | **Works.** |
| **Engine bay** (Settings→Engine) | Real engine detection with Re-scan, downloads column, watch setup and model/gear/vault pickers. Download/extraction caps now account for the official Ollama runtime size; writes are staged with progress. | **Unit-proven**, not yet run against the entire official runtime archive or on your Windows install. |
| **Connectors** | Claude Code / agy / Ollama: real machine detection, re-scan, installed Ollama start, user-picked engine executable and reversible automatic detection. No decorative live indicators. | **Unit-proven.** agy path detection and Ollama auto-start need your installed Windows check. |
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
| **Appearance** | This session's eight looks and eight structural layouts, nine uploaded palettes plus app default, four styles, independent typography/size/width/accent/density/motion, saved mixes, exploration and a small Home/Chat preview. Main's 16 design systems remain available **in addition**, not instead; a named system still applies its full token set. Original motion assets remain. | **Browser + unit proven**, including a 1536×824 logical viewport, reduced motion and portable-preview export. Check the installed Windows app at 125% scale. |
| **Connectors** | See §2. | **Works.** |
| **Agent access** | Per-provider enables + capture switch; keyed providers are the ones a permission can govern. | **Works.** |
| **Hooks / House rules / Recipes / Skills catalog / Memory** | Hooks = tool-call hooks; House rules = deployed rulebooks; Recipes = reusable orders; Skills catalog = deploys real skills into the engines' own skill folders; Memory = the pass button (goes through the one send path). | **Work** (tested). Real-data runs on your machine: unproven. |
| **Watch** (bay) | Folder change → order after quiet; deletions don't fire; its own writes suppressed one cooldown. | **Works** (tested). |
| **Plugins/Mods** | One page with **labelled sources**. OddBrain keeps its folder/HTTPS checksum-pinned pack store and full-style themes. Claude Code marketplace sources are added only on explicit review; browsing, installing and updating run through the detected Claude Code 2.1.300+ CLI with exact-command cards. Marketplace-declared install commands need a **second** digest-pinned approval; no `--yes`, no auto-sync. | **CLI 2.1.302 verified in an isolated Linux fixture + unit/browser tests.** Windows binary/real community repo awaits your machine. No agy marketplace CLI has been verified; none is claimed or faked. |
| **Models / Performance / System** | Provider keys (ride the ENGINE's env; machine credentials stripped; clearing a key stops only an engine launched with THAT key), inference sizes to your 8GB/4GB, startup/warm/keep-loaded machine flags. | **Works** (tested; keep-alive number-form per Ollama FAQ). |
| **Browser control** | Playwright-MCP driving through the engine. | **Works-with-gaps:** unproven live. |

## 4. BROKEN / GAP LIST — the honest one

1. **Your Windows acceptance run is still due.** No signed-in Claude Code/agy turn, real permission/restore cycle, global shortcut, browser extension capture or installer run was performed on the TUF A15 in this session. The sandbox's Electron binary download redirects to a blocked release-asset host, so native Electron smoke and NSIS packaging could not be run here. The production renderer/main/preload builds and Chromium checks are not an installer.
2. **Ollama's official runtime archive is not yet proven end-to-end.** Measured archive: 1.47 GB compressed, 1.94 GB expanded, largest member 692 MB. The old 200 MB/file / 400 MB total unpack caps are replaced with bounded runtime limits (512 entries, 1,536 MiB/file, 4 GiB total), incremental hashing, staging and progress. Fixtures pass; the actual full archive must be tried on a machine with enough disk. `winget install Ollama.Ollama` remains a working alternative while that is checked.
3. **Live media providers and microphone hardware are unverified.** Chromium extracted a real PDF/DOCX and sampled real WebM frames; provider replies in that check were mocked. Local voices, provider keys/cost, real image descriptions and audio transcription must be tried in the installed app. Scanned PDFs with up to four pages render **all** pages locally; longer or unsafe files are refused, not partially presented as read.
4. **Engine-specific catalogues:** Claude Code 2.1.302's marketplace commands and second-command SHA approval were verified against its actual CLI in an isolated local fixture. The same path has not been exercised on Windows or with a real community repository. No verified agy marketplace command/catalog exists, so there is no agy store button to claim yet.
5. **Known baseline CI timing flakes and unsigned installer.** The full local 802-test suite passed; no CI was run on this branch. Windows will warn about an unknown publisher because no signing certificate is configured. Re-run failed CI jobs to distinguish an old fixed-sleep flake from a regression; don't call the branch CI-green before it runs.

## 5. THE LAWS (kept, and what made me keep them)

- **Honesty over polish** — your "fake green dots / fake model names". Words, never colored claims; no invented names; retries name the fix; crashed panes speak (error boundary). Kept because one lie costs more than ten features.
- **"Not your skeleton"** — themes carry the ENTIRE style; a test refuses shipped themes without stylesheets.
- **Engines are exactly two**; Ollama is a brain server. Your law.
- **The engine installs its own things** (marketplaces via its own carded commands — never hand-copied folders).
- **Capture everything, default ON** (blocklist honored; your overrule of the judges, twice).
- **Desktop only · English only · local-first · no telemetry**; the interface must work with no connection.
- **This Arena session uses only `arena/9781cd95-oddbrain`.** Commit locally when asked; do not push, open a PR or touch another branch without the owner's instruction. A build artifact and the owner's Windows run, not a browser preview, are the installation test.
- **Your machine is the acceptance lab.** CI-green ≠ world-clean.

## 6. SECURITY WALLS (each behind a real attack — kept because each was earned)

Parsed-origin IPC guard (a judge's `@attacker.example` smuggle killed the regex version) · navigation lock · extension pairing token (401 + drop, never queue page content without consent) · outbox semantics (200 delivered / 401-403 drop with metadata / 5xx keep — the old flush deleted on any error) · manifest loopback grant (the relay literally had no permission) · classic sendResponse (Promise-onMessage breaks pre-148 Chromium) · checkpoints before Allow · per-folder queued checkpoint index (30 concurrent = 30 records) · zip walls (declared AND measured caps; traversal refused; a forged zero once smuggled real bytes) · download pins by host (publishers' own redirects once broke byte-exact pins) · command arrays + `MODEL_PATTERN` + shell-quoting only on Windows engine spawns · Electron fuses · CSP (no remote anything) · loopback-http interface (never `file://`).

## 7. NUMBERS (measured, kept because they are the machine's truth)

Ollama zip **1.47 GB → 1.94 GB, 87 entries, max 692 MB** · downloader cap **2.5 GB** · runtime unpack caps **512 entries, 1,536 MiB/file, 4 GiB total** (real archive unverified) · documents **12 MB input, 32 MB ZIP expansion, 80 PDF pages / 12,000 characters** · scanned PDF vision render **up to four complete pages** · image **2 MB each**, audio **20 MB**, video **80 MB / 10 min**, task **four attachments** · marketplace CLI **2.1.300+**, explicit add/install/update, extra command approval by SHA · detection cache **30 s** · PATH re-read **5 min** · memory graph **400 nodes** · find bar **6 hits** · thinking budget **31999 (Extended only)** · keep-alive **-1 (number)** · installer configured for **en-US, one-click, per-user**, but not built in this sandbox.

---

*Main's older record remains the comparison point; this update describes the integration on `arena/9781cd95-oddbrain` as tested locally on 2026-10-18. Keep the historical handoff documents until the owner has installed and accepted the app. Do not claim that this note substitutes for Windows verification.*
