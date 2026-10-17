# HANDOVER — OddBrain

> **Read this first.** This document explains the whole app: what it is, every
> feature in it, how each one is *supposed* to work according to the owner's
> wishes, what the owner wants to achieve, how everything is structured, what
> is proven, what is not, and what remains. It is the single entry point for
> any person or AI continuing this work. Where this file and wishful thinking
> disagree, this file wins — it is written to be honest, and honesty is the
> product's first law.

- **Repo:** https://github.com/NishadIslamUtso/OddBrain (branches `v3` and `main`, kept identical)
- **State this file was written at:** commit `341efc5` — 98 test files / 716 tests, `tsc` clean, build green, smoke `SCROLL OK errors=0 warnings=0`, CI green on both branches.
- **Companion docs:** `00_LIVING_DOCS/JUDGE-BRIEF.md` (verify-it-yourself brief), `00_LIVING_DOCS/CHANGELOG.md` (what changed each round), `00_LIVING_DOCS/ENGINE-STORES-DESIGN.md` (approved design, unbuilt).

---

## 1. The dream — what the owner wants to achieve

The owner's north star, his own words:

> **"My assistant that helps me do things in PC and everything."**

Not a chatbot. A resident doer: it reads and writes his files, runs commands,
watches folders, captures his browser, keeps a second brain of everything it
learned — and every risky step is reviewable and undoable. Local-first, no
account, no telemetry. Free brains (Ollama) where possible, cloud brains
(where he chooses) through the engines' own doors.

Second, standing wish: **the UI/UX must be exactly what he asked for — not an
assistant's taste.** He has reserved the right to supply the entire UI/UX code
himself and have it applied **as is, pixel for pixel** (see §8.3 — this is
pending and outranks most polish).

---

## 2. The owner and his machine (facts that shape decisions)

| Fact | Consequence in the product |
|---|---|
| **Nishad "Utso" Islam**, Dhaka, BD | English-only UI (a hard law). |
| Windows username **"Nishad Islam Utso" — with spaces** | Every displayed/copied command must be quoted (`displayCommandLine`); every engine spawned by absolute path must be shell-quoted (`shellSafeCommand`); first run prefills his name via the `app:whoami` door. Three separate bugs taught this. |
| ASUS TUF A15 — 8 GB RAM / 4 GB VRAM | Local brains must be small (`inference-fit.ts` sizes models to the machine); "Model stays loaded" exists so the RAM is not thrashed. |
| He installs from CI artifacts; no local installer builds | The GitHub Actions `installer` workflow is the canonical build. |
| He is the only user | Per-user NSIS install, one click, no admin, no telemetry. |

---

## 3. What OddBrain is

A **Windows desktop app (Electron)** that drives coding-agent CLIs through
their own stream-json protocols and shows their work as reviewable, undoable
steps inside a local Obsidian-style vault.

**The three brains — and the law about them:**

1. **Claude Code** (`claude`) — full wire, the default engine. Signed in with
   the owner's own account; the app never borrows credentials.
