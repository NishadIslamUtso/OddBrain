# OddBrain

A local-first Windows desktop assistant with chat, projects, artifacts, a Markdown vault and a browser companion. It connects to separately installed engines and keeps source conversations distinct from AI interpretations and user-confirmed memory.

**Development status:** active pre-release. Durable app chats and native transcripts, separate raw/confirmed memory, main-owned Working Notes, the 60-day interpretation Review, Attachment Center, streamed selected-file processing, purpose-limited folders, inline branching, quoted-evidence recall, artifacts, projects, browser capture, verified vault/app-data backups, and Windows CI are implemented. Full Node 24 verification and real Windows 11 owner acceptance—especially media/OCR hardware and installed-runtime behavior—are still required. This is not a signed release.

- [Current rules, features, and reasons](RULES_FEATURES_AND_REASONS.md)
- [Future plan and explicit non-goals](FUTURE_PLAN.md)
- [Historical context pointer](CONTEXT.md)

## Repository

| Path | Purpose |
|---|---|
| `apps/03_oddbrain/` | Shipped application: Electron, React and TypeScript. |
| `extension/` | Chromium Manifest V3 companion, version 0.5.1. |
| `vault/Brain/` | Starter vault, templates and engine rulebooks. |
| `apps/03_oddbrain/store/packs/` | Installable skills and prompts. |
| `.github/workflows/` | Linux/Windows checks and Windows installer build. |
| `RULES_FEATURES_AND_REASONS.md` | Current product rules, implemented feature boundaries, and rationale. |
| `FUTURE_PLAN.md` | Approved direction that is not a current capability. |
| `CONTEXT.md` | Pointer to the retired historical diary retained in Git. |

Runtime Markdown, skill files and legal notices remain in their required locations; they are not project handovers.

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

**Vault → Build cited packet** rereads up to four matching saved originals and prepares exact bounded excerpts with `[S1]` identifiers, retained URL/path, character ranges and SHA-256 values. Matching interpretations from confirmed memory are omitted because they are not direct quotations. **Prepare answer from these sources** stages an editable request for a concise answer first and source IDs afterward; the owner still presses Send, and captured text remains quoted evidence rather than instructions. The packet stays under the composer handoff limit and reports omitted or unreadable coverage. This is local lexical retrieval over material already in the vault—not live browsing, semantic search, or independent fact verification. Open the named originals before relying on material outside an excerpt.

A chat can separately approve app-mediated vault search under **Conversation notes and context**. An optional second switch adds bounded, on-device distributional expansion derived only from relationships in that search’s approved corpus; it uses no cloud, downloaded embedding model or hidden permanent index. Receipts distinguish lexical and semantic matches. Large investigations advance as visible stages of at most three owner-reviewed queries and four cited excerpts; preparing the next stage runs nothing until the owner sends it.

In **Memory inbox**, select related suggestions, inspect their wording and quotations, then confirm the group. Nothing is preselected. **People**, **Journal** and **Life Story** offer readable timelines and in-view search; unknown event dates stay unknown. Open **Evidence and revisions → Copy with sources** to copy a record with its quotation, qualification and review status. This does not approve it or send it to a model.

**Brain → Review** runs the real interpretation review. Its default scope is the last 60 days plus only directly linked older evidence; broader history needs an owner-selected range. Questions, possible conflicts, connections, corrections, and keep/forget or cleanup candidates remain review items—none rewrites confirmed memory, archives, or deletes. The optional external-AI handoff shows the exact JSON and SHA-256 first; the owner copies it, opens the consumer app, and presses Send. Imported replies remain provider-labelled and unconfirmed.

**Brain → Files** is the Attachment Center for verified desktop-selected and captured-conversation sources. It shows immutable source identity, storage mode, processor coverage, durable job state, and separate verified turn copies. Large sources offer **Use in place**, **Keep private copy**, or page/time-range processing before work starts. Current media/OCR adapters retry one reviewed source or range as an operation rather than claiming unsupported mid-decoder restart. Purpose-limited folder access is also here: read-only by default, tied to a stated purpose and duration, with separate optional authority switches and revocation; a grant never performs a write, command, watch, memory capture, deletion, or cloud handoff by itself.

