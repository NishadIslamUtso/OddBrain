# Goose → OddBrain Non-UI Gap and Build Plan

> **Research snapshot:** Current setup, scope, reuse, editor, memory, and deferral decisions are maintained in `GOOSE_ODDBRAIN_WORKING_RECORD.md`. Where this older detailed plan conflicts with that living record, the living record controls.

**Date:** 2026-10-22  
**Status:** planning and evaluation only; no Goose architecture change is authorized by this document  
**Platform:** Windows 11  
**Current direction:** evaluate official Goose as the agent foundation while deferring the complete OddBrain UI/UX decision

## Executive summary

Goose already supplies the general agent engine, provider/model selection, tool loop, sessions, MCP support, skills, hooks, recipes, basic permissions, and extension loading. The owner-machine evaluation also has working public search, page fetching, browser automation, YouTube transcript access, FFmpeg, and yt-dlp.

The remaining work is not another general chat application. It is mainly four product systems:

1. **Safety and recovery** around Goose's agent loop and consequential tools.
2. **Evidence, attachments, provenance, and trusted owner memory.**
3. **Complete document, OCR, audio, and video understanding.**
4. **Owner-reviewed Kdenlive editing and Creative Library workflows.**

Working Notes, Branch, projects, folder permissions, backups, privacy records, and manual consumer-AI handoff support those four systems.

Much of this behavior already exists in the current OddBrain implementation and should be ported or adapted rather than redesigned as reduced generic scaffolding.

---

## Scope decisions

### In scope now

- Identify the significant functional gaps between Goose and OddBrain.
- Define the non-UI services, contracts, safety rules, evidence boundaries, and acceptance requirements.
- Reuse official Goose and reviewed free/open-source components where they genuinely satisfy a requirement.
- Preserve Windows 11 support, Node.js 24, Kdenlive as the sole editor, and separately installed engines/tools.
- Keep features independently installable where practical.

### Explicitly deferred

The complete OddBrain layout, appearance, navigation, and general Goose UI add-on framework are set aside for now.

This means:

- no deep Goose Desktop fork is authorized;
- no claim is made that a normal Goose extension can reproduce the complete OddBrain shell today;
- backend work should use UI-independent contracts so a later approved interface can consume it;
- exact OddBrain UI plus effortless official Goose updates remains dependent on a future upstream-supported UI contribution system or a separately approved custom distribution.

### Rejected architecture

A separate OddBrain frontend connected to Goose CLI/server is not the desired route. It would create two maintained products plus a bridge.

---

## Current owner-machine evaluation baseline

The following records the owner-machine evaluation baseline as audited; it is not a released OddBrain package.

### Model and Goose

- Official Goose Desktop is installed.
- Goose's local-inference screen is available, but offline models are deliberately not being used now.
- Ollama Cloud is used with the owner's free allowance.
- Credentials remain in Goose's provider configuration and must never be copied into prompts or documentation.
- Manual Approval is the required operating mode.

### Working reusable components

| Component | Reviewed/evaluated version | Current result |
|---|---:|---|
| Goose Desktop | v1.55.0 evaluation baseline | Agent, sessions, providers, tools, skills, extensions |
| Node.js | v24.18.0 on owner machine | Available |
| Git for Windows | 2.51.0.windows.2 | Available |
| Goose-bundled `uv`/`uvx` | 0.11.11 | Available |
| Fetch MCP | 2026.10.19 | Successfully fetched `example.com` |
| Playwright MCP | 0.0.83 | Successfully navigated, read a snapshot, and closed Edge |
| YouTube Transcript MCP | source tag/package 0.8.1 at commit `c8b88693633d2f7b161b667ab8de0d4f4b303ca4` | Successfully read video information and transcript languages |
| DDGS | 9.16.0 | Windows-compatible public search succeeded |
| OddBrain Windows web-search skill | local skill | Discovered and used successfully with DDGS + Fetch |
| FFmpeg / ffprobe | 7.1.1 | Installed and reported the expected version |
| yt-dlp | 2026.10.21 | Installed and hash matched |

### Owner-machine tool receipts

