# HANDOVER_LIVING.md — Current State + Gaps (Living)

> **2026-10-16:** the live state moved to `TODO_NEXT.md` + `CHANGELOG.md` — the
> read-order below is 2026-10-15 era and kept for the record. Judges: start at
> `JUDGE-BRIEF.md` in this folder.

> **2026-10-15:** the app is UN-PARKED and hosts the engine — read
> `ARCHITECTURE-ENGINE.md`, then the 2026-10-15 changelog entry (six judge
> reviews, all defects fixed, 298/298). CLAUDE-SETUP.md's app-parked line is
> history; Phase 6 there is the active plan.
>
> **Taking over? Read in this order:** `CLAUDE-SETUP.md` in this folder (the
> owner's active path since 2026-10-15 — configure Claude + Claude Code, app parked),
> then `TODOLIST.md` here (the app's full record, light-shell frame
> checklist — light-shell frame, the Claude-connection plan), then `BUILD-TODO.md` here (the reference
> plan, screens-first order + the full mockup/feature tables), `CHANGELOG.md`
> (what landed when, with commit ids), `../memory/sessions/` (why decisions
> were made, what failed and must not be retried), `../ai/STATE.json`
> (branches, versions, verification results). Working branch:
> `arena/3c06e1bf-ai-assistant-v3`, merged into `main` after each landing.
> Archives: `archive/workspace` + `archive/ai-assistant-app` branches.

**Last Updated:** 2026-10-14 (late evening) Asia/Dhaka
**Purpose:** everything a new AI or developer needs to continue, without trusting anybody's memory.

## 1. Executive Summary

The owner wants **AI ASSistant**: a local-first desktop assistant that looks and behaves like a serious app,
keeps everything in an Obsidian vault he can read and edit, runs local models through Ollama on a 4GB-VRAM
laptop, and collects from the browser through an extension — but only with his permission.

The app is `apps/03_ai_assistant`'s successor `apps/03_ai-assistant/` (Electron + React + TypeScript).
It is built and verified in the sandbox. It has **not** yet run on the owner's Windows machine, and that is
the first item on the list.

## 2. Where the code stands (2026-10-14)

**Branch:** `arena/3c06e1bf-ai-assistant-v3` → merged into `main`. Both pushed.
Last landed: the **Artifacts screen** this session (on top of `75aa731`, the Windows installer merge, after
`2b46b46` Browsing Maps, `93f2e5c` Agent access and `7a5e8f4` online providers).

**Verified in the sandbox — this is evidence, not a plan:**

- [x] `npm test` → 28 files / 269 tests pass
- [x] `npm run typecheck` → clean
- [x] `npm run build` (desktop) and `npm run build:web` → clean
- [x] `npm run smoke` → `SMOKE OK title="AI ASSistant" size=1280x820 errors=0 warnings=0`
- [x] Browser check: 40 assertions, **0 console problems**
- [x] Desktop end-to-end — five checks, all green: the vault (a typed message is answered, the conversation is
      found in the vault on disk, `09 Activity & Undo` is appended, the vault is moved from Settings and the
      next conversation lands in the **new** vault), the cloud path (key pasted → Test → model in the composer
      → the provider's own answer, asked exactly once), the extension port (a capture lands in the vault, the
      never-check list round-trips, no-origin and page-origin refused), agent access (a switch off → `403`
      with the reason and nothing written; `Keep conversations` off → the chip says `Vault off` and nothing is
      kept), and Browsing Maps (a seeded week → exactly 7 entries, a torn line is not an 8th, counts follow
      the filter) — console clean throughout
- [x] **The Artifacts screen**: a library on disk that the desktop check reads **before** it trusts the
      interface — the app makes an artifact, `index.json` + `items/<id>/v1.html` appear, the grid shows it with
      a real thumbnail, rename changes the name on disk, remove moves the files to `.trash/` and says so; the
      logo's 12 `url(#…)` references all resolve and the sidebar collapses to a 56px rail
- [x] **The Windows installer**: built, its payload listed out of the installer itself (`app.asar`, the exe, the
      uninstaller, `en-US.pak` only), and the same configuration packaged for Linux boots clean —
      `SMOKE OK … errors=0 warnings=0`
- [ ] **It has still not run on the owner's Windows machine** — the installer exists now, and installing it
      there is Priority 1

## 3. What works, in the owner's terms

- **Chat**: streaming answers from Ollama, stop keeps the partial reply, regenerate, edit-and-resend, branches.
- **Artifacts** (a screen of its own, in the nav): everything the app has made, with real thumbnails, dates and
  version counts; version chips that preview an older version and put it back as a new one; rename, duplicate,
  copy-out, export as a folder, and a remove that **moves the files to the library's own `.trash/`** and names
  where they went. The footer names the folder they live in.
- **The sidebar** collapses to a 56px rail and can be dragged wider (200–420px, double-click to reset), both
  remembered; the chat's artifacts rail hides and comes back.
- **Artifacts**: extracted from replies, sandboxed preview, code view, version history, ZIP export.
- **Comment mode**: point at something in a preview, describe the change, one append-only rewrite at a time.
- **Memory**: every finished conversation becomes Markdown in the vault; nothing is invented; a failed write
  says so in one line instead of pretending.
- **Settings** (full window, rail on the left):
  - *System* — what is actually running: the app, the model Ollama reported, its endpoint, the folder.
  - *Appearance* — accent and conversation width, written into the theme tokens themselves, kept across reloads.
  - *Performance* — Ollama's options from profile presets or Custom values, measured against the chosen profile.
  - *Vault* — the folder, chosen through the main process; a folder that does not exist is refused and
    nothing is created in its place.
  - *Models* — the models Ollama reports, plus a key per online provider (Anthropic, OpenAI, Gemini,
    OpenRouter, Groq, DeepSeek, xAI, or any OpenAI-compatible endpoint), sealed by the machine and never
    handed to the interface.
  - *Agent access* — the local model, browser captures, keeping conversations, and one switch per keyed
    provider; each enforced in the main process *before* anything is sent or written. Files, Shell, Web and
    MCP are stated as not built rather than offered as switches.
- **Where an answer came from** is on every reply: `local`, or `online · <provider>`.
- **Browser capture has a socket**: `127.0.0.1:8765`, loopback and `chrome-extension://` origins only,
  carrying the capture side of the vault (health, status, context, capsules, blacklist, capture) and nothing
  that could spend a key, change a setting or export the vault.
- **Browsing Maps**: the vault's own record — conversations, captured pages and visits — as a timeline with
  site grouping, kind filters, search and a time window. A visit stays a visit; nothing is invented and no
  count disagrees with the rows on screen.
- **A Windows installer** (`AI-ASSistant-Setup-0.1.2.exe`, ~84 MB, NSIS, per-user, unsigned → SmartScreen
  warning): notes, first run and the reproducible build recipe in `apps/03_ai-assistant/RELEASE-WINDOWS.md`.

## 4. What is honestly missing

1. **Most of the mockups' screens do not exist yet.** Chat, Settings and Artifacts do. **Today, Vault,
   Projects, Code and the first-run screen do not** — that is the work in order from here, and the nav names
   only what works. Artifacts' own **Import** and **Tweaks** are the next increment inside that screen.
2. **The browser extension itself is still a starter.** The app has carried the port it needs since `8e589a0`,
   but the extension has not been loaded or run against it — nothing is captured from a browser yet, so
   Browsing Maps is mostly the app's own conversations.
3. **The preview/export chain, the topic list / branch tree, and projects + chat memory** — asked for, not
   built.
4. **Cloud follow-ups:** per-provider default model, an audit log, a token/cost meter, cloud → local-only
   failover.
5. **No code signing.** Windows will warn about an unknown publisher until a certificate exists; the release
   notes say so plainly rather than letting it look like a mistake.
6. **No voice / wake word.** Parked by the owner until he has better hardware.

## 5. How to continue

1. Read `README.md` (the owner's own instructions), then `.ai/CONTEXT.json` and `.ai/STATE.json`.
2. `cd apps/03_ai-assistant && npm install && npm test` — get a green baseline before touching anything.
3. Work on `arena/3c06e1bf-ai-assistant-v3`. When a step is finished **and verified**, commit it (naming
   every file, untracked additions included), merge `--no-ff` into `main`, push both, then report.
4. Update the living docs in the same commit as the work.

## 6. History, in one paragraph each

- **2026-10-10 — the clone era.** `apps/01_claude-exact-pixel-clone/` was built to match six Claude desktop
  screenshots, with an Express vault API on port 8765 and bat files for Windows. It is history now: a source
  for porting *logic* (markdown, inference profiles, vault client behaviour), never for JSX.
- **2026-10-11 — the first real architecture.** The rebrand to AI ASSistant, `apps/03_ai-assistant/` as the
  line of work, hooks and a local API, artifacts, comment mode.
- **2026-10-14 — it became an app.** Vault writes through the main process; Settings with Appearance and
  Performance; the Vercel deployment files deleted at the owner's request; Settings rebuilt as the full
  window; and the memory warning fixed to measure against the profile the owner chose.
- **2026-10-14 (late evening) — the screens begin.** The owner said plainly that the app was "a plain chatbot"
  against mockups with eight screens, and he was right. The Artifacts library and screen land first (with the
  sidebar collapse and the logo fix he reported), then Today, Vault, Projects, Code and first-run — one landing
  each.
- **2026-10-14 (evening) — it became shippable.** Online providers behind Settings > Agent access, the loopback
  port for the browser extension, Browsing Maps over the vault's own record, and finally a Windows installer
  (`AI-ASSistant-Setup-0.1.2.exe`) — the first file a person can double-click.
