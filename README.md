# OddBrain

A local-first Windows desktop assistant with chat, projects, artifacts, a Markdown vault and a browser companion. It connects to separately installed engines and keeps source conversations distinct from AI interpretations and user-confirmed memory.

**Development status:** recoverable browser capture is implemented. Better recall, grouped review and the next People/Journal/Life Story improvements remain in progress. The independently verified reliability repairs have been integrated with regression coverage. This is not a fully accepted or signed release.

[Project context, requirements, known issues and verification →](CONTEXT.md)

## Repository

| Path | Purpose |
|---|---|
| `apps/03_oddbrain/` | Shipped application: Electron, React and TypeScript. |
| `extension/` | Chromium Manifest V3 companion, version 0.5.0. |
| `vault/Brain/` | Starter vault, templates and engine rulebooks. |
| `apps/03_oddbrain/store/packs/` | Installable skills and prompts. |
| `.github/workflows/` | Linux/Windows checks and Windows installer build. |
| `apps/01_claude-exact-pixel-clone/`, `apps/02_electron-claude-clone-v6/` | Historical prototypes, not the shipped application. |
| `CONTEXT.md` | The single maintained project-context document. |

Runtime Markdown, skill files and legal notices remain in their required locations; they are not additional project handovers.

## Run from source

Use Node.js 22.13 or newer. Install the desired engine separately and configure its executable in the app. Ollama is a separately installed model server, not a bundled download.

```sh
cd apps/03_oddbrain
npm ci
npm run dev
```

For the browser-only UI preview:

```sh
npm run dev:web -- --host 0.0.0.0
```

A browser preview is not a substitute for the native Electron app or its IPC/engine integrations.

## Browser companion

1. Run the desktop app and select a vault.
2. Load `extension/` unpacked from Chrome or Edge's extension manager.
3. Copy the app's pairing token into the extension's connected-app settings, test the connection and permit browser capture.
4. Grant access to any desired people/Classroom sites, then open the conversation itself.

The companion captures accessible content in supported open conversations, not an entire account archive. It does not collect browser history. Fully queued data can retry after a normal browser restart; incomplete attachment downloads still need the source. See [capture coverage and limits](CONTEXT.md#install-and-collection-coverage) before relying on it.

## Verify and package

Run from `apps/03_oddbrain/`:

```sh
npm run typecheck
npm test -- --maxWorkers=2
npm run build
npm run build:web
npm run smoke       # requires a working native Electron environment
npm run dist:win    # Windows packaging; CI can produce the installer artifact
```

Browser tests need an installed Chromium and `ODDBRAIN_BROWSER_OPTIONS` pointing to its Playwright launch-options JSON. UI suites also need their preview servers; see the scripts and [verification scope](CONTEXT.md#verification-scope). Report browser/platform skips explicitly.

Current source baseline, historical test results, independently verified faults and other-branch audit evidence are recorded in [CONTEXT.md](CONTEXT.md#independent-audit-of-other-agents-claims). Passing automated checks does not establish real-account or target-laptop acceptance.

## License

[Apache-2.0](LICENSE). Preserve the bundled third-party notices and licenses.