- FFmpeg archive location: `%LOCALAPPDATA%\OddBrain\Tools\ffmpeg-7.1.1.zip`
- FFmpeg archive size: `92,234,348` bytes
- Observed FFmpeg archive SHA-256: `04861D3339C5EBE38B56C19A15CF2C0CC97F5DE4FA8910E4D47E5E6404E4A2D4`
- No authoritative expected FFmpeg archive hash was supplied by that release, so the observed hash is a receipt, not independent provenance proof.
- yt-dlp SHA-256: `33121d192d706e62f684a06f80918e3f3a8ba52ac3a65213b6951c39c7d9f555`
- Playwright is installed locally under `%LOCALAPPDATA%\OddBrain\Tools\playwright-mcp`.
- UV-managed tools are under `%LOCALAPPDATA%\OddBrain\Tools\uv-tools`, with executables under `%LOCALAPPDATA%\OddBrain\Tools\bin`.
- The YouTube Transcript executable's `--version` displayed `1.9.9`, while UV metadata and the pinned source report package version `0.8.1`. The pinned source commit is the authoritative installation identity until that CLI version-reporting inconsistency is explained.

### Current operating boundaries

- Keep Fetch enabled for ordinary approved public pages.
- Keep Playwright disabled except for an explicit interactive-browser task.
- Keep YouTube Transcript disabled except for an approved YouTube task.
- Playwright uses an isolated Edge profile and WebMCP is disabled.
- The current Goose interface did not expose a verified persistent per-tool deny for `browser_run_code_unsafe`. Manual Approval must therefore be used and any such request denied. Do not search files for this dynamically supplied tool name.
- External tools reach the network when called. Their presence does not itself authorize a destination.
- These installations are pinned at the top-level source/package version, but a final OddBrain distribution still needs reviewed transitive dependency locks, licences, hashes, and rollback packaging.

---

# Major functional gaps

| # | Major feature | Goose or installed tools provide | OddBrain still requires |
|---:|---|---|---|
| 1 | Trusted memory and provenance | Basic Memory, Chat Recall, sessions | Raw/unconfirmed/confirmed separation, evidence links, contradiction handling, speaker boundaries, owner review |
| 2 | Durable attachment processing | Chat attachments and basic document reading | Attachment Center, source hashes, exact coverage, delayed/repeated processing, resumable jobs |
| 3 | Complete audio/video understanding | Images, transcripts, generic tools | Full-duration audio, delivery/tone evidence, adaptive frames, scenes, selective evidence and recovery |
| 4 | Reviewed DeepSeek-OCR-2 integration | No equivalent complete workflow | Local adapter, executable verification, page/frame selection, coverage and provenance |
| 5 | Kdenlive Video Studio | No complete native workflow | Project inspection, plans, revision checks, approval, Apply, Undo/history, previews, render verification |
| 6 | Creative Library | General web search | Curated free assets, relevance ranking, licence receipts, downloads and Kdenlive import |
| 7 | Strong loop and command safety | Manual Approval and internal loop | Finite budgets, effective repetition detection, bounded retries, verified Stop and uncertain recovery |
| 8 | Owner-grade projects and continuity | Sessions, recipes and tasks | Working Notes, durable Branch, rejected proposals, connected evidence, backups and restoration |
| 9 | Approved-link continuity | DDGS, Fetch, Playwright, YouTube Transcript | Durable source records that continue through Q&A, analysis, planning and editing |
| 10 | Purpose-limited folder permissions | Working-directory/file access | Exact purpose and scope, receipts, revocation and no silent expansion |
| 11 | Windows application integration | Browser automation; no equivalent general Windows controller | Structured Windows connectors and carefully bounded UI Automation |
| 12 | Privacy and operation records | Settings, local data, telemetry choice | Outbound disclosure, protected logs, operation receipts, real outcomes and credential-safe audit history |
| 13 | Manual consumer-AI handoff | Generic browser/tools | Prepare text/files while leaving upload and Send entirely to the owner |

---

# Detailed build requirements

## 1. Trusted memory, provenance, and owner review

### Why stock Goose is insufficient

Goose Memory and Chat Recall can store preferences and search conversations, but they do not enforce OddBrain's source, confirmation, and speaker boundaries. Generic memory may be useful as temporary assistance, but it cannot be the authoritative owner-memory system.

### Required data boundaries

Store these separately:

1. Original raw source material.
2. Processed but unconfirmed interpretations.
3. Owner-confirmed information.
4. Rejected proposals and contradicted interpretations.
5. Owner instructions and statements.
6. AI statements.
7. Statements by other identified or unidentified speakers.
8. Derived evidence and conclusions.

No processing step may silently promote an interpretation into confirmed owner memory.

### Evidence connections

Every processed claim must retain links to:

- source attachment, chat, project, or URL;
- exact PDF page, spreadsheet region, audio/video interval, frame, or quotation;
- source hash where applicable;
- processor and version;
- model and engine;
- processing date;
- relevant configuration;
- current confirmation state;
- contradictions and uncertainty.

