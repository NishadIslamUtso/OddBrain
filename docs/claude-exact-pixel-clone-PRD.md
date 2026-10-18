# Claude — exact pixel clone: product requirements

This is the north-star document for `apps/01_claude-exact-pixel-clone/`.
When a decision is ambiguous, this file wins over any individual screenshot
reading, and **the user's stated values win over any pixel measurement**.

Companion document: `docs/claude-exact-pixel-clone-APP-DESIGN.md` (how the app
should look and behave, in the user's own words).

---

## What this is

A local, offline clone of the Claude web client that runs on the user's own
machine against a local model. It is not "inspired by" Claude — it is meant to
be indistinguishable from the screenshots in `spec/screenshots/`, while every
feature behind the pixels actually works.

The pixel target and the functional target are equally binding. A beautiful
shell that does nothing is a failure; a working app that looks wrong is also a
failure.

## The pixel target

Ground truth is six screenshots, in `spec/screenshots/`:

| Screenshot | What it pins down |
|---|---|
| `191547` | Home view — greeting, composer, free-plan chip |
| `191558` | Sidebar — chat history, recents, pinned projects |
| `191608` | Deep-research progress — task list with live states |
| `191636` | Composer with model picker and tool controls |
| `191646` | Artifact/output panel beside the transcript |
| `191707` | Settings dialog |

Two ways to read them, and they are reconciled like this:

- **`spec/MEASURED_PIXELS.md`** holds the *measured* values — what the pixels
  literally are after sampling. Reference only.
- **The user's stated hex values are authoritative.** Where measurement and the
  user disagree, the user wins. This is settled and is not up for re-argument:
  main `#1a1a1a`, sidebar `#202020`, composer `#242424`. The measured spec
  (`#151515` / `#111111` / `#20201f`) is recorded in `MEASURED_PIXELS.md` for
  reference and is deliberately not used.
- **Geometry the user did not specify follows the measurements.** The user gave
  colours, not sizes. Sizes come from the samples.

Screenshots live in `spec/screenshots/`. They are **not** bundled into any
distributable.

## Non-negotiables

1. **Dark by default**, at the user's hex values above.
2. **The Windows title bar is visible.** No custom frameless chrome, no
   borderless window. Justify layout against a real title bar.
3. **Runs on the target machine**: ASUS TUF A15, Ryzen 7, **8 GB RAM**,
   **4 GB VRAM** (RTX 3050), 500 GB, Windows 11, slow downloads.
   Consequences: prefer Tauri over Electron, never depend on native build
   toolchains, never assume a GPU bigger than 4 GB.
4. **Use the already-installed Ollama and the already-pulled `qwen2.5:3b`.**
   Never download a model. The launcher must handle Ollama *already running*.
5. **The `.bat` files must work** on that machine, first try, with no terminal
   knowledge assumed.
6. **"Keep the functions."** Never trade working behaviour for appearance. If a
   pixel-perfect change would break a feature, the feature wins and the
   appearance is re-approached.

## Architecture

- **Frontend**: React + Vite (`apps/01_claude-exact-pixel-clone/`).
- **Model**: local Ollama at `127.0.0.1:11434`, default `qwen2.5:3b`, with a
  model selector and a live status readout.
- **Vault**: `server/vault-api.cjs` on `127.0.0.1:8765`. **The app is the driver
  of the vault; the browser extension is the collector.** The vault is the
  single source of truth for captured data.
- **Extension**: Manifest V3 in `extension/`, posting to the vault. Its UX
  target is Capsule Hub (Tilantra) plus Quillbot — one-time permission, then
  capture everywhere, no popups, no nagging.

Services are started by `start-app.bat` and checked by `check-ollama.bat`.

## Feature set

### Baseline (the original 24 wants)

Cross-app survey of the user's own stated wants: 9 exist nowhere outside this
repo, so they are ours to get right. The full graded matrix is in
`spec/PARTIAL_FEATURES_AUDIT.md`.

### Everything wired this session

- **Unified local status** — one banner aggregating Ollama, the vault, and the
  extension bridge, with `Retry`, `Check dependencies`, and `Copy diagnostics`.
- **Onboarding** — one-time, skippable, resumable, remembers the last step.
- **Local landing page** — opens offline, no network, no analytics, no CDN.
- **Settings: Profile** — display name, occupation, location, projects,
  personal preferences, all persisted.
- **Settings: Appearance** — theme, density, font size, accent, all persisted
  and applied.
- **Settings: Connectors** — per-service status with `Recheck` and per-service
  `How to connect` help.
- **Settings: Usage** — real numbers; session totals reset per session.
- **Settings: Projects** — create, rename, delete, recolour; move threads
  between projects; live everywhere.
- **Design systems** — 16 token sets bundled from open-design (Apache-2.0, see
  `apps/01_claude-exact-pixel-clone/THIRD_PARTY_NOTICES.md`), selectable in the
  artifact panel, injected into previews and into exported ZIPs.
- **Skills** — named, reusable instructions for sub-agents. Save any instruction
  once, reuse it on any sub-agent. Modelled on open-design's skills mechanism;
  the six built-in roles are our own.
- **Internals** — in-memory store; `notify()` on the instance; import and export
  of the whole workspace; `\`, `[[`, `@`, `/` triggers; token streaming.

### Still placeholder

These four settings sections are reachable but not yet built: **Reflect**,
**Time and focus**, **Claude Code**, **Skills** (the settings entry — the
sub-agent skills are done). They are intentional placeholders, not bugs.

## Task

#### Task 1 — pixel parity

Match all six screenshots. Verify against the user's hex values for colour and
against `MEASURED_PIXELS.md` for everything the user did not specify.

#### Task 2 — functional parity

Artifact runner, model selector, file and image upload, thinking display,
capsule drag-and-drop injection, Today view. Each must work end to end, not
just render.

#### Task 3 — local model

`qwen2.5:3b` through Ollama, already-running handled, no model downloads,
graceful degradation when VRAM is tight.

#### Task 4 — vault and extension

App drives `127.0.0.1:8765`; extension collects. Blacklist is default-allow,
explicit-deny, editable in `00 System/Privacy & Access.md`, and kept in sync
between both implementations by `tests/blacklist-parity.test.cjs`.

#### Task 5 — installability

`start-app.bat` and `check-ollama.bat` work on the TUF A15 with no terminal
knowledge. No native build tools required.

## Privacy rules

- Never collect passwords, cookies, auth tokens, payment fields, or unsent
  drafts.
- Capture is local-only. No external account, no telemetry, no phone-home.
- The blacklist is **default allow, explicit deny**. If something is
  inaccessible it is logged silently as `wasn't accessible - <reason>` — never a
  popup, never a prompt mid-capture.

## Verification

- `npm test` — the whole suite. Every new source module is picked up
  automatically by `tests/wiring.test.js`, which asserts that no module calls an
  identifier it cannot resolve; missing imports are otherwise invisible to both
  the bundler and stubbed tests.
- `npm run build:preview` — must be clean.
- Before merging: download the ZIP and open it.

## Open items

- The user has 10 open pull requests and has asked for a merge, but the target
  is ambiguous. **Do not merge until the target is confirmed.** See
  `spec/MERGE_PLAN.md`.
