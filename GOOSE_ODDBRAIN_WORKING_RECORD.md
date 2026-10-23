# Goose → OddBrain Working Record

**Started:** 2026-10-22  
**Purpose:** living record of what was obtained, installed, enabled, tested, selected, rejected, deferred, and still unverified while Goose is evaluated as OddBrain's foundation.  
**Rule:** never record credentials, tokens, private content, or an unverified capability as complete.

This is the current concise decision and setup record. `GOOSE_ODDBRAIN_GAP_AND_BUILD_PLAN.md` remains a detailed research snapshot, but this file carries current direction as decisions change.

---

## Current direction

1. Build nothing when an existing free component meets the requirement after source review and Windows acceptance.
2. Prefer installation, configuration, or a thin adapter over recreating a working capability.
3. Port existing OddBrain behavior when no reviewed component meets the requirement.
4. Complete functional engines and workflows first.
5. Design the final UI/UX, final rule system, privacy surfaces, and monitoring surfaces last, using the behavior, limits, versions, permissions, and records proven during functional work.
6. Keep downloadable capabilities modular where practical.
7. Do not use paid apps, paid APIs, paid MCP servers, or subscriptions.
8. Do not download an offline language model during the current Ollama Cloud evaluation.
9. Kdenlive is no longer assumed to be the required final editor. Select the strongest existing AI-controllable editor only after source review and real Windows testing.

---

## Evidence labels

- **Verified:** observed working on the owner's Windows machine.
- **Installed:** installation identity is known, but broader behavior may remain untested.
- **Reviewed:** source or official documentation was inspected; not yet accepted on the owner's machine.
- **Candidate:** promising external component; no adoption decision yet.
- **Unverified:** must not be treated as available or complete.

---

## Goose and provider baseline

| Item | Identity / source | State | Notes |
|---|---|---|---|
| Goose Desktop | Evaluation baseline v1.55.0; obtained through the official installation guidance at <https://goose-docs.ai/docs/getting-started/installation/> | Installed and used | Exact installed executable version should still be read directly from the owner machine before final acceptance. Official v1.55.0 release was dated 2026-10-16. |
| Goose source audit | `aaif-goose/goose`, reviewed checkout commit `5be3f8d3db9a2c4dfd5162bc50c3a35c648b7706` | Reviewed | Read-only audit checkout; not an OddBrain dependency or fork. |
| Provider | Ollama Cloud | Verified | Uses the owner's free allowance. No offline/local model was downloaded. |
| Telemetry setting | `GOOSE_TELEMETRY_ENABLED=false` or legacy `GOOSE_TELEMETRY_OFF=1` | Known configuration | Do not use the incorrect `GOOSE_DISABLE_TELEMETRY=1`. Final privacy configuration is deferred. |

Credentials remain only in the provider's own configuration and must never be copied into this file, prompts, logs, or source control.

---

## Owner-machine tools

| Component | Version / identity | State | Acquisition / receipt |
|---|---|---|---|
| Windows | Windows 11 | Verified platform | Target operating system. |
| Node.js | 24.18.0 | Verified | Existing owner-machine prerequisite. |
| npm / npx | 11.16.0 | Verified | Existing owner-machine prerequisite. |
| Git for Windows | 2.51.0.windows.2 | Verified | Existing owner-machine prerequisite. |
| Goose-bundled `uv` / `uvx` | 0.11.11 | Verified | Used for pinned Python tools. |
| FFmpeg / ffprobe | 7.1.1 essentials build | Installed and version-tested | From GyanD Codex FFmpeg release 7.1.1. Installed under `%LOCALAPPDATA%\OddBrain\Tools\ffmpeg-7.1.1`. Archive retained as `ffmpeg-7.1.1.zip`, size `92,234,348` bytes. Observed SHA-256: `04861D3339C5EBE38B56C19A15CF2C0CC97F5DE4FA8910E4D47E5E6404E4A2D4`. This is an observed receipt, not an independent upstream hash proof. |
| yt-dlp | 2026.10.21 | Installed and version-tested | Official `yt-dlp/yt-dlp` release. SHA-256: `33121d192d706e62f684a06f80918e3f3a8ba52ac3a65213b6951c39c7d9f555`. |
| DDGS | 9.16.0 | Installed and verified | `%LOCALAPPDATA%\OddBrain\Tools\bin\ddgs.exe`; public search worked on Windows. |

No PATH change was required for the installed OddBrain tools.

---

## Goose extensions

All three custom extensions use STDIO, timeout `120`, and no extra environment variables.

| Extension | Pinned identity | Goose command | Default state | Verified result |
|---|---|---|---|---|
| Fetch MCP | 2026.10.19 | `"C:\Users\Nishad Islam Utso\AppData\Local\OddBrain\Tools\bin\mcp-server-fetch.exe"` | Enabled | Retrieved `example.com`. |
| Playwright MCP | 0.0.83 | `"C:\Users\Nishad Islam Utso\AppData\Local\OddBrain\Tools\playwright-mcp\node_modules\.bin\playwright-mcp.cmd" --browser msedge --isolated --no-webmcp` | Disabled until needed | Navigated in Edge, read a page snapshot, and closed the browser. Use Manual Approval and deny `browser_run_code_unsafe` if requested. |
| YouTube Transcript MCP | Git commit `c8b88693633d2f7b161b667ab8de0d4f4b303ca4`; package metadata 0.8.1 | `"C:\Users\Nishad Islam Utso\AppData\Local\OddBrain\Tools\bin\mcp-youtube-transcript.exe" --response-limit 15000` | Disabled until needed | Read YouTube video information and available transcript languages. The executable reports `1.9.9`; use the pinned commit as the installation identity until the mismatch is explained. |
| Goose · Memmory_OB | `@oddbrain/memmory-ob` 1.0.0 stdio bundle `memmory-ob-mcp.cjs`, installed from **Settings → Connectors** with a byte-preserving `config.yaml` review and ownership receipt | Owner-reviewed install into a chosen existing Goose `config.yaml`; one global `extensions.memmory_ob` entry | Read-only tools `memmory_ob_status`, `memmory_ob_search`, `memmory_ob_project`, `memmory_ob_evidence`. No write, confirmation, deletion, permission or Send tool. Concurrent config edits are refused atomically; owned bundle upgrades are shown by old/new SHA-256 and need the same one-allow review. Disposable sandbox smokes passed (MCP protocol, install atomicity, secrets omitted, legacy-receipt upgrade). Real Goose/Windows session acceptance is still required. |

Playwright is browser control, not general Windows control. Transcript text is not complete video understanding.

---

## Goose skills