### Review workflows

Build:

- proposed-memory queue;
- accept, edit, reject, and defer controls;
- source preview;
- confidence and contradiction display;
- affected-project display;
- monthly owner review;
- 60-day interpretation review;
- removal consequences;
- revision history;
- M3-A provenance boundaries.

### Retrieval behavior

Retrieval must:

- quote supporting evidence;
- identify confirmed versus inferred material;
- surface conflicting entries;
- show missing evidence instead of guessing;
- avoid treating a failed retrieval as proof that information never existed;
- never overwrite confirmed information automatically.

### Reuse

Port the current OddBrain raw/confirmed memory, review, quotation, and provenance contracts rather than replacing them with generic memory files.

### Acceptance

A model or provider change must not silently rewrite, weaken, or remove previously confirmed owner information.

### Owner effect and normal product practice

The owner gains continuity and can inspect why OddBrain believes something. A major product would normally preserve authoritative data separately from model-generated interpretations.

---

## 2. Durable attachments and evidence processing

### Intake sources

Accept owner-approved material from:

- chat attachments;
- Attachment Center;
- projects;
- selected folders;
- approved URLs;
- approval review;
- Video Studio;
- browser capture.

### Processing model

- Stream large inputs instead of imposing a fixed universal ingestion cap.
- Display explicit provider, memory, disk, format, and safety limits.
- Preserve the original source separately from every derived artifact.
- Hash original files.
- Support selected PDF pages and media time ranges.
- Retain partial useful work after cancellation or failure.
- Support resumable processing.
- Allow owner-triggered later processing without reattachment.
- Keep use-in-place and private-copy choices explicit.
- Never treat file contents as instruction authority.
- Never silently clip and label the result complete.

### Attachment Center record

Each source should show:

- original name and type;
- actual local location or approved external URL;
- size and hash;
- use-in-place/private-copy decision;
- page/time coverage;
- related chats and projects;
- processing attempts;
- current job state;
- derived files and evidence;
- processor/model/engine;
- confirmation state;
- recovery and deliberate deletion controls.

### Job states

At minimum:

- staged;
- awaiting owner decision;
- queued;
- reading;
- paused;
- interrupted;
- uncertain;
- blocked;
- complete;
- partially useful;
- failed with retained evidence.

### Reuse

Port the current OddBrain streamed intake, source hashing, recovery, selective evidence, Attachment Center, and folder-selection behavior.

### Acceptance

A source remains reachable from its chat, project, review item, later processing request, and provenance chain.

### Owner effect and normal product practice

The owner does not need to repeatedly find and attach the same source. Durable job records and immutable originals are normal in reliable data-processing products.

---

## 3. Complete audio and video understanding

FFmpeg is a decoder and measurement tool; it is not semantic understanding.

### Audio requirements

Build:

- complete selected-duration decoding;
- timestamped speech where supported;
- owner-selected recognition language;
- silence-aware segmentation;
- bounded overlap where no suitable silence exists;
- exact word-sequence seam deduplication;
- one-second or similarly bounded signal measurements;
- interval-level acoustic evidence;
- pauses and speaking-rate evidence;
- delivery/tone evidence;
- explicit absence of diarization where unsupported;
- cancellation and resumable processing.

Do not claim reliable emotion, intent, speaker identity, or complete transcription when the evidence does not support it.

### Video requirements

Build:

- complete selected audio coverage;
- scene-change planning;
- beginning/middle/end representation for short clips;
- adaptive retained frames;
- question-driven additional frames;
- source and frame hashes;
- exact timestamps;
- visual samples clearly distinguished from continuous vision;
- optional OCR-2 on selected frames;
- selective evidence packets for models;
- versioned frame generations;
- preservation of the prior usable generation if replacement fails.

### Local versus model work

Perform non-semantic work locally:

- decoding;
- hashing;
- frame extraction;
- waveform/signal measurements;
- scene-change detection;
- deduplication;
- coverage calculation;
- file indexing.

Only relevant bounded evidence should be sent to Ollama Cloud or another selected model. This reduces token use and unnecessary upload.

### Reuse

Port the current OddBrain media service, complete-duration evidence, seam behavior, adaptive frames, question-driven retrieval, and recovery records.

### Acceptance

A long video cannot be described as fully understood from a transcript and a few unlabelled frames. Coverage and uncertainty must always remain visible in the data contract, even while UI design is deferred.

### Owner effect and normal product practice

