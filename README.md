# OddBrain

Local-first desktop assistant for Windows, with a browser extension and a browser-only UI preview. Built with Electron, React and TypeScript.

## Current rebuild

The owner approved a clean repository rebuild on 2026-10-18. The selected UI/UX is `arena/cc83a507-oddbrain` at **df4226a85be1efd67f8cb5ed7c4d4f63e223d38c**. This rebuild runs on **arena/0bd5478b-oddbrain**. Git history is preserved; the old workspace layout, archived prototypes, duplicate specifications, agent instructions and competing context files are removed from the working tree.

This is a clean repository assembly using the selected UI's real implementation, not a claim that every feature was rewritten. Modules were brought over as explicit groups: shared contracts, renderer/UI, preload bridge, main-process services, extension, resources/store and regression tests. The existing process-ownership regression was retained from this branch. No new external service or model is introduced.

**This README is the only tracked Markdown file and the only project context document.** Runtime skill/prompt Markdown is stored losslessly in `apps/desktop/store/bundled-markdown.json` and recreated at its original paths before development, tests and builds. Those generated files are ignored; the skill format and installed pack behavior stay intact.

## Quick start

Requires **Node.js 22.13+** and npm. Desktop operation requires Electron and a graphical session. Windows is the intended installed-app target.

```sh
npm ci
npm run dev
```

To inspect the same UI without Electron:

```sh
npm run dev:web
```

The web preview listens on port **5174**, binds to `0.0.0.0`, and accepts preview-proxy hosts. It cannot access your real vault, native dialogs, engines or credentials. Sample workspace records are explicitly labelled and stored separately from normal work. They are not real engine responses.

## Commands (run at repository root)

| Command | Purpose |
|---|---|
| `npm ci` | Install the locked workspace dependencies, including Electron |
| `npm run dev` | Run the desktop app in development |
| `npm run dev:web` | Run the browser UI preview |
| `npm run typecheck` | Check application TypeScript |
| `npm test` | Check repository structure/assets, then application regression suites |
| `npm run build` | Build main, preload, renderer, media worker and standalone UI export |
| `npm run build:web` | Build the browser preview into `apps/desktop/dist-web` |
| `npm run test:ui` | Run the full browser suite against Vite, including isolated engine/graph fixtures |
| `npm run test:ui:production` | Run production-compatible UI checks against the built browser preview |
| `npm run test:media-runtime` | Exercise the built media worker with generated fixtures; optional local FFmpeg |
| `npm run smoke` | Build and launch the actual Electron window with smoke assertions |
| `npm run check` | Run types, tests and both production builds |
| `npm run dist:win` | Build an unsigned Windows installer |
| `npm run dist:win:dir` | Build an unpacked Windows application |

The full suite deliberately imports development modules for isolated engine-event and graph fixtures; it is not a production-bundle test. The production suite omits those source-injection fixtures and checks the shipped bundle instead. CI runs both modes separately.

Browser tests require Chromium: `npx playwright-core install chromium`. Start the preview first; tests default to `http://127.0.0.1:5174/`. Set `ODDBRAIN_UI_URL` for another address, `ODDBRAIN_QA_DIR` for evidence output, and optionally `ODDBRAIN_BROWSER_OPTIONS` to a JSON launch-options file. These loopback URLs are for local test tools, not cross-service browser calls.

In environments that block Electron downloads, `npm ci --ignore-scripts` permits type checks, unit tests and web builds. It does **not** install Electron or prove desktop operation. Native packages used by local media decoding must also be available for those tests.

## Repository

```text
apps/desktop/
  src/main/       Native services, IPC, engine processes, vault, media worker
  src/preload/    Explicit renderer-to-main API
  src/renderer/   Selected UI, settings, components, state and browser sample bridge
  src/shared/     Shared types, validation and environment-independent logic
  resources/      App icons and generated offline UI export
  store/          Bundled pack catalog and runtime-asset source manifest
  tests/          Application regressions and fixtures
  scripts/        Build, browser acceptance and packaging tools
extension/        Browser extension source; shipped alongside the desktop app
scripts/          Repository integrity checks
.github/workflows/ Automated cross-platform gate and browser evidence
package-lock.json Single workspace dependency lock
README.md         Setup, architecture, decisions, verification and remaining work
```

## Features being preserved

- **Chat:** engine/model choice, streaming, Stop, drafts, attachments, permissions, work queue, checkpoints/restore and optional tool-free review.
- **Work surfaces:** Chat, Artifacts, Today, Projects, Vault, Brain and Code. Artifact versions, export, Trash and restore remain native services, not preview-only controls.
- **Chosen appearance:** original preset/layout/palette collection, reading controls, design systems, scene catalog, launch animation, graph controls, saved looks and standalone preview export. No replacement design or new font is being imposed.
- **Engines:** Claude Code and agy executable discovery, explicit file picker, persisted overrides and reset. Ollama is the local model server, not a third agent engine. Start/Stop must respect process ownership. External executables are installed separately; navigation must not download tools automatically.
- **Vault and memory:** local Markdown records, links, projects, journal, graph, retention controls and restore history. The old repository's sample vault is not copied into the owner's actual data.
- **Extension:** pairing, consent, capture, outbox and browser-tool integration. The extension can be loaded unpacked from `extension/`; installed-app pairing still requires real-machine verification.
- **Connectors and packs:** existing provider gates, keys held in main, bundled store, guarded external catalogs and exact-action approvals. agy catalog installation is unavailable without a verified adapter; no fake store is added.
- **Files and voice:** local document/image/media extraction, optional explicitly selected provider extraction, installed-voice read-aloud and existing dictation controls. Preserve bounded workers, explicit upload consent, cancellation and original files. Continuous background voice, Jarvis and wake word remain unimplemented.