| Skill | Identity / location | State | Result |
|---|---|---|---|
| OddBrain Windows Web Search | Local skill at `%USERPROFILE%\.agents\skills\oddbrain-windows-web-search\SKILL.md` | Verified | Goose discovered it in a fresh session. It used DDGS and Fetch to confirm the official Goose v1.55.0 release. |
| Goose built-in web-search skill | Bundled with Goose v1.55.0 | Not selected on Windows | Its reviewed commands used Unix utilities such as `head` and `mktemp`; use the verified OddBrain Windows skill instead. |
| memmory-ob-memory | `packages/Memmory_OB/goose-skill/SKILL.md`, installed to `<goose-config-dir>/skills/memmory-ob-memory/SKILL.md` by the reviewed Goose · Memmory_OB connector, in the same one-allow transaction | Installed with the connector | Authority order binding: confirmed owner memory first, raw unconfirmed evidence second, pending/rejected never as facts, current working context last and never authoritative. Requires record ID + exact quote for memory claims, mandates `memmory_ob_evidence` hash verification with refusal on changed sources, and hard-prohibits any write to `state.json`, `02 Sources` or confirmed projections. |

The local search skill does not currently have its own semantic version. Its file content or commit must be pinned before distribution.

---

## Existing Goose capabilities to reuse

Do not rebuild these unless a real acceptance test proves a missing requirement:

- provider/model connection and normal agent loop;
- sessions, session forking, and context compaction;
- MCP extension loading;
- skills and recipes;
- scheduler;
- approval modes and extension permissions;
- `PreToolUse` hooks that can allow or deny tool calls;
- `PreToolUseResult`, post-tool, failure, session, and shell/file lifecycle hooks;
- Stop hooks, with the important limitation that they can force a turn to continue rather than prove cancellation of an already-running external process;
- built-in Memory extension;
- built-in Chat Recall extension;
- `.goosehints`, `AGENTS.md`, and persistent instructions;
- basic attachment and image handling;
- installed Fetch, Playwright, transcript, search, FFmpeg, and yt-dlp tools.

Hooks are not a durable operation ledger. `PreToolUse` failures default to allow unless that selected hook is configured with `on_failure: block`. External process cancellation and restart outcomes still require real testing.

---

## Video-editor decision

### Why Kdenlive was previously selected

Kdenlive is free, open source, Windows-capable, uses editable project files, and has MLT/FFmpeg rendering. OddBrain already contains reviewed Kdenlive planning and safety contracts. Those are advantages, not a requirement to keep Kdenlive if a stronger complete editor already exists.

### Current finding

There is no editor yet proven to work **perfectly** with Goose on the owner's Windows laptop. Goose can use any suitable MCP editor; it does not need a Goose-specific editor. Several newer AI-native or MCP-controlled editors now exist, so building another editor or committing to Kdenlive before testing them would be wasteful.

### Shortlist for source review and Windows proof

| Candidate | Reviewed public identity | Why it is relevant | Current caution |
|---|---|---|---|
| WeftCut | `WeftCut/WeftCut`, v0.5.2, MIT, Windows installer available | Full desktop NLE whose timeline is exposed through MCP; reversible agent batches, checkpoints, review/diff, captions, keyframes, effects, audio, footage analysis, code-authored overlays | New project; claims need real Goose and Windows acceptance, resource-use measurement, and security review. |
| Kinocut | `KyaniteLabs/kinocut`, v1.16.2, Apache-2.0 | Mature headless MCP/CLI workflow with Windows support, FFmpeg editing, receipts, quality gates, compositing, Shorts/Reels repurposing, and many tests | It is primarily a headless workflow engine, not necessarily the best manual creative timeline editor. Optional features add dependencies. |
| DaVinci Resolve MCP | `samuelgursky/davinci-resolve-mcp`, v4.14.4, MIT | Most established MCP integration reviewed so far; broad timeline, grading, audio, Fusion, render, and inspection coverage | DaVinci Resolve itself is proprietary. External scripting is officially Studio-only; the free-edition bridge has version/platform qualifications. Must verify no paid requirement for the intended Windows workflow. |
| Kdenlive plus reviewed MCP | Kdenlive/MLT plus an audited MCP bridge | Open source, editable project, existing OddBrain safety contracts, manual fallback | Stock Kdenlive does not expose complete live control; community bridges vary, and some require patched Kdenlive or manipulate project XML. |

Other young projects exist, but should not be installed merely because their README claims completeness.

### Selection test

Before adopting an editor, prove on Windows 11 through Goose:

1. import local clips, images, audio, captions, and approved creative assets;
2. inspect exact project/timeline state;
3. create both a vertical Reel/Short and a normal YouTube edit;
4. perform cuts, B-roll, titles, captions, transitions, speed, keyframes, audio mix, color/effects, and aspect-ratio reframing;
5. support creative custom overlays or motion graphics rather than only fixed templates;
6. show a preview with audio and let the owner revise it;
7. preserve editable state, Undo/checkpoints, and source media;
8. cancel and recover a render without claiming false success;
9. export and verify the real output;
10. work without paid APIs or subscriptions.

No editor is selected until this test passes. Kdenlive remains one candidate, not a mandatory choice.

---

## Memory: reuse before building

### What already exists

Goose v1.55.0 includes:

- **Memory:** stores categorized text memories as global or project-local files;
- **Chat Recall:** searches earlier Goose conversations and loads session summaries;
- **`.goosehints` / `AGENTS.md`:** deterministic project context loaded into prompts;
- **persistent instructions:** critical text re-read for each interaction.

These should be tried before building a custom memory engine.

### Actual built-in structure

The official pages exist at <https://goose-docs.ai/docs/mcp/memory-mcp> and <https://goose-docs.ai/docs/mcp/chatrecall-mcp>. The reviewed v1.55.0 source provides these details:

- Memory creates one plain-text file per category: `<memory directory>/<category>.txt`.
- A tagged entry is appended as `# tag1 tag2`, then the memory text, then a blank line.
- An untagged entry is the memory text followed by a blank line.
- Category names must be one safe filename component. Paths, `:`, `.`, `..`, and reserved Windows device names are rejected.
- Local memory is fixed to `<session working directory>/.goose/memory/`.
- Global memory uses Goose Memory's platform configuration directory; the official documentation describes it as `~/.config/goose/memory/`. Confirm the resolved Windows path by saving one harmless global test entry rather than assuming the Unix-style documentation path.
- The built-in tool/API does not offer a setting for another directory or storage schema. Moving it cleanly requires a custom memory MCP, a Goose code change, or a filesystem junction/symlink; manual layout changes can break parsing and deletion.
- Chat Recall does not create a second memory folder. It searches Goose's existing `sessions.db` SQLite session store.
- Chat Recall search splits the query into words and performs case-insensitive substring matching, with any keyword able to match. It is keyword recall, not semantic/vector memory.
- Chat Recall excludes the current session, groups matches by earlier session, orders by recent activity, and supports date filters and a result limit up to 50.
- Loading a chosen session returns only its first three and last three visible messages, not its complete conversation.
- Chat Recall has no independent storage-directory setting. Relocating it means relocating Goose's session data or replacing the extension.

### Agreed `Memmory_OB` scope

`Memmory_OB` will be OddBrain's authoritative unified memory layer, not merely a renamed copy of Goose Memory. Its inputs include:

