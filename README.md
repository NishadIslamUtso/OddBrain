# OddBrain

A local-first Windows desktop assistant with chat, projects, artifacts, a Markdown vault and a browser companion. It connects to separately installed engines and keeps source conversations distinct from AI interpretations and user-confirmed memory.

**Development status:** recoverable browser capture is implemented. Cross-source keyword search, grouped review, People timelines and verified full-vault folder backups are implemented. Natural-language recall and real-account/target-laptop acceptance remain unfinished. The independently verified reliability repairs have been integrated with regression coverage. This is not a fully accepted or signed release.

[Project context, requirements, known issues and verification →](CONTEXT.md)

## Repository

| Path | Purpose |
|---|---|
| `apps/03_oddbrain/` | Shipped application: Electron, React and TypeScript. |
| `extension/` | Chromium Manifest V3 companion, version 0.5.0. |
| `vault/Brain/` | Starter vault, templates and engine rulebooks. |
| `apps/03_oddbrain/store/packs/` | Installable skills and prompts. |
| `.github/workflows/` | Linux/Windows checks and Windows installer build. |
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

Startup animation: **Settings → Appearance → Brain & motion → Startup animation → On / Off**.

## Finding things

Settings has eight groups, with search across every setting. Appearance experiments are in **Appearance → Looks lab**; hooks, folder watches and extra AI review are under **Advanced tools**. Saved choices are preserved.

**Vault → Capture sources** is the single home for source details. In **People**, content comes first; account linking, merging and history are behind **Manage person**.

Use the search button or **Ctrl K** to find app chats, captured conversation text, confirmed memory and saved Markdown files. Results open their sources; this is word search, not an AI-generated answer. Searching does not upload your records or need a running model.

In **Memory inbox**, select related suggestions, inspect their wording and quotations, then confirm the group. Nothing is preselected. **People**, **Journal** and **Life Story** offer readable timelines and in-view search; unknown event dates stay unknown.

### Backup and recovery

In **Vault → Backup & restore**, choose **Back up full vault**. This includes saved attachment bytes and the review database, unlike Markdown export. Keep the copy private and on another drive when possible.

**Restore into a new folder** checks file hashes and never replaces the active vault. After checking the restored copy, choose it under **Settings → Memory & files → Vault**. The current limit is 50,000 files / 2 GiB; larger or linked vaults need a filesystem backup. Installed models, app credentials and unsent browser queues are outside this backup. It is a manual snapshot, not a scheduled backup service.

## Appearance and AI sources

Fresh profiles and **Reset appearance** use **Ink & Sketchbook**, including its eight brain-behaviour roles. Existing saved choices are preserved. Settings groups now describe their contents and expand their pages in the sidebar.

**AI & connections → Connectors** has shortcuts to Skills, the engine plugin catalogs and API providers. **Models & API keys** supports Anthropic, OpenAI, Gemini, OpenRouter, Groq, DeepSeek, xAI and custom OpenAI-compatible endpoints; Ollama is optional. Available engines/models still depend on the configured adapter. Skills and Plugins also remain under **Advanced tools**. Claude catalogs are available; agy's store adapter is not implemented. MCP configuration is not a universal connector marketplace.

## Browser companion

1. Run the desktop app and select a vault. Open **Settings → AI & connections → Connectors**.
2. Choose **Save extension to Downloads**, or **Choose extension folder…**. The app exports its bundled files into a new folder with `INSTALL.txt`; no download or account is required.
3. In `chrome://extensions` or `edge://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select that folder. Keep it in place.
4. Use **Browser capture permissions** to permit capture, then return to Connectors and copy the pairing token from **Agent access**. Paste it into the extension's **Settings → Connected app**, and **Save & test connection**.
5. Grant access to any desired people/Classroom sites, then open the conversation itself.

Browser approval is still manual; exporting files does not install, pair or grant permissions. Browser-only previews cannot export. Finish queued captures before removing/replacing an older extension. Native folder dialogs and loading this export on the target laptop still need acceptance.

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

[Apache-2.0](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES) and bundled pack licenses.