The owner receives usable analysis without silently paying to upload entire media files. Major systems normally separate deterministic preprocessing from expensive semantic interpretation.

---

## 4. Reviewed DeepSeek-OCR-2 integration

### Existing reusable component

- DeepSeek-OCR-2 source/model exists.
- It is not a complete OddBrain ingestion system.
- Official instructions are primarily CUDA/Linux-oriented and do not constitute accepted Windows 11 support.

### Required adapter

Build one reviewed local adapter that provides:

- exact capability handshake;
- model identity `DeepSeek-OCR-2`;
- adapter version and licence;
- executable hash pinning;
- image, PDF-page, and video-frame inputs;
- bounded structured output;
- cancellation;
- local temporary-file control;
- clear failure results;
- no network fallback;
- page/frame coverage;
- provenance receipts;
- Windows hardware compatibility report.

### Boundaries

- Do not add a second OCR subsystem.
- Do not substitute a DeepSeek text API.
- Do not silently download a model.
- Do not claim GPU compatibility before owner-machine acceptance.
- OCR results remain unconfirmed until reviewed or corroborated.

### Reuse

Port the existing OddBrain adapter protocol and hash-verification behavior.

### Acceptance

The same reviewed OCR path serves documents and selected video frames while preserving source coverage and evidence identity.

---

## 5. Kdenlive Video Studio

Kdenlive remains the sole editor and source of timeline truth.

### Reviewed native Kdenlive foundation

Current reviewed protocol reference:

- repository: `lucasscariot/kdenlive`;
- commit: `b9a1a6ce0612d9bb6be2b7df2473c2ffbe71e798`;
- expected server identity: `kdenlive-native` `1.0.0`;
- MCP transport: loopback Streamable HTTP;
- intended OddBrain port: `8766` so the established browser companion can retain `8765`.

A real Windows build, source provenance, packaging, and owner acceptance remain required.

### Secure connection

Require:

- localhost binding only;
- access token enabled;
- token stored through Windows-protected credential storage;
- exact identity and protocol negotiation;
- required tool inventory;
- no generic tool aliases;
- project/session identity;
- no network-listening mode.

### Project inspection and planning

OddBrain must:

- inspect real Kdenlive project state;
- use actual bin, sequence, track, clip, and revision identifiers;
- retain the full local project path only in the trusted process;
- give the model an opaque project handle;
- validate supported edits before application;
- display the complete canonical edit plan;
- calculate and display the exact plan SHA-256;
- bind approval to endpoint, token, session, tool inventory, settings, revision, and payload digest.

### Applying changes

- Require one-use owner approval.
- Recheck identity and revision before mutation.
- Send one reviewed native batch where possible.
- Write and fsync a durable operation record before the mutation.
- Use a stable request ID where supported.
- Never invent a retry after an uncertain outcome.
- Convert a prepared-but-unconfirmed restart state into visible uncertainty.
- Share Kdenlive's real Undo/history.
- Distinguish owner changes from AI-originated changes.

### Preview and export

Support:

- frame checkpoints;
- short preview renders with audio;
- owner-approved preview understanding;
- render progress;
- Stop/cancel;
- full decode verification;
- duration, dimensions, and frame checks;
- bounded audio preview evidence;
- final owner viewing.

Technical verification must not be called editorial approval.

### Reuse

Port the existing OddBrain native protocol checks, canonical plan, revision binding, durable request journal, Video Studio intake, and review-only AI tools.

### Acceptance

Required real Windows 11 checks include project creation/opening, media import, timeline edit, revision conflict, shared Undo, forced-exit recovery, preview with audio, render cancellation, export, and full render verification.

### Owner effect and normal product practice

The owner keeps familiar Kdenlive editing and Undo instead of trusting an AI-maintained shadow timeline. Structured native integration with validation and rollback is the normal safer design.

---

## 6. Creative Library

### Sources

Prioritize:

- Openverse;
- Wikimedia Commons;
- owner files;
- other future reviewed free sources.

No paid stock-media service or subscription is required.

### Build

- AI-assisted search;
- automatic candidate curation;
- relevance ranking;
- source and creator display;
- licence and attribution requirements;
- NC/ND warnings;
- direct source URL;
- download receipt;
- file hash;
- project relationship;
- Kdenlive-bin import;
- replacement suggestions;
- duplicate detection;
- retained rejection reasons.

The AI should perform useful curation. The owner approves selections but should not be forced to manually search and classify everything.

### Reuse

Port current Creative Library contracts, Openverse/Wikimedia behavior, licence receipts, and Kdenlive intake.

### Acceptance

