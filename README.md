# OddBrain

A Windows desktop app that drives local coding-agent CLIs — Claude Code and
Google's agy — inside one window, and keeps everything they do in a vault you
own. Local-first: no model and no telemetry ship with it. Free local brains come
from Ollama on the same machine.

**Status: built and tested, not yet used by a human for real work.** The gate is
green on this tree (numbers below), the installer is unsigned, and the owner's
first signed-in session with a model has not happened yet. Everything in this
file describes what the code does today, not what a roadmap wishes it did.

This is the only Markdown file in the repository. The `store/packs` files ending
in `.md` are product data the app reads at runtime — skill prompts and prompt
starters — not documentation.

## What it is

OddBrain is a front end for agent CLIs you already install and sign into. It
starts them, speaks their stream-json protocols, and renders each step as
something you can read, approve, undo, and find again later.

- **Engines:** exactly two — `claude-code` and `agy`. Both are detected on the
  machine, never invented. Each has a *Point to the exe…* override in Settings.
- **Ollama is not an engine.** It is the local brain server: a model runtime the
  app can start, stop, and talk to. It never appears as a third engine.
- **The vault** is an Obsidian-compatible folder: conversations, sources,
  entities, events, working memory, review queues, journal, and an undo log.
  Point it anywhere; nothing is written outside the folder you chose.
- **The extension** captures browser pages into the same vault. It starts on the
  AI sites it declares in its manifest; broad access to every site is one
  explicit Chrome permission away, requested from the extension's own popup, and
  the blacklist applies either way (an empty blacklist means "check everything"
  once broad access is on). It is a separate program with its own port, pairing
  token, and permission boundary.
- **Artifacts** are files the engines make or you attach: previewed in-app,
  poppable to their own window, exportable to PDF, and restorable from the
  checkpoint taken before every approved write.

## Run it

Requirements: Windows 10/11 x64 for the desktop build; Node.js 22.13 or newer.
CI runs the same checks on Linux; neither Linux nor macOS is a supported product target.

```bash
npm ci            # dependencies exactly as locked
npm run dev       # electron-vite dev, app window with HMR
npm test          # vitest, full suite
npm run typecheck # tsc --noEmit
npm run build     # typecheck, then main/preload/renderer bundles, then the offline preview HTML
```

Packaging (Windows):

```bash
npm run dist:win       # NSIS installer into dist/
npm run dist:win:dir   # unpacked folder, faster to inspect
```

The installer is per-user, so it does not ask for administrator rights, and it
is unsigned, so Windows shows the "unknown publisher" warning. There is no
certificate in this repository and none is pretended.

Optional browser extension: open `chrome://extensions` in Edge or Chrome, turn on
Developer mode, choose *Load unpacked*, and select the `extension/` folder (the
installed app also ships a copy as `resources/extension`).

## Repository layout

The app is the repository root. There is no monorepo and no second app.

```
src/main/        Electron main process: engines, vault, artifacts, downloads,
                 media decoding, extension API, watchers, window bounds
src/preload/     the contextBridge surface — the only thing the window can call
src/renderer/    React 19 interface (components, ui/, hooks, styles)
src/shared/      types and pure rules used by both sides (engines, providers,
                 palettes, motion kit data, pack format, permissions)
tests/           Vitest suite; node and jsdom environments
scripts/         build, icon, UI-check and media-runtime scripts
store/packs/     the community pack index shipped with the app (skills + prompts)
extension/       Manifest V3 browser extension (capture, pairing, blacklist)
resources/       app mark and generated icons
.github/         CI: checks on Linux + Windows, installer build on tags
```

## Engines and the rules around them

| Engine | Wire | State |
| --- | --- | --- |
| `claude-code` | `claude` CLI, stream-json | full turn path; permission prompts and denies are forwarded |
| `agy` | Google Antigravity CLI, stream-json | wire implemented against the real binary; a signed-in turn has not been driven |
| Ollama | local HTTP at `127.0.0.1:11434` | local brain server, not an engine |

Rules the code enforces:

- Engine binaries are found on `PATH` (including `winget`, `npm` and portable
  locations), and a missing one is reported as missing. No engine is listed
  unless it exists on this machine.
- Spawning passes an argument vector, never a shell string. On Windows the
  executable path is quoted by `shellSafeCommand`; the app never builds a command
  line out of model output.
- Every file-touching step from an engine needs your approval. "Full speed" is
  the single switch that turns approval cards off, and it says so on the switch.
- Before an Allow is forwarded, a checkpoint is taken. If the checkpoint cannot
  be taken, the change is denied rather than allowed blind.
- A Deny reaches the engine as a real deny, not as silence.
- Downloads come only from each publisher's official host and its declared
  redirect hosts, capped in size, written to the app's own engines folder,
  hashed with SHA-256, and — on Windows — run only after a second, explicit
  permission that shows the full command.
- With "Warm runtime" on, the staged Ollama runtime starts with the app and the
  app stops only the runtime it started. An Ollama installed elsewhere is used
  as-is — stop it your way. Installing it yourself is fine:
  `winget install Ollama.Ollama`.

## Security walls

These are code, not policy prose. Each one has tests.

- **Keys never leave the main process.** Provider API keys are sealed with the
  OS facility (Electron `safeStorage`) and are only decrypted in main. The
  renderer sees a label, a source, and whether a key is saved — never the key.