- OddBrain desktop conversations;
- owner-approved mobile-app conversations and captures;
- owner-approved browser-extension conversations, pages, selections, and captures;
- imported conversations from other AI systems or services;
- Journal entries;
- Life Story material;
- People records and relationships;
- project conversations, Working Notes, Branches, revisions, and rejected proposals;
- accessible original attachments and later owner-triggered processing results;
- approved links, documents, images, audio, video, and their evidence.

All conversations can be searched and reasoned over as one OddBrain history, but they must not be flattened into an anonymous transcript. Every item retains its source application/device, account or import identity when available, conversation and message identity, speaker/owner/AI/other role, timestamp, attachment links, processing state, evidence, revisions, confirmation state, and permission/`Never Send` markings.

New material enters as raw/imported data. Sorting and curation may propose Journal, Life Story, People, project, preference, event, relationship, or other memory updates, but uncertain content remains unconfirmed and consequential memory changes require owner review. Original conversations and attachments remain preserved and linked even after summaries or structured memories are produced.

The existing OddBrain memory-related screens and behavior are the migration source. Functional storage, intake, identity, provenance, attachment continuity, sorting, confirmation, retrieval, correction, and deletion behavior comes first; final UI/UX, privacy presentation, final rules, and monitoring presentation remain in the later phase.

### Build boundary: modular extraction plus targeted additions

Do not rebuild OddBrain or create a second frontend. `Memmory_OB` is a separately bounded, downloadable core module/service inside the OddBrain product architecture. The existing desktop UI remains a client of it; narrow adapters expose the same authority to Goose, the browser extension, the future mobile app, imports, and approved external-AI handoffs.

Reuse and adapt the existing raw-source capture, memory proposal/approval/correction history, Review Center, recall/context receipts, graph views, processing ledgers, import/export, Attachment Center, capsule/context behavior, and recoverable Artifact Trash pattern. Keep video, attachment decoding, OCR, and editor control as separate task modules that contribute source-linked results rather than putting all processing inside memory.

Targeted new work is still required for the versioned authoritative object/relationship store, migration from fragmented stores, typed dependency links, unified owner-controlled Trash, cross-device conflict handling, general external-AI work packets, exact per-provider context decisions, and stable APIs. Compatibility adapters remain until migrated behavior and recall parity are proven. This is more than moving files, but far less than rebuilding everything.

### Local/global scope, directories, and AI access

`Memmory_OB` has one logical authority per owner profile. **Global** and **local/project** remain useful scopes, but they become metadata and permission rules on the same stable records—not separate writable memory systems that the owner must copy between. Global records may apply across projects; local records apply only to named projects/workspaces; either may link to evidence in another permitted scope without duplicating or flattening it.

One logical authority does not mean forcing every original byte into one folder. Existing physical source domains remain intentional: vault Markdown and captures, protected app chats and transcripts, managed or use-in-place attachments, and device outboxes retain appropriate storage and permission rules. **App-private describes protected on-disk storage, not exclusion from the owner's memory.** Every app chat and retained transcript becomes a first-class raw `Memmory_OB` source automatically, with message/speaker/project/provider identity, searchable recall, relationships, lifecycle, and complete-memory backup coverage; the owner does not have to capture or copy it manually. `Memmory_OB` maintains the central versioned identities, relationships, scope, authority, lifecycle, and receipts across all domains. Derived search/model indexes and device caches are rebuildable and never become another memory authority. The exact Windows root must be selected from the audited OddBrain app-data/vault contracts during implementation; it must not be invented or require one `.goose/memory` directory per project.

AIs do not receive arbitrary filesystem or directory access. They receive narrow versioned tools that can search permitted records, request bounded source-linked context, inspect an allowed record/relationship, and submit a proposal or task result. Reads are selected per task and recorded; writes become proposals or owner-authorized operations. The module checks scope, sensitivity, `Never Send`, provider, purpose, and current permissions on every call. It never loads the whole memory into every prompt.

For Goose, the intended adapter is one globally registered `Memmory_OB` MCP/extension connection per OddBrain profile/computer, not one installation per model or project. Switching a Goose model/provider keeps the same connector and current project identity. Each task may make bounded tool calls as needed, with receipts and resource limits; registration is once, authorization is checked each time. A different computer/device pairs its own adapter and gets only its allowed scope.

The LEGO boundary is provider-independent:

- the core owns schema, provenance, relationships, lifecycle, context selection, jobs, and receipts;
- Goose MCP, OddBrain desktop, browser extension, future mobile, import/export, and external-AI packet flows are replaceable adapters;
- adapters declare version, capabilities, source identity, permissions, and supported coverage before activation;
- connecting an unknown Goose model or tool does **not** silently grant it all memory. Normal Goose models can use the same approved MCP tools; a component without compatible tools uses a reviewed import or manual packet path instead;
- changing provider, model, or adapter never changes confirmed records or creates another writable authority.

Current truth: the shared `Memmory_OB` core schema, catalogue, read-only Goose MCP adapter, and the `memmory-ob-memory` Goose skill are implemented and smoke-tested. The adapter's four tools are `memmory_ob_status`, `memmory_ob_search`, `memmory_ob_project`, and `memmory_ob_evidence`; every search hit carries an explicit authority label, evidence retrieval verifies exact wording by caller-supplied SHA-256 and refuses changed sources, and sources excluded by the owner's current privacy rules (Privacy & Access + Source Scope) are omitted at read time and refused as evidence — the same read-time law the vault recall path enforces. Goose's stock Memory still uses one global store plus a separate `.goose/memory` under each project working directory, while Chat Recall reads Goose's separate session database. OddBrain currently sends selected context through its own bounded context/receipt paths, and consumer AIs receive only owner-reviewed manual packets. Stock Memory stays temporary and Chat Recall stays a fallback until migration and recall parity are proven.