No media may be described as safely reusable without its actual source and licence record. External licence changes remain outside OddBrain's control and must be disclosed.

---

## 7. Strong loop, tool, and command safety

### Why stock defaults are insufficient

Goose's controllable state machine is a good foundation, but previously audited defaults and defects include excessive maximum turns, ineffective repetition protection, fail-open inspection paths, empty-response retry risks, Stop/cancellation defects, and session/recovery problems.

Manual Approval helps but does not solve every engine-level failure mode.

### Required policy behavior

- finite configurable turn/action budget;
- repeated-identical-action detection;
- bounded provider and tool retries;
- no destructive retries;
- no automatic Grind behavior;
- subagent count, depth, and token limits;
- fresh approval before consequential commands;
- per-destination outbound approval;
- extension/tool allowlist by task;
- fail-closed safety inspection;
- cancellation propagation to child processes and MCP calls;
- verified Stop outcome;
- durable actual outcomes;
- no inferred success from model text;
- paused/uncertain recovery after interruption;
- no automatic replay after restart.

### Commands

Commands remain off by default. Every consequential command must show:

- exact command;
- working directory;
- intended result;
- affected files/resources;
- network use;
- rollback or recovery information;
- fresh owner approval.

### Important architectural boundary

A normal external MCP extension cannot fully enforce the Goose loop. Reliable enforcement requires Goose core policy hooks or an upstream-maintained policy extension point.

### Reuse

Port OddBrain's command approvals, durable outcomes, recovery states, and no-destructive-retry rules. Do not create a remote command bridge.

### Acceptance

Stopping, crashing, or losing an MCP response must never silently trigger a second consequential attempt.

### Owner effect and normal product practice

The owner can use automation without supervising every internal token, while still approving meaningful consequences. Major products place enforcement in the host runtime, not only in prompts.

---

## 8. Projects, Working Notes, Branch, backups, and continuity

### Projects

Build project-scoped relationships among:

- chats;
- Working Notes;
- attachments;
- evidence;
- artifacts;
- branches;
- selected folders;
- approved links;
- Video Studio intake;
- Creative Library selections;
- tasks and outcomes;
- backups.

### Working Notes

Preserve:

- owner-authored notes;
- AI proposals;
- confirmation state;
- source and chat links;
- revision history;
- project scope;
- rejected revisions;
- export and backup.

### Branch

Support:

- branching from an exact message;
- preserving the original conversation;
- naming alternatives;
- comparing proposals;
- retaining rejected proposals;
- merging only owner-approved conclusions;
- preserving attachment and evidence links.

### Chat and speaker boundaries

- Keep owner, AI, and other speakers distinct.
- Retain exact messages, revisions, and attachments.
- Surface uncertainty and contradictions.
- Separate tool outcomes from model claims.
- Show the model/engine responsible for generated analysis.
- Preserve cancelled and uncertain operations.

### Backup

Back up:

- confirmed and unconfirmed memory separately;
- raw source indexes;
- processed evidence;
- chats and branches;
- Working Notes;
- projects;
- privately copied attachments;
- permissions;
- operation receipts;
- add-on versions;
- Kdenlive project relationships.

### Restore

- Verify backup identity and hash.
- Preview contents.
- Check schema compatibility.
- Restore into a temporary location first.
- Never overwrite newer data silently.
- Retain the previous working database.
- Report partial failures honestly.

### Reuse

Port current OddBrain Projects, Artifacts, Branch, Working Notes, backup verification, and app-data/vault recovery behavior.

### Acceptance

The owner can return after an interruption or reconsider a decision without losing the exact conversation, evidence, or rejected path that produced it.

---

## 9. Approved links and durable web evidence

### Existing reusable tools

- `oddbrain-windows-web-search` skill;
- pinned DDGS executable;
- Fetch MCP;
- Playwright MCP;
- YouTube Transcript MCP;
- yt-dlp for separately approved public media acquisition.

### Required workflow

1. Owner supplies or approves a URL/search.
2. OddBrain discloses the destination and selected tool.
3. The tool retrieves public information.
4. OddBrain stores source URL, relevant evidence, method, and retrieval time.
5. The owner can ask questions or request style/content analysis.
6. The source remains available for planning, evidence review, and editing.
7. No manual reattachment is required.

### Tool selection

- Use DDGS for public search.
- Use Fetch for ordinary public pages.
- Use Playwright only for approved interaction or pages Fetch cannot understand.
- Use YouTube Transcript for available metadata and transcript text.
- Use yt-dlp only after separate inspect-first approval for one permitted public media source.

