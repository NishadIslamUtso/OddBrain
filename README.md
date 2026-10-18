# OddBrain

**Status (18 October 2026): UI-first desktop rebuild, alpha.** This is a local workspace with a desktop shell and a separate browser preview. It is **not currently an AI assistant**: no engine is connected, no prompt is sent, and no generated reply is shown. The interface says so wherever an engine-dependent action would otherwise appear to work.

The appearance and interaction patterns are adapted **piece by piece** from the [chosen UI branch](https://github.com/NishadIslamUtso/OddBrain/tree/arena%2Fcc83a507-oddbrain) (UI commit `df4226a`): warm neutral shell, 260 px sidebar, compact header, mascot, chat composition, artifacts, settings, and graph canvas. Its sample replies and browser-only stand-ins were deliberately **not** imported as real desktop behavior. The earlier, much larger app remains in Git history at `c13808b`; passing checks for that old app do not validate this rebuild.

## What you can do now

| Area | Behavior in this rebuild |
| --- | --- |
| Chat | Save **your own notes**, rename chats, search them, assign an existing project, and copy notes (with a selectable-text fallback if clipboard access is blocked). There is no send-to-model action. |
| Projects / Today | Create and rename projects; view real counts and recent saved notes. No inferred activity or fabricated usage. |
| Artifacts | Import local HTML, SVG, TXT or Markdown (up to 256 KiB), save source revisions, filter/search/sort, download a selected version, move items to Trash and recover all revisions. HTML/SVG previews use a sandboxed iframe and a restrictive document policy; preview content is not executed with app privileges. |
| Vault / Brain (installed desktop app) | Pick a local folder using the native dialog; read Markdown notes **without modifying them**. Linked paths and files over 128 KiB are skipped. Brain draws only resolved `[[links]]`; unresolved and ambiguous links are counted, not guessed. |
| Appearance / Data | Save light, dark or system theme, accent, width and motion preferences. Export workspace JSON; importing it or resetting data is not offered yet. |
| Code / Engine | Visible as **not connected**. No file editing, CLI spawn, provider authentication, automation, or model response exists in this stage. |

The **browser preview** has no native file access. It saves actual local records in that browser's `localStorage` under `oddbrain-ui-first:v1`, separately from the installed desktop app. Its header says “Browser preview”; folder-selection controls are unavailable. A preview is not an installation or a native acceptance test.

## Run and verify

Node.js **22.12+** and npm are required. From `apps/03_oddbrain`:

```bash
npm ci
npm run typecheck
npm test
npm run format:check
npm run build             # Electron main, preload and renderer
npm run build:web         # standalone browser preview
npm run dev:web           # browser preview, port 5174
```

`npm run dev` starts the Electron development app when an Electron binary is installed. After `npm run build`, `npm run smoke` checks a **native** painted window, scroll movement and startup console messages. On Linux it requires a display (for example `xvfb-run -a npm run smoke`). The browser preview is served by Vite; `npm run preview:web` serves its production build on port 4174.

Current local evidence for this rebuild: **6 Vitest files / 22 tests passed**, typecheck passed, Electron and browser production builds passed, and a headless Chromium browser run at 1280×820 and 390×844 opened the screens with no console warnings or errors. **Native Electron smoke and a Windows installer have not been run locally**: this sandbox cannot obtain Electron's binary from its release download host. The Linux and Windows CI workflow runs the native smoke when the branch is pushed; do not describe it as green until that run finishes. No human Windows install or real engine session has been verified for this rebuild.

An **unsigned alpha Windows installer** can be built manually on Windows with `npm run dist:win`, or via the manually triggered “Windows alpha package” workflow. It is not auto-released. Windows may show an unknown-publisher warning; installation remains unverified until someone actually tries the package.

## Data and boundaries

- The desktop app keeps its new validated records in `workspace-v1.json` under Electron's per-user `userData` directory (see **Settings → Data** for the actual path). Writes check the revision, serialize competing requests and replace the file atomically; unreadable or unknown schemas are not overwritten. Chats, projects, artifacts, versions, Trash and appearance have explicit size/record limits. The previous app's data is **not migrated, imported or deleted** by this rebuild. Make a backup before experimenting with old installs.
- The chosen vault folder path is stored separately in `vault-folder.txt` under `userData`. Vault operations are read-only, require a native folder selection, reject path traversal and symlinked files, and never turn vault notes into generated chat content. Brain graph display preferences are UI-local preferences, not edits to Markdown.
- The preload exposes only scoped workspace, vault and app-information methods. Main-process IPC checks the originating main frame. Renderer navigation and new windows are constrained; the renderer has no Node integration. Artifact previews are sandboxed. These boundaries are tested for malformed data, revision conflicts, path escapes and static symlinks; native and Windows security acceptance still needs to happen.
- No telemetry, cloud service, model binary, signed installer or extension integration ships in this alpha. npm downloads development dependencies at install time; that is not runtime telemetry.

## Source layout and next integration steps

`apps/03_oddbrain/src/shared` defines the data contract; `src/main` owns disk storage, vault reading and native IPC; `src/preload` is the narrow bridge; `src/renderer` contains the selected-UI-derived shell, screens, graph and motion artwork; `tests` covers storage, safety and UI behavior. `resources` holds the selected UI branch's installer icons. `.github/workflows/checks.yml` runs tests/builds/native smoke on Linux and Windows; the Windows package workflow is manual.

Next, in order: (1) get a native smoke and manual Windows install on this exact build; (2) verify real vault-folder behavior and artifact export with owner-owned data; (3) reintroduce engine discovery and one genuine engine turn behind explicit file-change approval, checkpoints and tests; (4) only then restore other historical features one piece at a time. Until those boundaries are restored and verified, their buttons must remain absent or unavailable. **Do not copy sample conversations, status chips or an old application snapshot and claim they are live integrations.**

The browser extension, sample vault, other apps and non-app resources remain untouched by the app reset. Older planning, handoff and audit Markdown elsewhere in the repository is **historical**, not a description of this alpha. This root README is the single current human-facing guide; runtime vault templates, skills and examples remain as Markdown where they are used. The root documents removed during consolidation can still be read from Git history at `c13808b`.

OddBrain's own code is [Apache-2.0](LICENSE). Engine CLIs, if reintroduced in a later stage, are the user's own installations; none is bundled here.
