# OddBrain

A local-first desktop AI assistant for Windows. The owner's own words: **"my assistant that helps me do things in pc and everything."**

Owner: Utso (`nishadislamutso@gmail.com`) · ASUS TUF A15, Ryzen 7, 8 GB RAM, RTX 3050 4 GB, Windows 11, 1920×1080 @ 125% (1536×864 logical), Asia/Dhaka.

**This is the ONE context document.** Every fact about the project lives here. (Functional exceptions kept as files: `vault/Brain/CLAUDE.md` + `AGENTS.md` are the rulebook the engines actually read; `apps/03_oddbrain/store/packs/**` are actual starter-pack content; `apps/01_claude-exact-pixel-clone/THIRD_PARTY_NOTICES.md` is a legal notice.)

**Branch `clean-build`** = the entire app built cleanly from the owner's personal UI branch (`arena/cc83a507`), exactly as he built it, with exactly one code fix (see "This branch" below).

---

## The laws

1. **Honesty above all.** No invented model names, no colored-dot lies — words, not dots. Every number on screen is countable from records the user can see. A feature that does not exist gets one muted line, never a nav item.
2. **Engines are exactly two**: `claude-code` and `agy`. Ollama is the local brain server, not an engine. Cloud keys ride claude-code.
3. **Extension capture-everything default is ON.**
4. **Nothing is built without the owner's explicit yes.** Real-machine reports outrank every plan.
5. **Every feature lands with a test that proves it.** Gate: `tsc` 0 · full vitest green · build green · smoke `errors=0 warnings=0` · CI green on both OS.
6. One landing = one commit. No new fonts, no cloud services, no telemetry. The in-app Ollama downloader is benched by owner decision — the route is `winget install Ollama.Ollama` (any installed copy is found automatically).

## Repo map

| Path | What it is |
|---|---|
| `apps/03_oddbrain/` | **The app.** Electron 41 + React 19 + Vite. Main process `src/main/`, renderer `src/renderer/src/`, tests `tests/`. |
| `extension/` | Chrome MV3 capture companion (v1.2). Context-menu page/a11y-tree capture into the vault. Capture-everything default ON. |
| `vault/Brain/` | Second brain: engine rulebooks (`CLAUDE.md`, `AGENTS.md`), sources, memory structure, templates. Seeded canonical; the real folder is chosen in-app at runtime. |
| `store/packs/` | Starter packs the in-app store installs. |
| `apps/01_…pixel-clone/`, `apps/02_…clone-v6/` | Predecessor prototypes. Archaeology, not shipped. |

## The UI/UX — the owner's branch, verbatim

The complete appearance inventory, built by the owner personally (authority: SPEC rev 2 on branch `agent-resources` under `OddBrain-UIUX-Handoff/`):

- **8 layouts** — classic sidebar, top bar, rail+list, two-pane, command-first, bento, console, floating — each with a live diagram choice, plus Full/Icon-rail sidebar and "Compare structures".
- **16 preset rows = 8 named looks × light/dark** (Warm Editorial, Cozy Studio, Quiet Minimal, Playful Lab, Ink & Sketchbook, Terminal/Engineer, Retro Desktop, Glass/Futuristic).
- **10 palettes** (app default + 9: Studio, Paper & Plum, Midnight Ink, Sage Notes, Peach Fuzz, Blue Hour, Citrus, Rose After Dark, Quiet Graphite) · **4 interface styles** (Editorial, Soft studio, Ink & paper, Glass studio) · accent follow-or-override.
- **Looks lab**: Compare looks · Taste quiz (5 questions) · My shortlist · gallery · My mixes · Custom look.
- **All 16 bundled design systems** (Claude, Linear, Apple, Stripe, Notion, Vercel, Airbnb, Glassmorphism, Neobrutalism, Editorial, Retro, Dashboard, Shadcn, Minimal, Modern, Default) applied as complete token sets to every screen.
- **All 77 mascot SVGs byte-exact** with the 8 real state roles (idle/thinking/working/waiting/done/searching/making/resting) · motion modes Calm/Balanced/Playful/Still + speed/pause.
- **18 settings sections**, size table per SPEC §2 (15px settings headings, 13px body, 14.5px conversation, 44px bars, 260px sidebar), honest rows only.

