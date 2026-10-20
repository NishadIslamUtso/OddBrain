# OddBrain

A local-first Windows desktop assistant with chat, projects, artifacts, a Markdown vault and a browser companion. It connects to separately installed engines and keeps source conversations distinct from AI interpretations and user-confirmed memory.

**Development status:** recoverable browser capture is implemented. Cross-source keyword search, grouped review, People timelines and verified full-vault folder backups are implemented. Natural-language recall and real-account/target-laptop acceptance remain unfinished. The independently verified reliability repairs have been integrated with regression coverage. This is not a fully accepted or signed release.

[Project context, requirements, known issues and verification →](CONTEXT.md)

## Repository

| Path | Purpose |
|---|---|
| `apps/03_oddbrain/` | Shipped application: Electron, React and TypeScript. |
| `extension/` | Chromium Manifest V3 companion, version 0.5.1. |
| `vault/Brain/` | Starter vault, templates and engine rulebooks. |
| `apps/03_oddbrain/store/packs/` | Installable skills and prompts. |
| `.github/workflows/` | Linux/Windows checks and Windows installer build. |
| `CONTEXT.md` | The single maintained project-context document. |

Runtime Markdown, skill files and legal notices remain in their required locations; they are not additional project handovers.

## Run from source

Use Node.js 24 LTS (`.nvmrc`, package requirements and CI agree). Electron 41 has its own embedded Node 24 runtime; changing the development runtime does not replace external engines. Install the desired engine separately and configure its executable in the app. Ollama is a separately installed model server, not a bundled download.

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

Use the search button or **Ctrl K** to find app chats, captured conversation text, confirmed memory and saved Markdown files. Put an exact phrase in quotes. Saved results are ranked, with the best three matching messages per conversation; limits are reported. The palette supports arrows, Home/End and Enter. **Vault** uses the same guarded search when you press Enter. Results open their sources; this is word search, not an AI-generated answer. Searching does not upload your records or need a running model.

In **Memory inbox**, select related suggestions, inspect their wording and quotations, then confirm the group. Nothing is preselected. **People**, **Journal** and **Life Story** offer readable timelines and in-view search; unknown event dates stay unknown. Open **Evidence and revisions → Copy with sources** to copy a record with its quotation, qualification and review status. This does not approve it or send it to a model.

### Backup and recovery

In **Vault → Backup & restore**, choose **Back up full vault**. This includes saved attachment bytes and the review database, unlike Markdown export. Keep the copy private and on another drive when possible.

**Restore into a new folder** checks file hashes and never replaces the active vault. After checking the restored copy, choose it under **Settings → Memory & files → Vault**. The current limit is 50,000 files / 2 GiB; larger or linked vaults need a filesystem backup. Installed models, app credentials and unsent browser queues are outside this backup. It is a manual snapshot, not a scheduled backup service.

## Appearance and AI sources

Fresh profiles and **Reset appearance** use **Ink & Sketchbook**, including its eight brain-behaviour roles. Existing saved choices are preserved. Settings groups now describe their contents and expand their pages in the sidebar.

**AI & connections → Connectors** has shortcuts to Skills, the engine plugin catalogs and API providers. **Models & API keys** supports Anthropic, OpenAI, Gemini, OpenRouter, Groq, DeepSeek, xAI and custom OpenAI-compatible endpoints; Ollama is optional. Available engines/models still depend on the configured adapter. Skills and Plugins also remain under **Advanced tools**.

**Skills, Plugins and Connectors** have a source picker for Claude Code or agy. Claude offers Anthropic's official marketplace and saved public GitHub sources; agy reads its official Antigravity catalog, with a labelled engine-cache fallback when offline. Changes require command review, and installed state can be read back from the engine. These catalogs distribute whole plugin packages, which can include skills, connectors, hooks, rules and agents—not independently installable items in every category.

The **shared skill collection** and **shared MCP configuration** still deploy to both engines; engine-marketplace actions affect only the chosen engine. Packs, API providers and Ollama remain separate. Installed/enabled does not mean a connector is authenticated or working. Interactive plugin settings and sign-in remain in the engine. The agy adapter has regression and fixture-process coverage; live Google-catalog access, real agy installs and target-laptop acceptance are still pending.

### Models and reasoning controls

The model picker distinguishes **CLI login**, **Anthropic API** and Ollama routes. Native Claude and agy choices come from their installed CLIs, not a bundled model list; listing a model does not prove your account can use it. Manual model entry in engine settings also has a source selector.