### Backup and recovery

In **Vault → Vault-only backup & restore**, choose **Back up vault only** for captured sources, attachment bytes, confirmed memory, and review history. In **Settings → System → App-data backup**, create a separate verified copy of selected private app chats, transcripts, Working Notes, Attachment Center private copies and inventory, processing state, artifacts, projects, and non-secret preferences. App-chat and Working Notes recovery exports remain narrower repair tools.

Vault and app-data backup stream and hash files with bounded memory instead of imposing the former 2 GiB total ceiling. Their manifest/file-count safety bounds remain explicit, and available destination storage can still refuse a copy. Restore creates and verifies a new folder; it never replaces live data automatically. App-data backup excludes credentials, pairing secrets, access grants, engine sessions, installed engines/models, caches, schedule/queue attempts, and external files used in place. Keep both backup domains private and preferably on another drive.

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

- Desktop app chats now live in private main-process storage rather than one renderer `localStorage` value. A small atomic index points to immutable content-addressed snapshots or bounded text-delta chains per chat; a typical streaming checkpoint writes only the changed JSON span, while unchanged chats are neither transferred nor rewritten. Chains compact to a fresh full snapshot after 64 deltas or earlier byte-budget pressure, and both the current and previous complete revisions keep every record they need. Version-one full-snapshot stores remain readable and upgrade only on a real edit. Active changes are checkpointed at most twice per second and slow to once per second or once per two seconds for larger active chats. Explicit pre-send/branch commits show **Saving before send…** and wait for a verified write; a failed commit explicitly says the request was not sent. Storage failures occupy a non-overlapping strip on every screen with **Retry storage**, **Export recovery**, **Import recovery** and **Open storage folder**. Routine checkpoint saves do not show that strip. Import accepts only the bounded app-owned format, previews counts in a native confirmation, skips exact repeats, keeps ID conflicts as separately sourced recovered copies, and never silently replaces an existing chat. If both indexes are unreadable, their exact files are moved into the private recovery folder before an explicitly confirmed import becomes active; old item files remain. Edits made while startup storage or an import dialog is unavailable are retained and durably reapplied. The previous complete index is retained for automatic recovery. The first desktop run copies valid legacy browser storage once and keeps its exact raw strings as recovery evidence; malformed legacy data is reported and left untouched. Current live-storage safety bounds are 20,000 chats, 64 MB per chat and 512 MB total—excess names the affected chat and is refused, never clipped. The browser-only preview continues using browser storage because it has no main process.
- Native **Read** prompts can be allowed once, for one exact file, for that file’s folder during the current turn, for that folder in the current project, or for that folder across chats using the exact same engine and working folder. The permanent all-chat choice requires a second warning that names the folder and working folder. Saved rules live in atomic main-process storage, remain visible and individually revocable under **Settings → Agent access**, and refuse at 1,000 rules instead of evicting older choices. Main validates the live permission ticket and real path; commands, writes, search tools, executable configuration, other engines/workspaces/projects and linked paths outside the workspace never inherit this approval. Legacy renderer rules migrate as exact-file rules with their raw source retained for recovery.
- **More chat tools → Saved drafts** stores text copies on this device. Insert appends to the current draft; it never sends or replaces it. Attachments stay separate. Limits are explicit refusals, not automatic eviction.
- **More chat tools → Mention files**, or a standalone **@**, opens the desktop file picker. It inserts quoted paths, not file contents or shell commands. Native tools still enforce their own permissions. Browser previews cannot use this picker.
- **More chat tools → Turn journal → Full transcripts** shows new per-turn text received from the native engine, with copy and Markdown download. New native image turns retain the exact dispatched bytes as private files and offer downloads only after their MIME, size, and dispatch-time SHA-256 still match; older count-only records say that their image bytes are unavailable. Original files used for new native turns are streamed from main-process-resolved files into verified private turn copies before dispatch, with names, reported MIME, sizes and SHA-256 values. There is no fixed whole-file 50 MB/64 MB local retention cap: bounded 1 MiB copy buffers, actual free storage, eight-source turn metadata, decoder safety, and explicit provider limits are the applicable limits. The renderer’s 8 MB byte-array route is only a compatibility memory transport; desktop picker files use opaque path handles. Files and images cannot be downgraded into the text-only waiting queue. Records include the dispatched prompt and emitted text/thinking/tool summaries, not raw native tool traces. Interrupted or damaged records are not labelled successful. Recording failures refuse dispatch or request engine stop rather than silently dropping text. After an app restart, the 500 newest transcript entries are checked in bounded pages and missing finished/interrupted copies are restored only into their matching existing app chats; nothing is resumed and deleted chats are not recreated. Records over the recovery handoff bound remain available in Full transcripts without clipping.
- Under saved chat messages, **Save or copy this chat** exports all stored messages, attachment text, citations and artifact revisions. There is no old 30-message/2,000-character clipping. Attachment binaries are not embedded. Capsule capture refuses above 8 MB; Markdown download remains available.
- Completed AI replies now show **Branch** inline. It creates an isolated stored chat through that reply, remaps copied message/attachment/artifact references, keeps the project and applicable context choices, and copies the active Working Notes plus its persistent unapproved-proposal difference. The first send starts a separate native session; hidden provider state is never claimed as copied.
- Local audio/video processing uses the selected FFmpeg and full selected duration. Audio is processed in bounded ten-minute intervals, with timestamped offline Windows speech recognition and measured RMS level/dynamics; the measurement does not claim emotion or intent. Video keeps complete audio coverage and evenly spread visual samples with explicit time coverage, not a claim of frame-by-frame interpretation. Unsupported codecs, absent audio, DRM, corruption, missing Windows language support, and decoder failures remain visible.
- PDF extraction reports exact page coverage and supports owner-selected page ranges. Office extraction remains text/value oriented and does not execute macros. Optional DeepSeek-OCR-2 use requires an owner-installed executable implementing OddBrain’s reviewed adapter protocol; Settings pins its executable hash and capability label. OddBrain does not download OCR-2, assume GPU compatibility, or substitute the DeepSeek text API.
- **Skills / Plugins / Connectors → engine catalog → Inspect package** reads a commit-pinned public GitHub inventory, README and supported dependency declarations. It never installs or executes package code. Unsupported sources, incomplete trees and linked packages are refused. This is not a security audit, authentication check or native compatibility proof; native installation may resolve another revision.
- **Settings → AI & connections → Engine** has **Restart connection** for idle processes and a reviewable **Setup summary (redacted)**. Restart keeps the native resume ID and reconnects on the next send; it is not a native plugin-reload guarantee. The setup summary omits paths, addresses, account details, model names and task text. It does not certify sign-in or connector health.