## What works (gate-proven on this branch)

- Engines `claude-code` + `agy`: found via npm dir / PATH / Programs / staging; **"Point to the exe…"** persists an override that beats every probe; "Use automatic detection" clears it.
- **Ollama auto-starts at boot** from the user's installed copy (`%LOCALAPPDATA%\Programs\Ollama\ollama.exe` → PATH → staged copy); pid in `userData/ollama/serve.pid`; Stop kills only what the app started. Connectors knocks `127.0.0.1:11434`, counts real brains, "Start the brain door" when nothing answers.
- Guarded media intake (image/audio/video/document decode with named refusals, selected-provider only, no silent switching), Windows-native read-aloud + dictation (no microphone when off), engine marketplace pane reading the REAL Claude CLI catalog with mutations behind the app's permission cards, checkpoints (keep/restore), per-hop pinned downloads, security walls (`shellSafeCommand`, keys-in-main, pairing consent, zip forged-declaration checks), extension capture, thinking folds, work line, turn journal.

**Not yet real:** the owner's full acceptance run on the TUF A15 (the bar for "works"); a signed-in agy live turn; a signed release (Windows shows "unknown publisher" — stated, not hidden).

## This branch's one code fix

`src/main/media/documents.ts` — pdfjs's Node factories read `standardFontDataUrl` / `cMapUrl` / `wasmUrl` as filesystem paths that must end in `/`. The old code appended the platform separator: on Windows that produced `...\pdfjs-dist\cmaps\`, which pdfjs rejects — **PDF attachment extraction failed on every Windows machine** (caught by `tests/media-decoding.test.ts` on Windows CI). Now the paths are normalized to forward slashes with a trailing slash. Windows APIs accept forward slashes; pdfjs's own Node factory `fs.readFile`s the result. Plus a test-env shim (`tests/shims/promise.ts`) so Node-20 sandboxes can run the same suite the app's Node-22 runtime passes — app code untouched by it.

## Build, verify, ship

```
cd apps/03_oddbrain
npm ci --ignore-scripts && node node_modules/electron/install.js
npx tsc --noEmit -p tsconfig.json     # 0 errors
npx vitest run                         # 124 files / 858 tests
npm run build
npm run smoke                          # SMOKE OK SCROLL OK errors=0 warnings=0
npm run dist:win                       # Windows installer (CI builds the artifact)
```

CI (`.github/workflows/`): `checks.yml` runs the gate on Linux + Windows per push; `installer.yml` publishes `OddBrain-Setup-<sha-prefix>` (~96 MB, one-click, en-US).

## Branch map

| Branch | State |
|---|---|
| `clean-build` | **This branch** — the owner's UI, one real-machine fix, gate green. Candidate to become `v3`/`main` after the owner's acceptance run. |
| `main` = `v3` | Previous stable (`a6c7807`). |
| `arena/cc83a507-oddbrain` | The owner's personal UI branch (source of this build). |
| `arena/ea5c07b0`, `arena/81a07155`, `arena/9781cd95`, `arena/9a3a5c88`, `arena/6d6aabbf`, `arena/0bd5478b`, `arena/d3c1ee25`, `arena/495d260c` | Fleet lanes (stores / voice / core / AV / documents / QA / verify / scanner) — judged, CI-proven alternates; consulted, not merged here by owner decision. |
| `agent-resources` | Authority package: `OddBrain-UIUX-Handoff/` (SPEC rev 2), `reference/session-v2/`, `workspace-notes/DECISIONS.json`, `uploads/OddBrain.html`. |
| `archive/workspace` | Preserved workspaces, incl. `workspace-2026-10-18/` (fleet ledger + owner's reference uploads). |
| `professional` | main with the single-README treatment (this branch's doc model comes from there). |

Measured 2026-10-18 on this branch: **124 test files / 858 tests, tsc 0, build green, smoke `SMOKE OK SCROLL OK errors=0 warnings=0`.**