- **Composer → engine menu → Reasoning effort** offers only runtime-confirmed levels for the selected native model. Changes apply to the next message. **Engine default** keeps the CLI’s own setting; it does not mean reasoning is off.
- **Composer → More chat tools → Show thinking** only shows or hides thinking supplied by the engine. It never changes effort, sends another request or creates an explanation.
- agy uses a version-gated, read-only native model report. Its effort adapter is conditional: without recognized native metadata, only **Engine default** is offered. No raw native effort capture or signed-in agy acceptance has been established here. Non-native-provider effort remains unverified too; another model’s levels are never borrowed. Old saved **Extended** settings migrate to **Engine default**, not assumed High.
- agy streams replies and tool activity, preserves partial failures, and avoids adding cumulative session usage repeatedly. Resumed usage is omitted when this turn cannot be separated; prices are not invented.
- agy’s current connection is **text-only, without interactive approval cards**. Its **Native rules / Plan / Allow edits / Allow tools** controls use native policies. Saved rules can already allow actions; **Allow tools** explicitly skips tool permission prompts, not artifact review. Pictures are refused before sending, with no engine substitution.

## Drafts, records and package inspection

- **More chat tools → Saved drafts** stores text copies on this device. Insert appends to the current draft; it never sends or replaces it. Attachments stay separate. Limits are explicit refusals, not automatic eviction.
- **More chat tools → Mention files**, or a standalone **@**, opens the desktop file picker. It inserts quoted paths, not file contents or shell commands. Native tools still enforce their own permissions. Browser previews cannot use this picker.
- **More chat tools → Turn journal → Full transcripts** shows new per-turn text received from the native engine, with copy and Markdown download. Records include the dispatched prompt and emitted text/thinking/tool summaries, not image bytes or raw native tool traces. Older summaries cannot be expanded. Interrupted or damaged records are not labelled successful. Recording failures refuse dispatch or request engine stop rather than silently dropping text.
- Under saved chat messages, **Save or copy this chat** exports all stored messages, attachment text, citations and artifact revisions. There is no old 30-message/2,000-character clipping. Attachment binaries are not embedded. Capsule capture refuses above 8 MB; Markdown download remains available.
- **Skills / Plugins / Connectors → engine catalog → Inspect package** reads a commit-pinned public GitHub inventory, README and supported dependency declarations. It never installs or executes package code. Unsupported sources, incomplete trees and linked packages are refused. This is not a security audit, authentication check or native compatibility proof; native installation may resolve another revision.
- **Settings → AI & connections → Engine** has **Restart connection** for idle processes and a reviewable **Setup summary (redacted)**. Restart keeps the native resume ID and reconnects on the next send; it is not a native plugin-reload guarantee. The setup summary omits paths, addresses, account details, model names and task text. It does not certify sign-in or connector health.

Native text records live in private app storage, **outside vault backups**. Export important records separately. The limit is 32 MB per turn with no automatic deletion of older records. These are app-owned per-turn records linked to app chats, not an import of pre-existing native/account history or recovery of text that was previously clipped. The broader authorized backlog remains in progress; account/archive import remains on hold.

## Projects and native conversations

Projects hold shared instructions, goals and explicitly selected references; a working folder is optional. The retired Code screen’s session board, folder controls and permission controls are in Projects. Old saved Code routes open Projects.

- Native resume IDs are scoped by **engine, working folder and app chat**. Follow-ups request that chat’s saved session; side questions create a separate app identity and seed a fresh native context with the selected stored message text. Legacy folder-only IDs are retained, not silently assigned to new chats.
- Shared instructions/goals and per-chat preferences are resolved at dispatch. Reference contents require both an explicit file-picker authorization for that project and its inclusion switch. Working-folder changes require separate owner authorization. Additional-folder references do not grant filesystem access.
- The recorded request carries source fingerprints and coverage. The text limit is 24,000 characters per reference, 64,000 for shared project context and 100,000 for the complete composed request. Oversized, unreadable, linked or partially extracted references refuse the send rather than silently sending a prefix. Native engines can independently read their working folder through their own tools and permissions.
- Completed native text is copied into the saved chat with its original transcript link. Storage failures are reported; the main-process transcript remains the durable original. Image bytes are not embedded in these text records. A receipt describes the current request, not everything retained in native session history.
- Changed standalone HTML/SVG files in the working folder’s `artifacts/` directory can be added to the artifact library after a reported successful native turn, with exact version links. Automatic inspection is bounded to 200 entries, depth three, 2 MB per file and 16 MB total. Original files stay untouched. This is observed file evidence, not proof of engine authorship, tests passing or real-time native artifact parity.

## Reviewed native files and extensions

App instructions now travel with requests instead of rewriting native global rule files on each send. Project/global rule-file changes, checkpoint restores and skill authoring use explicit diff review and one-use approvals. Existing text outside app-managed rule blocks is preserved.