Native text records live in private app storage, **outside vault backups**. Export important records separately. The limit is 32 MB per turn with no automatic deletion of older records. These are app-owned per-turn records linked to app chats, not an import of pre-existing native/account history or recovery of text that was previously clipped. The broader authorized backlog remains in progress; account/archive import remains on hold.

## Projects and native conversations

Projects hold shared instructions, goals and explicitly selected references; a working folder is optional. The retired Code screen’s session board, folder controls and permission controls are in Projects. Old saved Code routes open Projects. While one native task runs, another chat’s text request can be saved into the durable queue from the normal composer instead of locking the whole app. It runs later, not concurrently; image and original-file work remains unqueueable because it cannot be safely reduced to text.

- Native resume IDs are scoped by **engine, working folder and app chat**. Follow-ups request that chat’s saved session; side questions create a separate app identity and seed a fresh native context with the selected stored message text. Legacy folder-only IDs are retained, not silently assigned to new chats.
- Shared instructions/goals and per-chat preferences are resolved at dispatch. Reference contents require both an explicit file-picker authorization for that project and its inclusion switch. Working-folder changes require separate owner authorization. Additional-folder references do not grant filesystem access.
- The recorded request carries source fingerprints and coverage. The text limit is 24,000 characters per reference, 64,000 for shared project context and 100,000 for the complete composed request. Oversized, unreadable, linked or partially extracted references refuse the send rather than silently sending a prefix. Native engines can independently read their working folder through their own tools and permissions.
- Completed or interrupted native text is copied into the saved chat with its original transcript link, including startup reconciliation after a lost renderer view. Storage failures are reported; the main-process transcript remains the durable original. Image and original source-file bytes are not embedded in chat text; new records link to their separate digest-checked downloads. A receipt describes the current request, not everything retained in native session history.
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