- **One IPC door, checked twice.** `ipcGuard` registers every handler with a
  caller check against the parsed origins the app itself loaded. A window that
  navigates elsewhere loses the whole surface.
- **Extension pairing is consensual.** The extension API listens on a fixed
  localhost port, requires a per-install pairing token, and allows only
  `chrome-extension://` origins. It exposes no chat, model, or key routes, so a
  browser extension can never spend a saved key.
- **Redirects are pinned.** A download that redirects off the publisher's
  declared host list is refused; each hop is parsed, not prefix-matched.
- **Zip handling is deliberately narrow.** Stored/deflate only, a zip-slip
  refusal, an entry-size ceiling, and a forged-declaration check before any
  OOXML/ODF part is expanded. DTDs and entity declarations are rejected.
- **Paths stay inside the vault.** Relative paths are resolved and compared
  against the vault root; `..` escapes and absolute surprises are refused.
- **Documents are decoded locally.** PDF text, Office/ODF text, images and
  audio stay on the machine. PDF.js asset URLs are normalised with a forward
  slash so the same path works on Windows and Linux.
- **No telemetry, no cloud service, no bundled model.** Cloud providers are
  optional and only run after you add a key. Nothing is sent anywhere by default.
- **Speech stays local and opt-in.** Dictation uses Windows System.Speech on the
  machine; it listens only while you are dictating, and there is no wake word,
  no background recording, and no cloud speech provider unless you add one.

## The interface, by the numbers

- **Six sidebar destinations:** Chat, Artifacts, Today, Projects, Vault, Brain;
  plus a full-screen Code board reachable from the command palette.
- **18 Settings destinations**, in six groups:
  - Your space: Appearance; Windows & shortcuts
  - Models & runtime: Engine; Models & API keys; Performance
  - Access & connections: Agent access; Connectors; Plugins
  - Files & memory: Voice & files; Vault; Memory; Browsing maps
  - Agent behavior: House rules; Skills; Recipes; Hooks
  - Application: System; About & help
- **Appearance has 5 tabs:** Looks, Layout, Details, Brain, Mixes.
  - 10 palettes: app, studio, paper, midnight, sage, peach, blue, citrus, rose, mono.
  - 8 look presets. A preset applies once and is then yours to edit.
  - 8 layouts: classic sidebar, top bar, rail + list, command first, list + detail,
    bento dashboard, console, floating window.
  - 4 interface styles: Editorial, Soft studio, Ink & paper, Glass studio.
  - A live miniature updates as you choose; nothing is applied to a screenshot.
- **77 motion scenes:** 76 scenes plus one loader, keyed to real engine states,
  pausable (Calm/Still and OS reduced-motion), never blocking input.
- **Everything on screen is real.** No dummy switches, no fake-live indicators,
  no invented model names, no "10M+" counters. Status is words, and every number
  shown is countable in the app.

## Decisions that shaped this repository

- **Windows desktop only.** The product targets Windows; CI also runs the checks
  on Linux for speed. There is no web build of the product — the single-file
  offline preview exists only as an export asset.
- **Two engines, one local server.** No third engine, no hosted model of our own.
- **The vault is the memory.** The app writes Markdown and plain files a person
  can open in Obsidian; no database owns the notes.
- **No sample vault in the repository.** A fresh clone has no notebook in it; the
  first run lands in the user's app-data folder and Settings can point the app
  anywhere. This rebuild removed the checked-in sample vault and the code path
  that looked for one.
- **One README, no docs tree.** Product facts live here. The repository carries
  no `docs/`, `spec/`, `memory/`, or living-docs folder to drift out of date.
- **Flattened layout.** The app moved from `apps/03_oddbrain/` to the repository
  root; the two other prototype apps in the old tree were deleted. Workflows,
  builder paths, and test imports were updated to match.
- **English only, blunt copy.** No other locales ship. The interface says what
  happened and what it will not do.
- **No new fonts, no cloud sync, no microphone, no telemetry.**

## The gate

Run on this tree, on 2026-10-18:

```
npx tsc --noEmit -p tsconfig.json     exit 0
npx vitest run                        124 files passed, 859 tests passed
npm run build                         exit 0 (main, preload, renderer, preview)
```

CI runs the same gate in `.github/workflows/checks.yml` on every push: Linux
(install, types, tests, build) and Windows (npm ci, types, tests with a JUnit
report and a commit comment naming failures, build, and a five-minute
`electron . --smoke`). `.github/workflows/installer.yml` builds the NSIS
installer, its checksum, and publishes them on a tag.

The Windows PDF failure that this branch inherited is fixed here: pdf.js now
receives a forward-slash data directory on both platforms, and a test pins it.

## Known limits

- The owner's first real signed-in session, on both engines, has not happened.
- The agy wire is implemented but unproven against a live signed-in turn.
- No signed installer; SmartScreen will warn.
- OCR is not built in. Scanned PDFs without a text layer are reported as having
  no extractable text, and a vision provider or OCR export is the way through.
- The browser extension is loaded unpacked; it is not in a store.
- Smoke testing needs Electron's binary, which is downloaded at install time and
  cannot be fetched in a network-restricted sandbox. CI runs it on Windows.

## License

Apache-2.0. See `LICENSE`. Engine CLIs are your own installs; no Anthropic or
Google assets are bundled. The vault you point the app at is yours, including
everything the app writes into it.
