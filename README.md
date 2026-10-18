# OddBrain

A local-first desktop AI assistant for Windows. The owner's own words: **"my assistant that helps me do things in pc and everything."**

Owner: Utso (`nishadislamutso@gmail.com`) · ASUS TUF A15, Ryzen 7, 8 GB RAM, RTX 3050 4 GB, Windows 11, 1920×1080 @ 125% (1536×864 logical), Asia/Dhaka.

This file is the ONLY context document. Everything true about the project lives here. (Functional exceptions: `vault/Brain/CLAUDE.md` + `AGENTS.md` are the engines' deployed rulebooks; `store/packs/**` are the actual starter-pack contents; `apps/01_claude-exact-pixel-clone/THIRD_PARTY_NOTICES.md` is a legal notice.)

---

## The laws

1. **Honesty above all.** No invented model names, no colored-dot lies — words, not dots. Every number on screen is countable from records the user can see. A feature that does not exist gets one muted line, never a nav item.
2. **Engines are exactly two**: `claude-code` and `agy`. Ollama is the local brain server, not an engine. Cloud keys ride claude-code.
3. **Extension capture-everything default is ON.** Never shipped off.
4. **Nothing is built without the owner's explicit yes.** Real-machine reports outrank every plan.
5. **Every feature lands with a test that proves it.** The gate: `tsc` 0 errors, full vitest green, build green, smoke `errors=0 warnings=0`, CI green on both OS before anything is called done.
6. One landing = one commit. No fake UI state. No new fonts, no cloud services, no telemetry.

## Repo map

| Path | What it is |
|---|---|
| `apps/03_oddbrain/` | **The app.** Electron 41 + React 19 + Vite. Main process (`src/main/`), renderer (`src/renderer/src/`), tests (`tests/`, 99 files / 723 tests at `main`). |
| `extension/` | The Chrome MV3 capture companion (v1.2). Context-menu capture of pages/a11y trees into the vault. |
| `vault/Brain/` | The second brain: rulebooks the engines read (`CLAUDE.md`, `AGENTS.md`), sources, memory structure, templates. Seeded canonical; the app integrates the user's real folder at runtime. |
| `apps/01_claude-exact-pixel-clone/`, `apps/02_electron-claude-clone-v6/` | Predecessor prototypes. Kept for archaeology; not shipped. |
| `store/packs/` | Starter packs the in-app store installs (prompts + skills). |

## Build, verify, ship

```
cd apps/03_oddbrain
npm ci --ignore-scripts && node node_modules/electron/install.js
npx tsc --noEmit -p tsconfig.json     # 0 errors
npx vitest run                         # 99 files / 723 tests at main
npm run build
npm run smoke                          # SMOKE OK SCROLL OK errors=0 warnings=0
npm run dist:win                       # Windows installer (CI does this)
```

CI (`.github/workflows/`): `checks.yml` runs the gate on Linux + Windows per push; `installer.yml` publishes the signed-layout (unsigned binary — Windows shows "unknown publisher", stated, not hidden) artifact `OddBrain-Setup-<sha-prefix>`.

## Current state — main (`a6c7807`, branch `v3` = `main`)

**Works (CI-proven, 99/723, smoke clean):**
- Engines `claude-code` + `agy` found via npm dir / PATH / Programs / staging; **"Point to the exe…"** override persists in `userData/engine-binaries.json` and beats every probe; "Use automatic detection" clears it.
- **Ollama auto-starts at boot** from the user's installed copy (`%LOCALAPPDATA%\Programs\Ollama\ollama.exe` → PATH → staged copy), pid in `userData/ollama/serve.pid`, Stop kills only what the app started. Connectors pane knocks `127.0.0.1:11434` and counts real brains; "Start the brain door" when nothing answers.
- Checkpoints (keep/restore), permission cards, per-hop pinned engine downloads, security walls (origin smuggle, pairing consent, zip forged declarations, keys-in-main, `shellSafeCommand`), extension capture, 16-system design loader, appearance pack themes, thinking folds, work line, turn journal.

**The in-app Ollama downloader is benched by owner decision** (the official zip measured 1.47 GB): the route is `winget install Ollama.Ollama` — the app finds any installed copy automatically.

**Not yet real:** the owner's full acceptance run on the TUF A15; a signed-in agy live turn; engine marketplaces against real signed-in engines.

## Branch map

| Branch | State |
|---|---|
| `main` = `v3` | Stable. Protected by the gate. |
| `arena/cc83a507-oddbrain` | **Owner's personal UI branch.** Complete appearance inventory per SPEC rev 2: 8 layouts, 10 palettes (9 + default), 16 preset rows (8 named looks × light/dark), 4 interface styles, taste quiz (5 questions), compare looks / compare structures / shortlist / gallery / mixes / custom look, 77 mascot SVGs byte-exact with 8 state roles, 18 settings sections, 16 bundled design systems. CI: Linux green; one Windows test red (`media-decoding` PDF test — owned by the media lane at merge, not a UI bug). |
| `arena/ea5c07b0-oddbrain` | Fleet: engine marketplaces — **COMPLETE** (real Claude CLI catalog, installs through the app's permission cards, fixture-proven). |
| `arena/81a07155-oddbrain` | Fleet: read-aloud + dictation — **COMPLETE** (Windows-native, no mic when off, proven). |
| `arena/9a3a5c88-oddbrain` | Fleet: audio/video/image intake (separable; merges first after the UI pick). |
| `arena/9781cd95-oddbrain` | Fleet: core rebase (auto-keep, second-pass reviewer, memory pass, artifacts/trash) — CI green both OS. |
| `arena/6d6aabbf-oddbrain` | Fleet: document intake door (owns the dispatch + attachment type contract). |
| `arena/0bd5478b-oddbrain` | Fleet: built-app QA driver. `arena/d3c1ee25-oddbrain` | Fleet: verify/install gate. `arena/495d260c-oddbrain` | Fleet: branch scanner (BRANCH-COMPARISON.md). |
| `agent-resources` | Reference package: `OddBrain-UIUX-Handoff/` (SPEC rev 2 = appearance authority), `reference/session-v2/` (dead session's app code), `workspace-notes/DECISIONS.json` (owner's recorded scope answers), `uploads/OddBrain.html` (the original inventory HTML). |
| `archive/*`, `workspace-2026-10-18/` on `archive/workspace` | Historical workspaces, preserved. |

## Merge plan (when the owner says)

1. Owner finishes `arena/cc83a507` (UI) → that renderer wins.
2. Cherry-pick functional lanes onto it in order: `9a3a5c88` (AV, smallest overlap) → `ea5c07b0` (stores) → `81a07155` (voice) → `9781cd95` (core) → `6d6aabbf` (documents) → QA/verify evidence branches bring no code.
3. Kill list at merge: the inherited "Built media worker" CI step, pre-brief out-of-lane duplications (inventory per lane reports), all seven sibling UI branches.
4. Full gate + owner's acceptance run on the TUF A15 → tag `v0.9.0`.

## Verified numbers (2026-10-18)

main `a6c7807`: 99 test files / 723 tests, tsc 0, build green, smoke `errors=0 warnings=0`, CI 4/4. Installer artifact 96.2 MB. Ollama zip (measured live): 1,471,164,488 bytes → 1.94 GB unpacked, largest file 692 MB.