**Chat → More chat tools → Workflows & schedules** saves named workflows of up to eight exact commands for the selected working folder. A single reviewed approval covers that exact workflow once. Serial steps hold one work slot throughout and stop before later steps after a nonzero, uncertain, cancelled, or invalidated result. An optional **isolated parallel** style requires two to eight tasks and a clean Git repository root: it pins the reviewed HEAD, creates a separate detached worktree per task, and runs at most two commands concurrently. A failure prevents tasks that have not started; an already-running sibling records its real result. Changed worktrees are retained for inspection, while verified clean/unchanged worktrees are removed; new batches refuse after 20 retained batches need attention. Nothing is merged or pushed automatically.

Each step links to its actual command/output record. The app rechecks the source checkout after an isolated batch and refuses to label the batch successful if a command escaped its worktree and changed the source. This is Git working-tree separation, not an OS, filesystem, process, or network sandbox: commands can still access paths outside their checkout. Repository hooks and system/global Git configuration are disabled for app-owned worktree setup; repositories with configured checkout filters are refused rather than executing those filters. Earlier effects are not rolled back, and exit-zero results do not certify the overall task. Workflow text is retained as distinct definitions; archiving does not delete it.

Recurring execution requires a **separate explicit approval** of the whole sequence, interval and first future slot. Scheduling runs only while the desktop app process is running—not while it is quit, and not as an installed OS service. OS-protected key storage is required; there is no plaintext approval-key fallback. Signed state and durable slot claims precede command execution. Overdue startup slots and slots delayed beyond the one-minute grace period are recorded as missed, not replayed. Failures, uncertain handoffs, changed definitions, changed execution authority or storage trouble pause automatic work for review.

The inbox retains success/failure/interruption/missed receipts and links to full workflow/command records. Changing or re-enabling a schedule requires a fresh recurring review and retains its previous signed approval. Pausing does not roll back completed file changes. The approved folder must remain selected; referenced scripts are not audited or pinned and can change. Scheduled workflows remain serial: isolated parallel work requires a fresh manual review and cannot receive unattended recurring approval. As with manual commands, these programs run with OS-user rights—not a filesystem sandbox.

## Browser companion

1. Run the desktop app and select a vault. Open **Settings → AI & connections → Connectors**.
2. Choose **Save extension to Downloads**, or **Choose extension folder…**. The app exports its bundled files into a new folder with `INSTALL.txt`; no download or account is required.
3. In `chrome://extensions` or `edge://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select that folder. Keep it in place.
4. Use **Browser capture permissions** to permit capture, then return to Connectors and copy the pairing token from **Agent access**. Paste it into the extension's **Settings → Connected app**, and **Save & test connection**.
5. Grant access to any desired people/Classroom sites, then open the conversation itself.

Browser approval is still manual; exporting files does not install, pair or grant permissions. Browser-only previews cannot export. To update with waiting captures, leave the extension installed: copy the exported files into its existing loaded folder and click **Reload** in the browser extension manager. Update before rotating pairing. The updated companion holds conversation captures through token changes and resumes only for their verified original vault; **Forget pairing**, explicit discard and privacy revocation still delete waiting data. Loading a new folder can create a different extension and leave the old queue behind. Native folder dialogs and loading this export on the target laptop still need acceptance.

The companion captures accessible content in supported open conversations, not an entire account archive. It does not collect browser history. Fully queued data can retry after a normal browser restart; incomplete attachment downloads still need the source. After a captured attachment is assembled, durably saved, and SHA-256 verified, exact transfer `.part` files are removed; changed or unverifiable fragments are preserved for review and later cleanup. Its capsule panel and popup can explicitly request the same saved-source cited packet; excluded sites are refused, the desktop app must be open, no packet is cached as a fallback, and insertion/copy remains a separate review action. See [capture coverage and limits](CONTEXT.md#install-and-collection-coverage) before relying on it.

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