2. **agy** (Google's Antigravity CLI) — the second engine. Its wire is
   implemented (stdin stream-json, `--conversation` resume, `event:'result'`);
   a **signed-in live turn has never been driven yet** — recorded as unproven.
   Pictures are not sent through agy (the app says so in words).
3. **Ollama** — **not an engine.** It is the free local brain *server*: the
   app (or the owner) runs it at `127.0.0.1:11434`, and Claude Code uses its
   models when a brain is explicitly named. Engines are EXACTLY two; this is
   law.

---

## 4. How it is built (structure)

```
repo/
├─ apps/03_oddbrain/            THE APP
│  ├─ src/main/                 Electron main process (Node)
│  │  ├─ index.ts               boot, windows, every IPC door (~2k lines)
│  │  ├─ ipcGuard.ts            origin-parsed IPC + navigation lock
│  │  ├─ appFlags.ts            machine flags (startup / warm / keep-loaded)
│  │  ├─ engine/                THE ENGINE LAYER
│  │  │  ├─ claudeCode.ts       claude adapter: args, env, spawn, wire
│  │  │  ├─ agy.ts              agy adapter
│  │  │  ├─ stream.ts           shared wire → app-events parser
│  │  │  ├─ socket.ts           session registry, one send path
│  │  │  ├─ enginePath.ts       PATH resolution, staging roots, quoting
│  │  │  ├─ availability.ts     detection (absolute-path probing)
│  │  │  ├─ downloads.ts        staged downloads + installer runs
│  │  │  ├─ checkpoints.ts      keep-old-copy before any Allow
│  │  │  ├─ packs/exportPack/storeIndex/skillCatalogInstall/deploy…
│  │  ├─ vault/                 the second brain's file layer (+zip, blacklist)
│  │  ├─ artifacts/             artifact library storage
│  │  ├─ extension/server.ts    the browser extension's paired door
│  │  ├─ api/server.ts          loopback API the renderer talks to
│  │  ├─ watcher.ts             watch-mode folder watching
│  │  └─ cloud/                 provider keys (Anthropic), client
│  ├─ src/preload/index.ts      the ONLY bridge window ↔ main (contextIsolated)
│  ├─ src/renderer/             React UI
│  │  ├─ App.tsx                the shell (sidebar + view + settings dialog)
│  │  ├─ state/                 engine store, appearance, artifacts, memory…
│  │  ├─ components/            38 screens/sections (see §5)
│  │  └─ motion/                the Mascot (77-scene animation kit)
│  ├─ src/shared/lib/           environment-agnostic logic (both sides import)
│  │  ├─ engine.ts, engineDownloads.ts, ollama.ts
│  │  ├─ design-systems/        the 16 full token sets (see §5.9)
│  │  ├─ motionKit.ts/-Data     animation↔state↔word assignment
│  │  └─ houseRules, prompts, recipes, split, compact, handoff, memory…
│  ├─ store/                    the shipped pack store (index + packs, sha-pinned)
│  ├─ tests/                    98 vitest files / 716 tests (logic layer)
│  └─ electron-builder.yml      per-user one-click NSIS, unsigned (stated)
├─ extension/                   the Chrome extension (MV3) shipped into the install
├─ .github/workflows/           checks.yml (linux+windows gate) · installer.yml (exe)
├─ 00_LIVING_DOCS/              living docs + receipts (JUDGE-BRIEF, CHANGELOG…)
└─ ai/                          byte-for-byte mirror of the living docs
```

**Process & security shape (every wall is code, tested):**

- Renderer is sandboxed; the preload bridge is the only door; every IPC
  answer checks the parsed origin (user-info smuggling and stray `file:` fail).
- Navigation is locked — a link cannot walk the window away; external links
  open the real browser.
- The extension's server requires the pairing token (`x-oddbrain-pair`);
  unpaired captures are dropped with the reason logged.
- Downloads: official URL pinned, redirect hops allowlisted by host, size caps
  (see §8.1), zip-safe unpack (declared **and measured** caps, path-traversal
  refused).
- Packaged binary: Electron fuses flipped (no `ELECTRON_RUN_AS_NODE`, no
  `NODE_OPTIONS`, no inspect).
- Interface is served over loopback http (never `file://`) so origins are real.

---

## 5. Every feature — what it is and how it is supposed to work per his wishes

### 5.1 The turn (the heart)

1. He types an order (or watches, or a recipe, or a memory pass — all ride
   **the one send path**).
2. The engine is spawned by absolute path, shell-quoted on Windows, with the
   machine's registry PATH merged in; empty model choice = the engine runs as
   itself (no door forced, no invented model — `gemma4:cloud` is **banned**).
3. Words stream in live (`--include-partial-messages`), thinking blocks fold.
4. A file-touching step raises a **permission card**: what it wants, the diff
   or the command, **Allow / Deny**. Allow takes the file's old copy FIRST
   (checkpoint before forward; a failed checkpoint DENIES rather than allows
   blind). Deny reaches the engine as a real deny.
5. The turn ends with an honest summary: tokens, time, what changed — and a
   **Restore** for every change, including files the engine created from
   nothing.
6. Approval gears: **Ask me / Plan first / Auto-edits / Full speed** — Full
   speed turns the cards off and says so in the gear's own label.

### 5.2 The engine strip & thinking (his explicit wishes)

- The strip above the composer is **collapsible** (chevron, remembered), and
  **force-unfolds whenever a permission waits** — Allow/Deny can never hide.
- **Thinking blocks are collapsed by default everywhere.** Open one and every
  thinking block stays open from then on (one shared flag,
  `thinkingOpen.ts`). A live-writing block still unfolds while it runs.
- The title-bar dot is green **only while a turn is literally live**. No
  colored dots anywhere claim "installed" or "working" — words instead
  (`installed · 2.1.302`, `not installed`). The "fake green dots / fake model
  names" round (`4fb6c15`) is the reference.

### 5.3 Engine bay & Connectors

- **Engine bay** (in Settings → Engine): engine cards with on-face version
  proof and path-on-hover, a **Re-scan** that skips the remember-cache,
  detection that probes absolute spots FIRST (npm dir, `.local\bin`, Programs,
  **and the app's own staging ground** `…/oddbrain/engines/<id>/app`), the
  downloads column, watch-mode setup, model/gear/vault pickers.
- **Connectors pane** (`ConnectorsSection.tsx`): three cards — Claude Code,
  agy, Ollama — each stating the machine's actual answer and the one action
  that improves it (Use this engine / copyable install line / official page /
  knock on 11434 and count the brains). **Check all** re-asks every door.

### 5.4 Models & local brains

- The model menu always offers **"the engine's own choice — its own login"**
  first, then ONLY what a machine source produced. Cloud chips (`:cloud`),
  sizes for local ones.
- Ollama: start/stop/status of the staged copy from the Engine bay;
  "Model stays loaded" = `OLLAMA_KEEP_ALIVE=-1` on the serve process (a
  runtime promise, a machine flag as the switch).

### 5.5 Vault & memory (the second brain)

- Default `Documents/ASSistant/AI-Brain` (or chosen folder), seeded with the
  canonical second-brain structure: `00 System … 10 People, 90 Archive`,
  templates, `CLAUDE.md`/`AGENTS.md` rulebooks the engine must read.
- Sources land as write-once notes (conversations, browser captures, imports,
  laptop files, a11y trees) — never silently edited after the fact.
- **Memory pass**: one press sends the reflect-order through the send path;
  the engine writes what mattered into the memory files itself.
- Keep-or-forget review, dead/ambiguous link checks, blacklists
  (never-capture paths) honored everywhere.

### 5.6 Artifacts

Every file the engine writes can preview in-app (HTML / Markdown / code /
SVG / charts), pop out into its own window, export to PDF, be **rewritten**
(the engine revises; versions kept; any version **restorable**). The artifact
styler can pour one of the 16 design token sets into generated HTML.

### 5.7 Browser extension (the capture law)

Chrome MV3 extension ships inside the install. **LAW: capture everything on
screen except the blacklisted paths, default ON** (the owner overruled the
judges' default-off twice). Pages/selections/a11y trees flow through the
paired loopback door into the vault as Sources. Popup: pairing, blacklist,
status.

### 5.8 Stores & packs

- **OddBrain store** (shipped): folder+https indexes, sha-256 digests, tamper
  refusal shown before install. Packs = skills + prompts + themes. Starter,
  Looks, Prompt-starters, Anthropic skills ship in the box.
- **Anti-skeleton law:** a pack theme carries its own FULL stylesheet
  (`css`), applied after the app's own so it wins; a css-only theme is valid;
  a test refuses any shipped theme without one. The six shipped themes have
  real, visibly different styles.
- **Engine marketplaces** (design approved, **not built** — his go pending):
  Phase 2 = Claude Code plugin marketplaces via `claude plugin marketplace
  add <repo>` run as a carded command (the engine installs its own things —
  never hand-copied files). Phase 3 = agy's catalog when Google ships one.
  One store page, labeled sources, no auto-sync.
- Plugins, skills, connectors are **distinct features with distinct surfaces** — never lumped.

### 5.9 Appearance & motion

- **16 design systems** (nexu-io/open-design, Apache-2.0): Claude, Linear,
  Apple, Stripe, Notion, Vercel, Airbnb, Glassmorphism, Neobrutalism,
  Editorial, Retro, Dashboard, Shadcn, Minimal, Modern, Default. Settings →
  Appearance → **Design system** applies one to EVERY screen through the
  app's tokens (palette, type, radii, shadows, transcript size); the system
  owns accent + reading type while active; one look at a time (a pack theme
  and a design system retire each other).
- Plus: theme (system/light/dark), 5 accents with WCAG-checked ink, width,
  transcript size, reading font, motion modes (System/Calm/Balanced/Playful/
  Still), mascot words, row explanations.
- **Motion kit:** 76 scenes + a loader, 304 status words, 8 roles mapped to
  real app states (resting / idle / thinking / working / making / waiting /
  searching / done). Every animation reachable, all pausable (Still, OS
  reduced-motion), never blocking. The animated brain greets on first-run and
  idles by the sidebar profile.

### 5.10 The rest of the kit (all real, all through the one send path)

**Watch mode** (folder changes fire the order after quiet; deletions don't;
own writes suppressed), **recipes** (reusable orders), **split** (long orders
broken into reviewable steps), **battles** (two brains, same order, judged),
**compaction** (conversation → brief, fresh session, brief rides along),
**review** (the engine checks its own work, report-only), **handoff** (a
finished turn becomes a vault document any later session can continue),
**projects**, **Today view**, **find-in-conversation** (the scroller the
smoke test proves), **quick-ask window** on a global hotkey, **hooks**,
**house rules**, **skills catalog** (deploys to the engines' own skill
folders), **activity journal** (every change recorded, restorable).

---

## 6. The laws (his standing rules — the constitution)

1. **Honesty over polish.** No fake dots, no invented model names, no claimed
   features. A lie in the UI is the worst bug that exists.
2. **"Not your skeleton."** Themes/looks must carry the ENTIRE style. Tests
   refuse skeleton themes.
3. **Engines are exactly two** (claude-code, agy). Ollama is a brain server.
4. **The engine installs its own things.** Marketplaces go through the
   engine's own commands, carded first.
5. **Capture everything, default ON** (blocklist respected). Judges'
   default-off was overruled twice.
6. **Plugins / skills / connectors are distinct** surfaces and stores.
7. **Claims must survive hostile judges** — tests assert real shapes, source
   order, and behavior; environment-stubbing tests are the historic failure
   mode and are banned.
8. **Desktop only. English only.** Local-first; the app must work with no
   connection.
9. **One landing = one commit**, pushed to `v3` and `main` together; CI gates
   merge truth (checks + installer, both branches).
10. **Everything must work on HIS machine** — the TUF A15 is the acceptance
    lab; CI-green ≠ world-clean until he runs it.
11. **Paperwork deferrable**; the working app outranks docs (docs still kept
    honest by the changelog rules).
12. **"tag it"** (his word, still pending) → cut the **v0.9.0 GitHub Release**
    with the exe + sha256.

---

## 7. Honest state — proven, unproven, broken

**Proven (tests/CI/live):** the wire shapes (proven against real claude
v2.1.300+), permission cards end-to-end with checkpoint-before-allow,
restore, detection incl. staged engines, quoting (spaces), boot order, warm
start, keep-loaded, outbox semantics, pairing, pack install/export digests,
design-system application, the scroll chain (smoke-proven), console-clean
boot (smoke), installer builds.

**Unproven:** a signed-in **agy live turn**; **Ollama staged end-to-end on
the TUF A15** (see §8.1); extension capture driven by him on the new build;
the full acceptance checklist (real turn, Allow/Deny/Restore, always-loaded,
startup, extension captures) on his machine — **that checklist is the real
bar, and only he can run it.**

**Known broken / open:**

1. **The in-app Ollama download still fails against the real file** — see
   §8.1 for the measured truth and the exact fix (written once, discarded at
   his request to drop the downloader, not re-landed).
2. **CI flakes** — two suites have raced CI historically; one
   (`engine-media` checkpoint test) was root-fixed at `341efc5`
   (deterministic waits). If a lone failure appears on one branch only while
   the identical commit passes on the other: re-run the failed jobs before
   suspecting the code.
3. **Store phases 2–3** await his go (design final).
4. **Deferred paperwork:** README icons/SVG polish, repo prune of old apps,
   docs refresh — until he says the app is his.
5. **v0.9.0 Release** — not cut; waits for "tag it".

---

## 8. Open work, specified (so the next session can just do it)

### 8.1 The Ollama downloader — the measured truth and the exact fix

Measured live 2026-10-17 against `https://ollama.com/download/ollama-windows-amd64.zip`
(redirect chain verified: ollama.com → github.com → release-assets → 200):

- Compressed **1.47 GB**, **87 entries**, unpacks to **1.94 GB**, biggest
  single file **692 MB** (`lib/ollama/cuda_v12/cublasLt64_12.dll`).

Current code refuses it at the unpack step: `unzipArchive` defaults are
pack-sized (`perFile 200 MB`, `totalUncompressed 400 MB`). The download cap
(`MAX_DOWNLOAD_BYTES`) is already 2.5 GB (`06da1c1`).

**The fix (three small pieces, all designed against the real file):**

1. Add to `src/shared/lib/engineDownloads.ts`:
   ```ts
   export const RUNTIME_ZIP_LIMITS = {
     files: 512,
     perFile: 1_500 * 1024 * 1024,
     totalUncompressed: 4 * 1024 * 1024 * 1024,
   } as const
   ```
2. In `downloads.ts`, the zip unpack call becomes
   `unzipArchive(bytes, join(root, engine, 'app'), { ...RUNTIME_ZIP_LIMITS })`.
3. (Quality, not correctness) stream `reply.body` with `getReader()` so a
   1.5 GB download shows progress ticks (~8 MB) instead of a silent hang,
   enforcing the cap mid-stream; fall back to `arrayBuffer` for tests.

Pins to write: limits admit ≥700 MB/file and ≥2 GB total; a synthetic 250 MB
entry (impossible under the old limit) unpacks (use `zlib.crc32` — Node 22+
— a pure-JS CRC over 250 MB blows the 5 s test budget); source-pin the
`RUNTIME_ZIP_LIMITS` call-site. **Alternative he may prefer: drop the staged
download entirely** — the Connectors card already recommends
`winget install Ollama.Ollama`, and the app finds any Ollama automatically.
His call; both are honest.

### 8.2 Store phases 2–3

Build per `00_LIVING_DOCS/ENGINE-STORES-DESign.md` after his go: source
picker on the store page (OddBrain / Claude Code marketplace / agy), index
readers with the store's fetch caps, result cards with provenance badges,
install = the engine's own command on a permission card. Probe the real
`claude plugin marketplace` surface on his machine before claiming it.

### 8.3 The UI/UX takeover (his reserved right)

He has stated he will supply **the entire UI/UX code** and it is to be
applied **as is** — no reinterpretation, no "improvements". When it arrives:
treat it as the spec, port it faithfully (styles, markup, animations, all
screens), keep the honesty laws (§6.1) and the data wiring behind it intact,
and let him judge screenshots against his own code.

### 8.4 The acceptance checklist (his machine, his hands)

Uninstall old build → install the newest `OddBrain-Setup-<sha>.exe` → then:
1. Settings → Appearance → **Design system** row exists; pick Linear → the
   whole app changes.
2. Connectors → **Check all** → Claude Code `installed · 2.1.302` with the
   real path; Ollama card reports the door truthfully.
3. Sign in once (`claude` in PowerShell) → send a real order → words stream →
   a permission card rises → **Allow** → change lands → **Restore** brings
   the old file back byte-for-byte.
4. The strip folds; a permission force-unfolds it. Thinking: collapsed until
   opened, then always open.
5. Watch mode fires once on a real file change. Extension (paired) captures
   this page into the vault. "Model stays loaded" survives a restart.
6. Anything broken **says why in words** (error boundary) — screenshot it.

---

## 9. Build, test, verify

```bash
cd apps/03_oddbrain
npm ci --ignore-scripts && node node_modules/electron/install.js
npx tsc --noEmit -p tsconfig.json     # types
npx vitest run                        # 98 files / 716 tests (as of 341efc5)
npm run build                         # electron-vite build
xvfb-run -a npx electron . --smoke    # SMOKE OK SCROLL OK … errors=0 warnings=0
```

CI (both branches, every push): `checks` = install → types → tests (junit;
failures posted as commit comments) → build → smoke on **linux and windows**;
`installer` = electron-builder → artifact `OddBrain-Setup-<full-sha>.exe`
(~96 MB, expires ~30 days). Artifact = the way he installs. Sandbox note
(the AI's side): the git index rots between turns — recover with
`git fetch origin && git reset --hard origin/v3`, re-apply only the round's
files (always back them up first), re-gate, land. Never `git add -A` on a
rotted tree without that reset.

---

## 10. Glossary (his vocabulary, used throughout)

- **Brain** — a model (local via Ollama, or cloud via a named engine model).
- **Engine** — the CLI doer: claude-code or agy. Exactly two.
- **The door** — `127.0.0.1:11434`, Ollama's local API.
- **Card** — a permission question (Allow/Deny) with the real diff/command.
- **Keep / checkpoint** — the old copy saved before an Allow.
- **One send path** — every order (chat, watch, recipe, memory, battle, split)
  goes through the same engine send, so every guarantee holds once.
- **Staged** — downloaded by the app into its own folder, run only after a
  carded permission.
- **The line** — the work queue when the engine is busy.
- **"tag it"** — his command to cut the v0.9.0 Release.

---

*Written 2026-10-17 at `341efc5`. Update the counts and the honest-state
section every landing — a handover that drifts is a lie with better manners.*