These are retained implementation areas, **not blanket acceptance claims**. Tests and manual checks must establish each operating mode. No authenticated engine turns, physical microphone input or paid-provider requests are fabricated to make the interface appear connected.

## Security and data rules

- Credentials remain in the native process. No telemetry or new cloud service is added.
- Keep shell argument validation, IPC guards, path containment, redirect/digest checks, archive limits, pairing consent and per-action approval checks.
- Never stop a process merely because it answers a port. Stop only a process whose ownership is established by this app.
- Browser examples stay isolated from real data and cannot claim native success.
- Do not place actual vault data, models, keys, recordings or generated installers in Git.
- Installer output is unsigned until a real signing certificate is configured. Windows may warn about an unknown publisher. Uninstall must preserve user data.

## Verification and remaining work

The clean root gate (`npm ci --ignore-scripts` followed by `npm run check`) completed with exit **0** on this rebuilt tree. Source-branch counts are not used as evidence. The desktop runtime remains blocked as stated below; this is not a full native-app acceptance claim.

| Check | Current rebuild result |
|---|---|
| Clean locked installation | `npm ci --ignore-scripts --no-audit --no-fund`: exit 0 |
| Repository integrity | 5 checks passed: structure, documentation, lossless runtime assets, packaging paths and pinned store checksums |
| Application TypeScript | Passed with no errors |
| Application regressions | **860 tests passed in 125 files**; includes the preserved process-ownership regression |
| Production builds | Electron main/preload/renderer/media worker, offline HTML export and browser build passed |
| Full browser suite | All 8 scripts completed; exit 0 against the Vite renderer |
| Production browser suite | All 6 production-compatible scripts completed; exit 0 against the actual web build |
| Built media worker | Passed text/Office/image decode, encryption refusal, short-video frame extraction, original preservation and cancellation; non-Windows speech refuses honestly |
| Dependency audit | `npm audit`: 0 advisories |
| Electron installation / smoke | Failed: official and mirror runtime downloads returned fetch errors; smoke cannot launch without the Electron binary |
| Hosted CI / Windows installer | Workflows configured and syntax checked, not executed for this unpublished rebuild |
| Installed Windows / authenticated engines / physical devices | Not verified |

Browser evidence is generated under `apps/desktop/qa-ui/development` and `apps/desktop/qa-ui/production` (ignored). It covers the chosen appearance inventory, settings, layouts at the minimum desktop size, graph interaction, source-labelled samples, draft preservation and offline export. Fixtures test event routing; they do not constitute live engine/provider acceptance. Local tests used a Chromium binary supplied through an external npm tool directory, with no added production dependency. Media acceptance used an external test-only FFmpeg executable, not an app-triggered download.

An initial attempt to run the development fixture suite against production correctly failed because source-module injection is unavailable there. Separate commands and CI steps now distinguish those modes. A concurrent development reload exceeded the original 7-second navigation limit; navigation has a 30-second bound now, and the complete full-suite rerun passed. No failing application assertion was disabled.

Build output still reports a large browser bundle and CSS-minifier warnings for the standard `::highlight` pseudo-element. Browser acceptance reported no runtime page errors; these build warnings have not been hidden.

### Remaining acceptance

1. Install/run on Windows at the owner's display scale. Verify signed-in Claude Code/agy turns, permissions, checkpoint/restore, executable selection, Ollama boot/start/stop ownership, native dialogs, pop-outs, global shortcut and extension pairing/capture.
2. Test installed recognition languages, physical microphone/speaker and explicitly selected provider file/transcription requests with the owner's credentials. Never substitute fixtures for these claims.
3. Exercise the unsigned installer. A manual **Windows installer** workflow builds an artifact without publishing a release; it has not run for this rebuild.
4. Optimize the large renderer bundle without changing the selected UI or weakening acceptance tests.

The previous QA tree's custom built-driver was not brought over: it missed a real error boundary, skipped ambiguous serve ownership, measured the wrong geometry elements and hung during shutdown. Its former success summaries are not evidence for this rebuild. Native Agent access and serve ownership still require actual desktop acceptance, even though browser and unit checks now pass.

Next work should target these concrete gaps, not recreate competing specifications or redesign the chosen UI. Update this file instead of adding context/status documents.

## Working agreement

The owner asked to rebuild cleanly, preserve the selected UI/UX and real capabilities, work as far as possible without repeated prompting, and ask before assuming consequential product decisions. The previous orchestrator/QA-only assignment is superseded by that approved rebuild. Work remains on this session's fixed branch. No other branch is modified. No release or pull request is implied by local changes; ask before publishing this newly scoped rebuild.

## License

Apache-2.0; see `LICENSE`. Retain third-party attribution and license metadata bundled with source assets and dependencies.