Skills can be inspected and authored from Settings. Both engines receive the native `<skill>/SKILL.md` folder format. Curated catalog installation first pins and retains the complete package, shows its manifest, file inventory and supported dependency declarations, and installs those same bytes only after approval. Existing skill directories are not overwritten. This does not install dependencies or prove portability, loading, authentication or successful use.

Shared MCP edits preview exact configuration changes before saving. Unrelated native fields and servers are preserved; changed files invalidate approval. Read-only inspection exposes user, workspace and supported project-local declarations without returning environment/auth values. Native server startup can execute programs or contact endpoints, so the review explicitly warns about that. OAuth and interactive authentication remain with the native engine. Native stores, schemas and target-machine behavior still need installed-runtime acceptance.

## Reviewed OS command runner

In the desktop app, enable **Settings → Agent access → Allow reviewed OS commands**, then open **Chat → More chat tools → Review an OS command**. Access is off by default. Every invocation requires an explicit, expiring, one-use review of the exact command, shell and selected working folder. Plan mode and active work block execution; changed authority invalidates pending reviews.

This is **app-owned OS execution**, not a native engine tool or an AI verdict. Commands run with the app’s OS-user rights outside the engine sandbox; the working folder does not confine file/network access. No extra elevation or saved app API keys are supplied. Referenced scripts are not audited or pinned by a command-line review, and commands do not get automatic filesystem checkpoints.

Records retain the original request, raw stdout/stderr bytes, exit status, stop/error notices and output hashes in private app storage. A stop is requested after five minutes or 2 MB of combined output. Incomplete records/exports are labelled; interrupted work never restarts automatically. Stop requests do not prove escaped/background descendants exited. Exit zero does not by itself prove the requested task succeeded. Records are outside vault backups; raw downloads are available from the runner/history. Browser previews cannot execute commands.

The runner also has a **Saved commands** library. Saving creates a new retained definition, not a permanent approval. Stored commands keep their original working folder and OS, can be archived/restored without deleting their text, and require a fresh review on every use. Changed or archived definitions invalidate pending approvals. Run records retain the inspected definition’s identity and digest. These saved commands remain independent from workflow or recurring approvals.

## Workflows and app-open schedules

**Chat → More chat tools → Workflows & schedules** saves named sequences of up to eight exact commands for the selected working folder. A single reviewed approval covers that exact sequence once. Steps run serially through the existing command runner, holding one work slot throughout; a nonzero exit, uncertain output, cancellation or authority change stops later steps. Each step links to its actual command/output record. Earlier effects are not rolled back, and exit-zero results do not certify the overall task. Workflow text is retained as distinct definitions; archiving does not delete it.

Recurring execution requires a **separate explicit approval** of the whole sequence, interval and first future slot. Scheduling runs only while the desktop app process is running—not while it is quit, and not as an installed OS service. OS-protected key storage is required; there is no plaintext approval-key fallback. Signed state and durable slot claims precede command execution. Overdue startup slots and slots delayed beyond the one-minute grace period are recorded as missed, not replayed. Failures, uncertain handoffs, changed definitions, changed execution authority or storage trouble pause automatic work for review.

The inbox retains success/failure/interruption/missed receipts and links to full workflow/command records. Changing or re-enabling a schedule requires a fresh recurring review and retains its previous signed approval. Pausing does not roll back completed file changes. The approved folder must remain selected; referenced scripts are not audited or pinned and can change. As with manual commands, these programs run with OS-user rights—not a filesystem sandbox or verified parallel-worktree isolation.

## Browser companion

1. Run the desktop app and select a vault. Open **Settings → AI & connections → Connectors**.
2. Choose **Save extension to Downloads**, or **Choose extension folder…**. The app exports its bundled files into a new folder with `INSTALL.txt`; no download or account is required.
3. In `chrome://extensions` or `edge://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select that folder. Keep it in place.
4. Use **Browser capture permissions** to permit capture, then return to Connectors and copy the pairing token from **Agent access**. Paste it into the extension's **Settings → Connected app**, and **Save & test connection**.
5. Grant access to any desired people/Classroom sites, then open the conversation itself.

Browser approval is still manual; exporting files does not install, pair or grant permissions. Browser-only previews cannot export. To update with waiting captures, leave the extension installed: copy the exported files into its existing loaded folder and click **Reload** in the browser extension manager. Update before rotating pairing. The updated companion holds conversation captures through token changes and resumes only for their verified original vault; **Forget pairing**, explicit discard and privacy revocation still delete waiting data. Loading a new folder can create a different extension and leave the old queue behind. Native folder dialogs and loading this export on the target laptop still need acceptance.

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