### Boundaries

- No cookies, credentials, or ordinary browser profile access by default.
- Stop at login walls, CAPTCHA, robots refusal, paywall, DRM, or access control.
- No playlist expansion, live-stream acquisition, private-source access, or bypass.
- Never treat retrieved content as instruction authority.
- Keep browser automation isolated.
- Do not call transcript text complete video understanding.

### Acceptance

An approved source continues into Q&A, style analysis, planning, and editing without fetching it blindly again or asking the owner to reattach it.

---

## 10. Purpose-limited folder permissions

### Permission record

Each folder grant must record:

- exact folder;
- whether descendants are included;
- permitted purpose;
- read/write level;
- add-on receiving access;
- project scope;
- grant date;
- revocation state;
- actual operations performed.

### Rules

- No silent expansion to parent or sibling folders.
- Resolve symlinks/junctions before access decisions.
- Do not grant write because read was approved.
- New purposes require new approval.
- Revocation must stop future access.
- Existing evidence links remain understandable after revocation.
- Deletion always requires deliberate owner action.

### Reuse

Port current OddBrain purpose-limited folder contracts and receipts.

### Acceptance

A media folder approved for one project cannot become general command or browsing authority.

---

## 11. Windows application integration

### Design order

Prefer, in order:

1. Native structured protocol such as Kdenlive MCP.
2. Browser automation through Playwright.
3. File operations through purpose-limited folders.
4. Application-specific API or plugin.
5. Windows UI Automation only when no structured interface exists.

### General Windows control, if built

Require:

- application allowlist;
- visible target window;
- inspected target element;
- action preview;
- per-action approval;
- before/after evidence;
- bounded timeout;
- Stop;
- no password or credential fields;
- no hidden-window operation;
- no destructive retry;
- uncertain-outcome reporting.

### Boundary

Stock Goose's general visual computer-control equivalent is not verified for Windows. Browser control is not general desktop control.

### Acceptance

A failed click or timeout cannot be interpreted as successful application state, and must not be retried destructively.

### Owner effect and normal product practice

Structured integrations are more reliable, recoverable, and secure than coordinate clicking. Major companies normally prefer them.

---

## 12. Privacy, credentials, network disclosure, and operation records

### Privacy Center service requirements

Even while its final UI is deferred, define data contracts for:

- enabled add-ons;
- requested tool permissions;
- folder permissions;
- network destinations;
- selected provider/model;
- data sent to a provider;
- locally stored logs;
- credential references without secret values;
- operation receipts;
- extension versions and hashes;
- pending updates and rollback versions;
- telemetry state.

### Credentials

- Use Windows-protected credential storage.
- Never place secrets in prompts, command output, logs, Markdown, or add-on manifests.
- Add-ons receive capability references, not raw provider credentials, unless an explicit reviewed integration requires otherwise.
- No Arena/Claude Code/session credential forwarding.

### Outbound disclosure

Before consequential outbound use, show or record:

- destination;
- selected tool;
- intended data;
- whether a provider receives derived evidence;
- whether credentials/cookies are involved;
- owner decision.

### Logs

- Protect local log permissions.
- Avoid complete prompt/credential logging where unnecessary.
- Record actual operations without copying sensitive payloads indiscriminately.
- Provide deliberate retention and deletion controls.

### Goose core work

Some privacy issues require upstream/core changes, including protected request logs, reliable telemetry-off handling, fail-closed safety inspection, and host-level network/permission enforcement. A normal add-on cannot safely repair all core paths.

### Acceptance

The owner can determine what left the machine and why, without exposing secrets in the record itself.

---

## 13. Manual consumer-AI handoff

### Build

A handoff add-on may:

- prepare a prompt;
- prepare an approved attachment list;
- identify the target consumer service;
- open the service;
- copy text to clipboard;
- explain what the owner should upload;
- wait for the owner;
- later accept owner-provided results.

### It must not

- create or automate accounts;
- bypass free allowances or service limits;
- press Send;
- submit forms;
- upload silently;
- copy credentials;
- scrape private account data;
- claim the external response was received until the owner supplies it.

### Acceptance

The owner always performs the final submission and can inspect every attachment and prompt first.

---

# Supporting systems

## Tasks, routines, and scheduling

Goose recipes and tasks are reusable foundations, but consequential automation needs OddBrain controls.

Build:

- owner-readable routine definition;
- preview of steps/tools;
- explicit permissions;
- schedule disclosure;
- fresh approval for consequential steps;
- visible queued/running/paused states;
- cancellation;
- real outcomes;
- recovery receipts;
- no automatic replay after restart.