Memmory_OB trap tests (external judge's checklist) ran against the built adapter bundle over the real MCP stdio protocol and passed 15/15: confirmed fact returns with quote/source/coordinates; pending and rejected proposals never surface and are refused as evidence; changed sources are refused as changed both for a wrong hash and for an edited file; an excluded source never surfaces and its evidence is refused by the privacy law; restarting the adapter re-reads the stores and returns identical evidence. The install transaction smoke passed 15/15, including secrets-omitted config edits, byte preservation outside `extensions.memmory_ob`, concurrent-edit atomic refusal, unowned-file refusal, reviewed owned-bundle upgrade by old/new hash, and legacy-receipt upgrade that adds the skill. These are sandbox proofs; real Goose session and Windows acceptance remain required.

Owner decisions 2026-10-22 (delivery shape): the deliverable is a **Goose addon**, not the OddBrain desktop app. The owner keeps plain Goose and will not install or maintain the Electron app; `packages/Memmory_OB/goose-addon/` is the one-command installer (`install.mjs`) that creates one brain folder, installs the four read-only tools and the `memmory-ob-memory` skill, and switches Goose's stock `memory` extension off in the same reviewed allow (exact diff shown first; type ALLOW; backup, receipt, and unowned-file refusal preserved). After install, Goose must never touch its original memory structure again — only the owner's brain. Chat Recall and past Goose sessions are a one-time migration source only. Doubts, confirmations and interpretations keep their designed separate Review screen — the only place memory is ever confirmed; Goose never confirms its own memory. Remaining addon batches: Goose-history import command, the Review screen host, then real Windows acceptance.

Owner directive 2026-10-22 (trust parity): the Goose addon must work **exactly like the OddBrain memory system — no difference at all, same trust level**. Every safeguard the app enforced is now ported into the adapter and installer, verified by 21 trap checks: evidence rechecks the original observation hash, the recorded quotation, and every chapter basis with loop and stale-basis refusal (an exact port of the organizer's `evidence()`); search filters stale basis and re-verifies original evidence exactly as the vault recall path; raw excerpts with invisible or instruction-like text are omitted with the recall path's wording; Never-Send and local-only catalogue marks are enforced inside every tool call and survive every sync; raw conversation evidence travels only inside an approved Project scope, bounded to four excerpts — the app's own engine-sharing rule; the installer writes nothing before ALLOW, re-verifies the reviewed snapshot at write time, and creates the full Brain layout (Knowledge, Sharing Receipts, Journal, Activity & Undo, People, Review/Memory). The stock-memory off-switch stays inside the same reviewed allow as the owner's end-state directive; on the real machine, run the history import first so nothing is lost when stock memory goes off.

Owner batch 2026-10-22 (post external review, trust parity continued): a fresh install is now born usable — the installer writes an empty valid `store/manifest.json` beside the Brain layout (an existing catalogue is never touched), so status and search work on day one instead of erroring on a missing catalogue. The owner has a supported Never-Send setter at last: `node adapter.mjs … owner never-send <recordId>` / `owner allow-send <recordId>` / `owner list` edits exactly the `neverSend` field OddBrain's sync already preserves, so the choice survives every sync and is enforced immediately by all four tools; the app-side `search` (the projectRecall engine-sharing path) now obeys the same Never-Send/local-only guards, so app and addon share one privacy rule in both directions. Direct evidence requests obey the same Project boundary as search: raw app-chat evidence requires the record's `projectId` (a different Project, a missing scope, or the current chat is refused exactly as search excludes it). Supporting raw observations returned as `originalObservation` now follow the recall hazard law like every other raw excerpt — invisible or instruction-like text is omitted whole with the recall wording instead of being passed through. Release output no longer contains TypeScript source: the downloadable Memmory_OB core package ships compiled `dist/index.mjs` with its manifest, fixing the release-output inspection failure (locally green: `security:release` and `security:policy` both pass on the CI-equivalent build). The installer now performs its TOCTOU re-verification on one open handle before the FIRST filesystem write: a config changed after the preview is refused with the machine completely untouched (no backup, no folders), verified by 39 installer smoke checks including the FIFO-held-prompt race. Trap suite is now 36/36 (new: evidence Project-boundary refusals x3, hazard-omitted original observation, owner Never-Send command round-trip, empty-brain status/search). Privacy-parity mapping, named for review: Never Send/local-only/excluded sources are hard refusals in every tool call (app RULES real guards) with the new owner setter; raw chat evidence = the app's projectRecall path exactly (approved Project scope, ≤4 excerpts, current chat excluded, now also on evidence); sensitive confirmed memory flows through the reviewed read-only connector exactly as the app's own Goose connector serves it under the skill's "confirmed first" order — the app's per-send one-send approval belongs to its Send flow (Consumer-AI upload and Send remain owner actions) and lands with the Review screen host, the only place confirmations happen; the app's per-chat vaultSearch toggle gates its FILE-vault corpus, which the addon never exposes; every Project in the catalogue is owner-created or imported-as-unconfirmed, so a supplied Project ID selects only owner-made scopes. Remaining addon batches unchanged: Review screen host + engine-notes proposal-only writer, Goose-history import (run before the real install), packaging as one downloadable folder with the pre-built adapter, then real Windows acceptance.

Owner batch 2026-10-23 (the screens, on the brain): the owner required the full screen set — Projects screen, Vault screen (memory graph, memory checking, selecting a folder and deciding what to do), Review screen — not just one review surface. Delivered as the **Brain Window** (`packages/Memmory_OB/goose-addon/brain-window.mjs`): one command serves the SAME built renderer the app ships (dist-web, same components, same styles) over loopback, backed by the SAME main-process services (vault service: files/recall/grep/capsules/privacy list/link graph; memory workspace: the Review screen's doubts/confirmations/interpretations with live approve/reject; chat store; Memmory_OB catalogue) rooted at ONE brain folder. The renderer keeps one code path: `bridge.ts` prefers the desktop preload, then the brain host (`platform/brainHost.ts`, a fetch bridge over `/api/window/*`), then the honest demo — the host replaces exactly the domains the named screens need (folder choose-and-decide with real structure-apply writes, Projects read/write/attach persisted to `05 Workspace/projects.json` + catalogue sync, structure inspect/apply/linkCheck, memory read/act/run, chats, memmory_ob views) and every unknown call keeps the demo bridge's truthful "needs the desktop app" wording. First-run flow is real: select a folder (memory folder / data folder), inspect what it is, decide — prepare it as a brain (structure files written, never overwritten) or leave it. Organizer model-drafting (new interpretation proposals) still needs a model connection and is labelled as such; Review decisions on existing proposals are fully live. The host binds 127.0.0.1 only by default (`--bind` exists for preview hosts, with the API guard's existing `ALLOW_PREVIEW_ORIGINS` rule). Built by `npm run build:brain-window`, included in `npm run build`. Verified live: folder-decide writes 9 structure files on a fresh folder; Projects save/read-back/attach round-trip; Review read + honest decision refusal on a missing proposal; link graph reports 7 files/14 links with dead links named; vault status/files/recall return real brain content through the app's own routes.

### Planned `Memmory_OB` structure

Preserve the original OddBrain Brain/Vault intent: one inspectable system controls what every connected AI may recall, while raw sources, AI interpretations, owner-confirmed memory, Working Notes, and permissions never collapse into one authority. The existing owner-readable areas remain recognizable—System, Inbox, Sources, Memory, Working Memory, Knowledge, Review, Sharing Receipts, Journal, Activity/Undo, People, and Archive—but the module adds a versioned object/relationship authority underneath them so Markdown filenames are not the only identity.

The logical layers are:

1. **Sources:** complete app chats/messages, native transcripts, imported AI conversations, browser/mobile captures, files, links, pages, images, audio, video, attachments, and immutable source revisions. Provider, account, device, project, session, message, speaker/role, timestamps, hashes, exact coverage, availability, and permissions remain attached.
2. **Interpretations and memory:** pending, approved, corrected, rejected, disputed, stale, superseded, archived, and trashed claims. Types include facts, preferences, events, decisions, goals, routines, tasks, observations, hypotheses, Journal, Life Story, People, capsules, and Project memory. Exact evidence and revision history are mandatory.
3. **Relationships:** typed source, support, contradiction, correction, supersession, derivation, person/account, Project, conversation, attachment, temporal, and cross-memory connections. Moving an object to Trash preserves these identities and dependency edges.
4. **Scopes and authority:** global, Project, chat/session draft, device/source, sensitivity, `Never Send`, purpose, provider permission, owner/AI/other authorship, and confirmation state. Scope changes relabel/link the same object rather than creating anonymous copies.
5. **Working state:** per-chat Working Notes, Branches, open loops, current snapshots, project session continuity, processing jobs, section coverage, budgets, attempts, and paused/uncertain recovery state.
6. **Lifecycle:** active/relevant, archived/cold, recoverable Trash with no expiry, owner restore/reclassify, and owner-only permanent deletion with dependency preview and tombstone.
7. **Receipts and history:** exact AI context sent/omitted and why, provider/model/version, external handoff packet/result, owner decisions, imports/exports, permission changes, revisions, Trash/restores, and actual job outcomes.
8. **Rebuildable discovery:** lexical indexes, relationship expansion, optional derived relevance/embedding data, use counts, and caches. These improve recall but never replace original sources or confirmed memory.

A durable object minimally carries a stable ID, kind, source identity, scope, authority/confirmation state, lifecycle state, event/observed/imported/corrected times, importance/relevance/use information, sensitivity/permissions, revision, evidence links, relationship IDs, attachment/job links, and content hash. Large bytes stay in their safe managed/source location and are addressed by verified identity rather than copied into every record or prompt.

### What is reused from Goose Memory

Reuse only the useful compatibility ideas and host integration:

- the distinction between owner-wide and project-local relevance, converted into `Memmory_OB` scope metadata;
- Goose's MCP/extension mechanism so any compatible Goose model can call the same narrow memory tools;
- existing global/local Goose Memory text imported once with original scope and a `goose-memory` source label;
- current working directory as an optional, reviewed Project mapping hint, never the Project identity;
- Chat Recall as a temporary read-only/fallback locator until complete-session recall parity is proven.

Do **not** adopt Goose's one `<category>.txt` file per category as the authority, one separate `.goose/memory` tree per working folder, unstructured append-only entries without full provenance/revisions, broad startup injection, direct model deletion, or Chat Recall's bounded keyword excerpts as the final memory model. After migration/parity, stock Goose Memory is no longer a writable authority. Goose supplies the agent loop; `Memmory_OB` controls OddBrain's persistent memory selection, provenance, proposals, permissions, and lifecycle for every connected AI. It cannot claim control over a provider's undisclosed server retention or hidden native session state; those remain separate, labelled, and non-authoritative unless exact records are imported.

### Complete memory backup and recovery

Reuse the existing verified Vault Backup and App-data Backup engines, but coordinate them as one owner-facing **Complete Memory Backup** rather than leaving the owner to remember which half contains a chat or dependency. A complete backup set must be revision-consistent and include:

- the `Memmory_OB` schema, objects/events, relationships, scopes, revisions, Trash, tombstones, jobs, and receipts;
- the owner-readable Brain/Vault sources and confirmed projections;
- app chats, native transcripts, imported conversations, Projects, Working Notes, Branches/review differences, and external-AI handoffs/results;
- managed/private attachment copies, captured-conversation attachments, processing state, and other memory-owned derivatives required to preserve dependencies;
- a manifest naming every included file/object, byte count, SHA-256, schema/module version, source domain, backup revision, omissions, unavailable use-in-place sources, and excluded secrets.

Credentials, provider keys, pairing/capability secrets, live access grants, installed models/engines, executable extension packages, caches/rebuildable indexes, and uncertain/recovered execution authority remain excluded. Use-in-place external files are recorded by identity/path/hash/availability but are not silently copied; an optional portable-copy choice requires owner review and available storage.

Creation streams and verifies complete bytes, refuses silent omission, and reports a backup only after all included domains match one coordinated snapshot/revision barrier. Restore verifies first and writes to a new folder/profile; it never overwrites or activates live memory automatically. Activation has a separate dependency, schema, permission, and conflict preview. Project-only export may be added, but it cannot be called a complete owner-memory backup.

Current truth: the separate SHA-256-verified Vault and App-data backup/restore flows remain independently usable, and the coordinated **Complete Memory Backup** is now implemented on top of them: it binds one `Memmory_OB` revision, hashes both nested domain manifests under one top-level manifest, records explicit exclusions and use-in-place external files, verifies every listed payload before writing into a new inactive profile, and emits `ACTIVATION-REVIEW.json` with package/revision identity. Disposable-data create/verify/restore smoke validation passed in the development sandbox. Windows 11 acceptance and the separate owner-reviewed activation tooling remain outstanding; restore never activates credentials, grants, sessions, hooks, schedules, or queues implicitly.

### Projects are first-class scope, not directories

Goose's stock documentation does not provide the first-class OddBrain Project model. OddBrain already does: a Project has a stable ID, name, owner instructions, goals, explicitly selected references, related app chats, and an optional working folder. A Project can exist without Git or any folder. Current native request receipts already record the project ID, project-context revision, workspace, included sources, and omissions.

`Memmory_OB` must preserve and broaden that existing Project identity. A Project is a durable entity and permission/context boundary that may connect to chats, imported conversations, Working Notes, Branches and revisions, raw sources, confirmed and pending interpretations, People, Journal/Life Story events, attachments, artifacts, jobs, provider receipts, and other projects. The same source or global memory may link to several projects without being copied; an app chat keeps one primary project home while additional typed project relationships may be recorded separately.

The full existing Projects capability belongs with the downloadable `Memmory_OB` LEGO module, not just a hidden backend. Preserve create/rename, owner instructions, goals, optional working folder, project chat list/new-chat entry, selected reference files and inclusion controls, outputs/artifacts, **What a chat can see**, native session/working-folder visibility, and reviewed project rule/permission controls. Add the functional project-memory views and actions—shared confirmed memory, pending interpretations, Questions/Conflicts/Connections, exact sources and revisions, related attachments/jobs, project activity/context receipts, and recoverable Trash—before final visual redesign. Activating the module registers this screen and its APIs inside the existing OddBrain shell; it does not create a second frontend.

Sessions under the same Project share memory through the Project scope:

- a new or existing app chat/native session receives relevant confirmed Project memory plus permitted relevant global memory at task time;
- an interpretation or connection found in one session keeps that exact source-session/message identity and enters pending/review state; once approved for the Project, it becomes available to other Project sessions;
- project-memory revisions invalidate stale prepared context and every send records exactly which revision and records were included;
- cross-session search can find exact raw evidence, but complete transcripts are not silently poured into every session;
- per-chat Working Notes, drafts, rejected proposals, hidden native-provider history, and unrelated raw messages do not become shared facts automatically;
- native resume IDs and provider sessions remain separate by engine, workspace, and app chat. Shared memory does not merge model context windows or impersonate one session as another;
- references and attachments remain separately permissioned; being in the same Project does not automatically upload or expose their bytes;
- conflicting session claims remain linked side by side and generate review instead of silently overwriting Project memory.

This creates the useful hierarchy **global → project → chat/session draft**, while preserving raw source identity at every level. Promotion between levels is a source-linked classification/review operation, not copying anonymous text.

A working directory is only one reviewed resource of a Project, never its identity. Moving or removing a folder does not create a new Project or silently erase its memory. Folder permissions, file references, and use-in-place attachments retain their own grants and availability state.

For AI access:

- the owner/app selects an opaque Project ID, or a reviewed exact working-folder mapping resolves to one;
- if no unique Project is selected, the connector uses only permitted global/unscoped context or asks for selection—it never guesses from a similar name or path;
- the one Goose connector supplies only the relevant project instructions, goals, confirmed project memory, selected raw evidence, and relevant global memory for the current task;
- every dispatch records the Project ID and context revision, so a changed Project invalidates a stale prepared send;
- model results return as source-linked Project proposals/results and cannot silently become instructions or confirmed memory;
- external-AI packets carry the same Project identity and bounded coverage without granting direct folder access.

Projects follow the unified lifecycle too. AI may classify or suggest project links and may move an eligible Project to recoverable Trash under the agreed policy, but only the owner may permanently delete it after seeing dependent chats, sources, attachments, jobs, memories, and cross-project links. Restoration reconnects the same Project ID.

Current implementation: Projects remain stored in app-private `projects.json` with stable IDs; chats carry `projectId`; shared instructions/goals/references and optional workspace resolve into bounded native context, and the screen shows related chats, outputs, session/working-folder state, project context, and reviewed native rule controls. `Memmory_OB` now provides the authoritative shared Project-memory scope those sessions draw on: Project chat/Working Notes exact search with source counts, bounded same-Project native recall, typed Project relationships, and recoverable Project Trash with catalogue lifecycle propagation. Goose's read-only `memmory_ob` adapter receives this Project identity for scoped search and counts while keeping transcripts, Working Notes, provider/resume histories and attachment permissions separate. The remaining Project work is the fully dependency-aware Trash screen, richer shared-memory views (Questions/Conflicts/Connections, activity receipts), and cross-device conflict handling. `Memmory_OB` must integrate rather than replace this existing feature.

### Existing OddBrain contracts that `Memmory_OB` must preserve

The current code already contains these connected boundaries; they must be ported rather than replaced with a smaller generic memory store:

- **Connection laws:** only source-linked records may connect; owner/AI/other speakers remain separate; names alone never merge people; account/profile merges are explicit and undoable; unresolved or ambiguous graph links are shown as such rather than fabricated; reciprocal duplicate graph edges share one connection; self-links are not drawn.
- **Doubt and confusion:** uncertainty remains labelled and becomes a Question. OddBrain asks or lets the owner dismiss it; uncertainty never silently becomes a fact.
- **Confirmation:** model output begins as a pending proposal with exact quote, source range/hash, provider, conversation, message, speaker, observed time, model, destination, and uncertainty. Approval uses an exact diff. Owner corrections change authorship to the owner while retaining revision history.
- **Conflict and correction:** conflicting confirmed interpretations remain side by side; OddBrain does not choose a winner. Changed or withdrawn supporting records make dependent interpretations stale and raise a correction review item. Contradictions preserve both sides.
- **Keep, forget, cleanup, archive, and deletion:** these are separate. Keep/forget and duplicate cleanup are candidates only. Original sources are not automatically deleted, and private-copy deletion requires a separate impact preview and confirmation. No silent clipping, eviction, or destructive curation.
- **Sorting destinations:** Memory Inbox, People, Journal, Life Story, source-linked capsules/entities, Working Notes, Branches, and review queues retain separate meanings and authority.
- **Review windows:** Capture Sources currently opens on the last **30 days**. Interpretation Review defaults to the last **60 days plus only directly linked older evidence**; the owner may choose another range or all history. Current code raises a keep-or-forget candidate for an unconfirmed interpretation after **180 days**. These three values are different and must not be conflated or silently changed.
- **Review kinds:** Question, Conflict, Connection, Needs correction, Keep or forget, Cleanup candidate, and imported External suggestion. Review runs produce retained reports and never rewrite confirmed memory by themselves.
- **Graph views:** preserve both the source/capture map and the 2D/3D vault connection graph, including actual-note previews, filters, unresolved/ambiguous-link counts, and no invented nodes or claims.
- **Job state:** preserve durable source hashes, section/operation coverage, budgets, attempts, actual outcomes, and restart state. Memory organizer jobs retain queued/done/blocked; attachment/media processing retains unfinished/paused/blocked/uncertain work; the text work queue retains queued/held/starting/accepted/canceled/blocked/uncertain. Recovered or uncertain work never replays automatically.
- **Import/export:** preserve original conversation and attachment imports, account/source attribution, provider-labelled unconfirmed external-review imports, exact bounded export packets with SHA-256, backup/restore boundaries, and receipts. Import never grants confirmation, permission, archive, deletion, or instruction authority.
- **Data sent to each AI:** select context per task, model capacity, owner permission, provider, sensitivity, and purpose. App instructions and the owner request remain authoritative; Working Notes are labelled drafts; relevant valid owner-confirmed memory is separate from exact raw supporting evidence; other raw conversations/files remain quoted non-authoritative evidence; pending/rejected/stale records are not automatic facts. Record exactly what was included, omitted, and why. External processing remains off unless explicitly allowed, and consumer-AI upload plus Send remain owner actions.

Relevant implementation sources include `shared/lib/memoryWorkspace.ts`, `shared/lib/reviewCenter.ts`, `main/memory/`, `main/vault/recall.ts`, `MemoryWorkspace.tsx`, `ReviewCenter.tsx`, `ConnectionGraph.tsx`, `MemoryMap.tsx`, `AttachmentCenter.tsx`, `WorkQueue.tsx`, and `ChatContextPanel.tsx`.

### Goose Memory/Chat Recall compatibility and owner-controlled trash

The owner will not manually copy memories between Goose Memory, Chat Recall, and OddBrain or manually classify every retained item.

- `Memmory_OB` becomes the authoritative memory and recall service exposed to Goose through clearly described MCP tools and a small usage skill/instruction.
- Existing Goose global and project-local Memory files are imported with their original scope and labelled `goose-memory`; they are not silently promoted to owner-confirmed OddBrain memory.
- Goose conversations available through supported session/export interfaces are imported as raw, provider-labelled conversation sources with session, role, time, workspace, attachment, and coverage identity. Direct editing of Goose's private session database is not the preferred integration.
- During migration, stock Chat Recall may remain a fallback for Goose-only sessions. Once `Memmory_OB` proves complete recall, the stock Memory extension should be disabled to avoid two writable authorities; Chat Recall may remain read-only fallback or be disabled after parity. No duplicate is silently treated as a new fact.
- Global scope covers stable owner-wide memory such as preferences, People, general Life Story, and cross-project relationships. Local scope covers one project/workspace. A global interpretation may link to local raw evidence without copying or losing that evidence's scope.
- Intake, sorting, relevance scoring, use tracking, connection finding, review generation, context selection, and routine categorization run automatically. The owner is interrupted only for unresolved identity, meaningful contradiction, sensitive/high-impact promotion, permission expansion, or destructive uncertainty.

There is **no automatic permanent deletion**. For app chats, imported AI conversations, mobile/browser captures, raw evidence, attachments, pending/rejected/confirmed interpretations, Journal, Life Story, People, capsules, projects, and generated derivatives:

1. **Active/relevant:** eligible for normal task-specific recall.
2. **Archived/cold:** retained but normally excluded from AI context.
3. **Trash:** the AI may move an item here based on age, relevance, use frequency, duplication, rejection, or supersession. Trash preserves the full item, stable identity, source, attachments, relationships, and dependency metadata. It is visible, searchable in Trash, excluded from normal recall, and has no automatic expiry.
4. **Restored/reclassified:** the owner may return a trashed item to its original or another category and mark it relevant/pinned.
5. **Permanently deleted:** only the owner may do this from the app's Trash screen after an exact dependency/impact preview. AI cannot empty Trash or purge bytes.

Moving an item to Trash must not edit its source file in place or break links. Active graphs and memories retain a typed reference to the trashed identity and can report what became unavailable; restoration reconnects the same identity. If the owner permanently deletes an item, the app records the deletion and a tombstone so sync/import does not silently recreate it. Shared attachments or derived memories are separate objects and are not cascaded unless the owner explicitly selects them after seeing the impact.

Actual provider-side deletion is separate: deleting OddBrain's imported copy does not claim to delete the original ChatGPT/Claude/other-provider conversation without a supported connector and separate owner authority.

Current code state, after the connected Trash work:

- the chat Sidebar **Delete** and Project removal now move entries into recoverable Trash with restore, and the Brain engine-notes screen moves an exact Markdown file into recoverable Trash with hash-verified collision-safe restoration;
- `Memmory_OB` catalogue objects follow their owning chat/Project/Working Notes lifecycle into recoverable Trash and are excluded from recall;
- Artifacts have a real recoverable Trash and restore screen;
- Attachment Center keeps dependency-previewed, owner-confirmed deletion for private copies only, and never deletes use-in-place owner files;
- Review Center can mark a record as a forget candidate but does not delete it;
- one fully unified dependency-aware Trash spanning raw sources, interpretations, attachments and Jobs in a single review surface remains incomplete.

### Additional `Memmory_OB` foundation requirements

The user-facing scope is broad, but these technical foundations must also be complete before `Memmory_OB` can be called authoritative:

- **Versioned durable schema:** stable object and relationship identities, explicit schema versions, safe migrations, and reversible/receipted changes. Search, embedding, and model-generated indexes are rebuildable derivatives, never the only copy of memory.
- **Multi-device continuity:** desktop, mobile, and browser-extension changes retain device/source identity; offline queues resume safely; simultaneous edits become visible conflicts rather than last-writer-wins loss.
- **Recovery and integrity:** detect partial/corrupt records, missing attachments, and orphaned relationships; support bounded integrity checks, backup/restore, interrupted-job recovery, and link repair without inventing replacement data.
- **Untrusted-content boundary:** imported chats, pages, documents, attachment text, and recalled model output are evidence, not executable instructions. Recall must not turn prompt injection or an old AI statement into current authority.
- **Time identity:** preserve source time, observed/imported time, and later correction time with source timezone/unknown-time state rather than overwriting them with one timestamp.
- **Source withdrawal:** removing an account, folder permission, device source, or imported collection must show every dependent interpretation and attachment effect. It does not silently cascade or leave derived claims looking supported.
- **Rebuild and provider change:** changing the model/provider, relevance method, tokenizer, or embedding method must not rewrite raw evidence or confirmed memory. Derived scores and indexes record their version and can be rebuilt resumably.
- **Measurable recall parity:** migrate away from Chat Recall only after exact-source retrieval, full-conversation coverage, attachment continuity, permissions, latency, and failure recovery are proven. No silent clipping, eviction, or hidden fallback.
- **Core security now, presentation later:** storage permissions, secret exclusion, sensitivity/`Never Send` enforcement, and owner-only destructive authority are functional requirements. Final privacy screens and wording remain in the later UI phase.

### AI-independent semantic work and external-AI fallback

OddBrain must not require its own installed or available AI to keep organizing, checking, and repairing the owner's information. Deterministic capture, hashing, indexing, graph checks, extraction, job state, review queues, packet preparation, result validation, and owner actions continue without a model. Semantic work may be given to another owner-chosen AI through a general manual handoff/import path.

This is broader than the existing Interpretation Review handoff. It covers at least:

- checking interpretations, contradictions, stale evidence, and proposed memory connections;
- suggesting missing or corrected links without directly changing confirmed memory;
- watching/describing video with exact audio, clip, frame, transcript, and time-range coverage;
- describing images, documents, audio, and other attachments with exact file hash and page/time/range coverage;
- summarization, classification, comparison, question answering, creative review, planning, and other semantic tasks that deterministic local processing cannot complete.

The reusable handoff contract is:

1. OddBrain performs safe deterministic preparation locally and creates a task-specific, bounded packet.
2. The exact outgoing packet shows purpose, source identities and hashes, roles/speakers, page/time/range coverage, permissions/sensitivity, omissions, questions, and the required structured answer format.
3. The owner chooses the external AI, reviews what will leave the device, performs any upload/paste, and presses **Send**. OddBrain never pretends a consumer-AI send happened and does not require a paid API.
4. The returned answer is imported against the exact packet SHA-256 with provider/model label when known, import time, claimed coverage, citations, and uncertainty.
5. OddBrain rejects unknown source IDs, invented frame/page/range references, malformed results, or a claim of complete coverage that the outgoing packet did not provide. Partial work remains visibly partial and resumable.
6. Imported output is a provider-labelled, unconfirmed interpretation or task result. It cannot grant permission, become an instruction, confirm memory, rewrite a connection, archive, move to Trash, delete, execute commands, or claim editing/render success by itself.
7. The owner may compare multiple AI answers, approve/correct selected proposals, or reject them. Exact responses and decisions retain provenance so a later model can re-check them.

For video, an external AI must not be described as having watched the whole video unless the owner actually supplied the complete media and the imported result identifies that coverage. Transcript-only, sampled-frame, selected-clip, and audio-only reviews remain separate. For attachments, descriptions stay linked to the exact original or reviewed derivative and never replace it.

Current implementation is partial: Interpretation Review already exports a hashed packet and imports provider-labelled unconfirmed replies. That implementation is specific to open memory-review items. A general typed handoff/import system for video watching, attachment description, and other semantic jobs is not yet implemented.

### Browser-extension scan-to-context and capsule suggestions

On an owner-approved site, OddBrain should keep using permitted scanned page/conversation content to suggest relevant context, existing capsules, entities, memories, source packets, or a proposed new/updated capsule. Prompt-injection risk must not remove this useful behavior; it requires strict data and authority boundaries.

The extension may use scanned material in two roles only:

1. as an untrusted retrieval query for local matching and relationship discovery; and
2. as source-labelled quoted evidence inside an owner-reviewed prompt or external-AI packet.

It is never app/system/owner instruction. A scanned page cannot grant permission, ask OddBrain to reveal unrelated private context, expand retrieval scope, create or confirm memory, modify a capsule, run a tool/command, upload a file, insert text, or press **Send**. Suggestions remain suggestions. Creating or changing a capsule/memory follows its normal review and provenance rules.

Required guards include:

- scan only the current permitted surface and retain URL/source, capture time, account/conversation identity when available, visible coverage, and hashes;
- exclude scripts, styles, templates, frames, forms, passwords, unsent drafts, editable/private fields, `hidden`/`aria-hidden` content, and content made visually invisible by CSS from automatic page evidence;
- inspect exact retained text for zero-width, bidirectional, invisible, confusable-looking, encoded, and instruction-like content; preserve the original but attach visible warnings and risk labels;
- form retrieval queries from bounded topics/entities rather than obeying imperative sentences found on the page;
- place any model-facing source inside a structured `untrusted-reference`/quoted-evidence envelope separated from OddBrain rules and the owner's request;
- allow automatic inline suggestions only from records explicitly safe for suggestion and allowed for that site, purpose, sensitivity, and owner/account context;
- keep scanning, capture/save, retrieval, AI sharing, draft insertion, and **Send** as separate authorities and receipts;
- show why each suggestion matched and the exact text before insertion or provider sharing; page JavaScript receives no private result, and insertion never sends;
- detect and refuse attempts to retrieve secrets, unrelated private memories, credentials, `Never Send` content, broad history, commands, or permissions even when the page phrases them as a task;
- treat scanners as warning aids, not the main security boundary. App-enforced source roles, scope, permissions, output schemas, and no-tool/no-send behavior remain authoritative.

Suspicious text is not silently deleted and does not automatically discard the whole useful page. Safe visible portions and bounded derived topic terms may still support suggestions; risky excerpts remain quarantined/labelled and require explicit review before any model receives them.

Current implementation is partial: the extension already excludes many hidden/private DOM areas, supports explicit capsule/context lookup, limits automatic typing matches to `suggestion_safe` capsules, previews insertion, and never presses Send. Captured browser sources also receive invisible-text and instruction-signal records in the desktop app. The complete guarded scan-to-suggestion path, including consistent malicious-content handling and privacy-safe explanations across every context/capsule mode, is not yet verified or complete.

### Implemented `Memmory_OB` authority (2026-10-22)

- **Global/Project confirmed memory:** remains distinct from raw sources and requires its existing review/confirmation law.
- **Project chat evidence:** retained app chats are catalogued as first-class raw sources under stable Project IDs. Native context can use up to four exact bounded excerpts from other active chats in that Project; the current chat and Trash are excluded.
- **Chat Recall:** remains an unconfirmed migration/search fallback, not a second memory authority.
- **Stock Goose Memory:** remains an evaluated adapter/fallback until `Memmory_OB` reaches measured parity. It must not become a conflicting writer, and it is not yet disabled.
- **Project Markdown/files:** remain detailed durable knowledge, plans, sources, and evidence. Catalogue records point to sources rather than duplicating every raw byte.

The connected version-1 core now has a strict shared schema, durable main-process catalogue, and startup/write synchronization for chats/Projects/Working Notes/Attachment Center/processing jobs/reviewed memory. Catalogue intake covers chat-linked and archive-only transcript headers, imported turns, Branch links, resumable Jobs, model and native context receipts, raw browser/import review sources, People, and pending/rejected/confirmed interpretations with preserved correction revisions. It provides typed Project/transcript/Working Notes/attachment/Branch/receipt links, narrow desktop bridge, Project search/count surface, same-Project raw chat recall, recoverable chat/Project/engine-note Trash, and Complete Memory Backup coverage. Exact raw bytes remain in their authoritative stores while catalogue records retain source/project/lifecycle/coverage/hash identity. The dependency-free `@oddbrain/memmory-ob@1.0.0` source package lives in `packages/Memmory_OB`, and every build emits a hash-bound core package plus a standalone read-only stdio MCP adapter. **Settings → Connectors → Goose · Memmory_OB** installs one owner-reviewed extension into a chosen existing Goose `config.yaml` after an exact byte-preserving diff; its four tools expose status, bounded exact confirmed-memory/raw-chat search, Project counts, and SHA-256 evidence verification that refuses changed sources, with no writer, confirmation, deletion, permission or Send tool.

Still incomplete: mobile intake, richer relationship/conflict workflows across every source, graphs, the remaining context receipts, standalone package publication review, measured Goose parity, and Windows 11 / Node 24 acceptance. Do not disable stock Goose Memory or retire Chat Recall until parity is measured.

### Goose v1.55.0 caution retained

Official documentation says saved memories are loaded at session start. Reviewed source clearly injects global memories when the Memory server starts, while automatic startup injection of project-local memories was not evident in that path. This is an adapter/parity concern, not authority for creating another memory system.

---

## Functional order

1. Complete the remaining `Memmory_OB` intake adapters (mobile, Goose-store, remaining imports) and richer conflict/graph views; the core intake, typed links, Jobs/receipts and read-only Goose MCP access are now connected and must stay one authority.
2. Complete measured migration/parity before disabling a stock Goose writer or relying on Chat Recall only as fallback.
3. Audit and test existing AI-controllable video editors and reuse reviewed document/OCR/transcription/media components instead of duplicating them.
4. Verify coordinated backup/restore and all connected behavior on Windows 11, then rebuild trusted acceptance tests.
5. Only after functional behavior and exact versions are stable, finish UI/UX, owner rules, privacy presentation, monitoring and packaging.

---

## Deferred final phase

The following are deliberately last:

- complete OddBrain UI/UX;
- final owner/AI rules and policy wording;
- final privacy settings and reports;
- monitoring dashboards and activity surfaces;
- packaging presentation and add-on browsing experience.

They will be designed from actual selected components, tool permissions, data paths, network behavior, versions, failure modes, and owner workflows—not from speculative scaffolding.

---

## Pending owner-machine checks

- Read the exact installed Goose executable version directly.
- Enable and test built-in Memory and Chat Recall.
- Audit the editor shortlist before downloading anything.
- Select one editor candidate for a controlled Windows trial.
- Record every later component's source URL, exact version/commit, licence, install location, enabled state, permissions, network behavior, test result, update method, and removal/rollback method here.