A schedule may prepare local information, but commands, uploads, edits, or external changes remain paused for approval unless the owner later approves a narrower policy.

## Optional specialist engines

Goose should own the normal agent loop. Optional add-ons may connect separately installed specialist engines such as Claude Code or agy.

Rules:

- keep engines separately installed;
- disclose engine/model identity;
- request permission before sharing source/evidence;
- maintain independent Stop and outcome records;
- do not claim external-engine reasoning belongs to Goose;
- do not create a reverse Arena session/API proxy;
- never let independent tools edit the same checkout simultaneously.

## Resource and token management

- Perform deterministic work locally.
- Stream large sources.
- Use explicit resource, provider, and safety limits rather than hidden universal clipping.
- Build compact evidence packets.
- Cache safe deterministic results by source/configuration identity.
- Support resumable jobs.
- Show when compaction or summarization may omit context.
- Do not silently evict owner evidence.

---

# LEGO-style add-on grouping

The implementation should be separable into coherent modules rather than one inseparable package.

## Foundation modules

1. **OddBrain Core** — shared data identities, evidence graph, jobs, permissions, projects, receipts, backup contracts.
2. **Loop & Safety** — budgets, approvals, retries, Stop, recovery, real outcomes.
3. **Attachments & Evidence** — intake, hashing, coverage, resumable processing.
4. **Memory & Review** — confirmation boundaries, contradictions, monthly review.

## Capability modules

5. **Web & Approved Links** — DDGS, Fetch, Playwright, YouTube continuity.
6. **Documents & OCR-2** — document coverage and reviewed DeepSeek adapter.
7. **Media Understanding** — audio, transcript, tone/delivery, scenes, frames.
8. **Video Studio** — Kdenlive planning, approval, editing, preview, render verification.
9. **Creative Library** — free media discovery, curation, licences, Kdenlive import.
10. **Windows Connectors** — structured application integrations and bounded UI Automation.
11. **Consumer AI Handoff** — owner-controlled free-service handoff.
12. **Optional Engine Adapters** — separately installed specialist engines.

## Installation requirements for every module

Each distributable module eventually needs:

- unique ID and version;
- compatible Goose/OddBrain Core range;
- permissions and network declaration;
- local executable requirements;
- exact dependency lock;
- licences and source commits;
- data-schema version and migration;
- enable/disable behavior;
- rollback path;
- owner-readable changes;
- removal without silent data deletion.

---

# What should be reused, not rebuilt

Do not rebuild these generic foundations without a verified reason:

- Goose's normal agent engine and state machine;
- Ollama Cloud/provider selection;
- sessions and context management;
- MCP transport and extension loading;
- skills and hooks;
- DDGS search;
- Fetch;
- Playwright;
- YouTube Transcript;
- FFmpeg and ffprobe;
- yt-dlp;
- Kdenlive's actual timeline, preview, effects, Undo/history, rendering, and export;
- DeepSeek-OCR-2's model.

OddBrain's work is the safety, evidence, provenance, recovery, permissions, owner workflow, and specialist integration around those components.

---

# Port from the existing OddBrain implementation

Port or adapt existing implementations for:

- durable chats and transcripts;
- raw/confirmed memory separation;
- interpretation review;
- Attachment Center;
- streamed selected-file processing;
- purpose-limited folders;
- Branch;
- Working Notes;
- quoted-evidence recall;
- Projects and Artifacts;
- browser capture and recovery;
- verified backups;
- media source hashing and evidence;
- DeepSeek-OCR-2 adapter protocol;
- Video Studio intake and recovery;
- Kdenlive native protocol checks;
- canonical edit plans and digest-bound approval;
- Creative Library;
- command approval and real outcomes.

Do not replace these reviewed behaviors with reduced generic scaffolding merely because Goose has a similarly named basic feature.

---

# Build order without the deferred UI

## Phase 0 — contracts and proof boundaries

1. Freeze the trusted data/provenance contracts.
2. Define module manifests, permission declarations, and compatibility rules.
3. Map existing OddBrain code to the module boundaries.
4. Identify which loop controls require Goose upstream changes.
5. Preserve the current working OddBrain implementation as fallback.

## Phase 1 — safety and core data

1. OddBrain Core data identities and evidence graph.
2. Durable jobs and operation receipts.
3. Loop/action/retry/Stop policy hooks.
4. Purpose-limited folder permissions.
5. Backup, restore, and migration contracts.

## Phase 2 — information workflows

1. Attachments and evidence.
2. Trusted memory and owner review.
3. Projects, Working Notes, and Branch.
4. Approved links and durable web evidence.
5. Privacy/outbound-operation records.

## Phase 3 — documents and media

1. Document coverage.
2. DeepSeek-OCR-2 adapter and Windows acceptance.
3. Complete-duration audio processing.
4. Video scenes, adaptive frames, and selective evidence.
5. Token-efficient semantic analysis through the selected Goose model.

## Phase 4 — Kdenlive and creative work

1. Reproducible native-MCP Kdenlive Windows build.
2. Secure connection and capability verification.
3. Plan/revision/approval/apply workflow.
4. Preview and export verification.
5. Creative Library and licence receipts.
6. Forced-exit and uncertain-operation recovery.

## Phase 5 — optional modules

1. Windows application connectors.
2. Routines and guarded scheduling.
3. Manual consumer-AI handoff.
4. Optional specialist-engine adapters.

The final owner-facing UI is a separate decision and can be connected after these contracts are stable, provided a supported host route exists.

---

# Validation and release requirements

## Retain non-behavioral checks

- Node.js 24 TypeScript checking;
- production builds;
- security-policy inspection;
- dependency audit thresholds;
- CodeQL;
- installer/release inspection;
- package/hash inspection;
- `git diff --check`.

These checks do not prove the connected owner workflow.

## Manual Windows 11 acceptance

Required areas include:

- add-on installation, disabling, compatibility, and rollback;
- permission and outbound disclosure;
- crash/Stop recovery;
- large streamed attachments;
- PDF page coverage;
- OCR-2 hardware and adapter identity;
- complete-duration audio/video processing;
- transcript seams;
- FFmpeg and yt-dlp recovery;
- Kdenlive handshake and project state;
- revision conflicts;
- owner/AI interleaved edits;
- shared Undo/Redo;
- preview audio and evidence;
- rendering and cancellation;
- full export verification;
- backup and restore;
- packaged installation.

The previous behavioral test suite was removed because it was not trusted. It must not be recreated or treated as proof. Replacement tests should be designed only after the connected behavior is manually confirmed and their design is approved.

---

# Principal trade-offs

| Choice | Later owner effect | Normal major-product approach |
|---|---|---|
| Reuse Goose engine | Less engine maintenance; inherits Goose defects that require policy hardening | Reuse a maintained platform and add enforceable policy layers |
| Keep tools separately installed | Clear ownership/licences and easier independent updates; more compatibility checks | Common for large engines/editors such as FFmpeg/Kdenlive |
| Pin reviewed versions | Stable behavior; updates arrive only after review | Standard for production dependencies |
| Disable blind auto-update | Prevents silent breakage; owner may receive fixes later | Staged rollout with rollback is normal |
| Local deterministic preprocessing | Lower token/privacy cost; uses local CPU/disk/time | Standard hybrid local/cloud architecture |
| Cloud semantic model | Better reasoning on current hardware; selected evidence leaves the machine | Common when disclosed and minimized |
| Structured Kdenlive MCP | Reliable state/revision/Undo; requires a reviewed Kdenlive build | Preferred over brittle coordinate automation |
| Manual Approval | More prompts; greatly reduces silent consequential action | Appropriate default for owner-controlled automation |
| Preserve raw and derived data | More storage; substantially stronger recovery and auditability | Normal evidence/provenance practice |
| Defer full UI | Faster focus on functional gaps; exact owner experience remains unresolved | Stabilize contracts before final presentation layer |

---

# Definition of done

A feature is not complete because a connector, interface, or scaffold exists.

For a module to be called complete, it must have:

- real connected implementation;
- declared permissions and network behavior;
- exact source and dependency identity;
- durable owner data and migration behavior;
- cancellation and recovery;
- actual-outcome reporting;
- no silent substitution or permission expansion;
- Windows 11 owner acceptance;
- documented limitations;
- rollback or safe disable behavior;
- updated README and product-authority documentation when implementation occurs.

The capability claim must match what the code and owner-machine outcome actually prove.

---

# Immediate next decision gates

No implementation should begin merely from this planning document. Before building:

1. Confirm the non-UI module boundaries.
2. Select the first functional priority: Loop & Safety, Core Evidence, or Attachments.
3. Determine the smallest required Goose core hooks for that priority.
4. Decide whether those hooks should be proposed upstream before implementation.
5. Protect the current OddBrain implementation and data as the migration source and fallback.

The complete UI/UX direction remains intentionally deferred.
