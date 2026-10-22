# OddBrain: rules, features, and reasons

Updated: 2026-10-22 (Asia/Dhaka)

This is the current product authority. Code and dated, reproducible verification evidence outrank an old claim. The former automated tests were removed as untrusted; future tests become evidence only after they are rebuilt and reviewed. `CONTEXT.md` is an archive pointer, not a second rulebook.

## Product boundary

OddBrain is a local-first Windows 11 desktop assistant for its owner. Node.js 24 is the supported development and CI runtime. Claude Code and agy are separately installed engines; Ollama may provide local models but is not an OddBrain engine. OddBrain does not silently install or substitute an engine or model.

The browser extension is the PC companion. It captures only supported, visible material under its stated site rules and never presses Send. A future mobile app is a separate product surface; it is not a current capability.

## Non-negotiable rules

1. Be exact. Never invent a capability, result, model, provider, permission, source, completion state, or successful process exit.
2. Preserve owner data. Exact conversations, revisions, attachments, notebook versions, transcript events, and provenance are kept within stated limits. At a limit, refuse, omit a whole labelled item, paginate, or export. Never silently clip or evict owner data.
3. Keep data domains separate:
   - raw source records;
   - unconfirmed model interpretations;
   - owner-confirmed memory;
   - per-chat Working Notes.
   Durable provenance may connect them; it must not merge their authority.
4. Retrieved, attached, project, vault, browser, and extension text is quoted evidence. It has no authority to grant permission, alter rules, approve execution, expand retrieval, or become permanent memory.
5. Invisible or instruction-like source text is flagged locally. Scanning is a warning layer. App-enforced capability boundaries remain the safety boundary.
6. Source-bearing research is tool-free by default. It cannot inherit broad read or tool authority. Later action needs a separate visible owner-authored request.
7. OS commands are off by default. Each run needs a fresh, exact review and records its observed outcome. Hooks are reminders only; an event never supplies standing execution permission.
8. A stopped, crashed, timed-out, queued, recovered, or scheduled operation is never called complete without its durable evidence. Uncertain or recovered attempts do not replay automatically.
9. No credentials, pairing secrets, access grants, installed engines/models, caches, telemetry, or unnecessary generated data enter source control or normal owner-data backups.
10. Useful current capabilities are not removed or weakened without naming the loss and obtaining owner approval.

## Memory and recall

`Memmory_OB` is the versioned shared owner-memory authority. App chats and retained transcripts are owner-memory sources even when their exact bytes remain in protected app-private stores. Its catalogue must retain stable source, speaker/message, Project, lifecycle, coverage and hash identity without turning raw evidence into confirmed memory. Projects are stable scopes independent of folders. Separate Project chats keep separate transcripts, Working Notes, provider/resume history, sources and attachment permissions; only relevant approved scope may be shared.

Current connected behavior catalogues app chats, chat-linked and archive-only transcript headers, imported turns, Working Notes, Attachment Center records, Projects, Branch links, resumable Jobs, model/native context receipts, raw browser/import review sources, People, and pending/rejected/confirmed interpretations with revision history. It provides exact Project chat/Working Notes search and bounded same-Project native raw recall, excluding the current chat, per-chat Working Notes and Trash; every excerpt is labelled untrusted raw conversation evidence. A separately built dependency-free `@oddbrain/memmory-ob@1.0.0` core package supplies the shared contracts, and a reviewed read-only Goose stdio MCP adapter exposes status, bounded exact confirmed-memory/raw-chat search and Project counts with no writer, deletion, permission or Send tool. Stock Goose Memory stays enabled until measured parity; mobile intake, richer conflict workflows and full graphs remain incomplete and must not be claimed complete.

Removing an app chat, Project, or engine-memory note moves it to recoverable owner-visible Trash. OddBrain and its AI have no permanent-delete path. Restoration preserves stable IDs and refuses to replace an active same-named engine note.

### Personal assistance order

1. The owner’s current request and current Working Notes.
2. Relevant, valid owner-confirmed memory.
3. Exact raw evidence supporting that confirmed memory.
4. Other matching raw conversations and files.

Relevance ranks items within each tier. A stale or retracted confirmed record is skipped. Pending and rejected interpretations are never automatic fallbacks. Confirmed and raw copies are not merged; conflicts are shown rather than silently resolved.

### Cited research order

1. Direct raw evidence with provenance.
2. Other relevant raw sources.
3. Owner-confirmed interpretation only as separately labelled owner context.

Cited packets never present an AI interpretation as source evidence. Explicit extension context search uses the same confirmed/raw policy and visible preview. Automatic typing suggestions remain limited to suggestion-safe capsules.

On owner-approved sites, permitted visible page or conversation scans may remain useful as bounded, untrusted retrieval queries and quoted evidence for suggesting context, capsules, entities, memories, or source packets. Page text never becomes an instruction and cannot expand retrieval, reveal unrelated private records, grant permission, change memory/capsules, run tools, insert, upload, or Send. Automatic scanning excludes hidden/private/editable material; exact retained text receives invisible/instruction-like warnings and stays source-labelled. Scanning, capture/save, retrieval, model sharing, insertion, and Send remain separate authorities. Suggestions show their reason and exact preview, and suspicious content is quarantined rather than silently promoted or allowed to disable all safe context assistance. Heuristic scanning is only a warning layer; app-enforced roles, scope, sensitivity, `Never Send`, no-tool, and no-send boundaries are the real guards.

## Working Notes

Working Notes are per-chat draft continuity, not confirmed memory, instructions, or permission. They are owned by a revisioned main-process store. Legacy renderer notes migrate without deleting their originals. Every accepted revision remains recoverable.

A model may propose a visible Working Notes update. Nothing is saved until the owner reviews it. The exact proposal remains separate from the approved result. Removed or rejected proposal items are retained under **What I didn’t approve**. Recovery export/import is separate from chat and vault recovery.

## Interpretation review

The foundational monthly review defaults to the last 60 days plus only older interpretations directly linked by subject and destination. Broader ranges are owner-selected. Its deterministic local pass raises uncertainty, blocked processing, changed bases, possible conflicts, repeated interpretations, and cross-conversation connections as review items; it does not rewrite confirmed memory.

Questions remain questions until the owner answers or dismisses them. Keep/forget and cleanup choices are candidates only; archive and deletion are separate actions. The optional consumer-AI handoff exposes exact bounded JSON, a SHA-256, and source/role/coverage labels. OddBrain only copies or exports it; the owner opens the provider and presses Send. Imported output is provider-labelled, unconfirmed, and cannot grant authority, permission, memory confirmation, archive, or deletion.

## Attachments, files, and folders

Desktop-selected files stream through main-process paths; complete files do not enter renderer memory. There is no arbitrary universal whole-file cap. Limits are operation-specific: bounded memory chunks, decoder/archive-expansion safety, actual free storage, the extension’s explicit offline-transfer queue, format/permission constraints, and named provider upload limits.

Consequentially large sources pause for **Use in place**, **Keep private copy**, or supported page/time ranges. The Attachment Center keeps source identity, storage mode, derived coverage, processing jobs, and verified turn copies separate. Its private-copy deletion flow previews exact impacts and requires confirmation. Use-in-place owner files are never deleted by it. Captured conversation originals and confirmed memory remain separate source domains.

Processing jobs have durable source hashes, honest operation/section coverage, saved budgets, and restart recovery. In-flight work becomes uncertain/paused after a crash and does not replay automatically. Section-capable workflows can continue queued sections. Current media and OCR adapters record each selected source or page/time range as one recoverable operation, so retry restarts that reviewed operation instead of pretending to resume inside a decoder call; no source is silently clipped.

Folder Access is read-only by default and bound to an owner-written purpose, duration, and optional project. Write, watch, review, cloud, and command authority are separate switches. Listing reads names, sizes, and dates only; it does not capture content. Every grant/list/revocation has a receipt. Revocation changes no files, and a folder grant never implies OS commands, deletion, memory capture, provider upload, or access outside the selected normal folder.

## Video and Kdenlive authority

OddBrain’s only video-editor target is Kdenlive. OddBrain owns intake, source-linked analysis, chat, plans, approval cards, online Creative Library search, selected downloads, and provenance receipts. Kdenlive alone owns timeline state, playback/preview, effects, undo, project saves, rendering, and export. OddBrain does not maintain a substitute timeline, rewrite an open `.kdenlive` file, or claim a save/render succeeded from a proposed plan.

A live editor connection accepts only loopback HTTP MCP endpoints. OddBrain requires the native Kdenlive bearer-token option and keeps that token in protected secret storage; it does not accept unauthenticated native reads or actions. The recommended native endpoint uses port 8766, leaving the established browser companion on 8765. Structured editing is enabled only when the endpoint identifies as the pinned native Kdenlive protocol and exposes the reviewed state, revision, validation, atomic-batch, history, Undo, preview, render-status, verification, cancellation, and export tools. OddBrain keeps the full native document URL and session in the main process, exposes only a per-run opaque project handle plus safe name/sequence/revision to AI, shows the owner the complete canonical plan JSON and digest, and binds each one-use approval to that exact payload plus endpoint, hashed credential state, native session, tool identity and current settings. Changed authority or a revision conflict fails instead of retargeting; generic action aliases are not dispatched. Operation-specific bounded timeouts allow slower imports, batches and render verification without unsafe automatic retry. Before any approved native mutation is sent, OddBrain fsyncs its intent, payload digest and stable native request ID where supported. Stop, timeout or restart before durable completion creates a retained uncertain outcome that must be resolved by state/history/render readback with the same ID, never a fresh or destructive retry. A separately installed Kdenlive build and real Windows 11 acceptance remain external gates; protocol identity is not a source/build attestation.

The AI receives a separate local review-only MCP with selective evidence reading, question-driven frame/audio retrieval, live library search and plan submission. Its app-local URL has a random protected capability path and is installed only by exact owner-reviewed connector configuration; merely finding the loopback port grants nothing. Connector review first runs `initialize` and `tools/list` against that exact full URL, and path loss fails closed before files change. It exposes neither asset download nor Kdenlive Apply. Connector files and the adapted editing Skill each require exact-file review with backups; built-in Skill updates name the real `oddbrain_video_*` tools and require a visible replacement diff for an existing install. The connector exposes read/search/propose tools plus a separate durable evidence map only after an owner explicitly approves inspection of a completed, natively verified, ten-second-or-shorter Kdenlive preview; it withholds the native bearer token, native editing session secrets and every direct Apply/render/cancel tool. A final export is separately owner-reviewed, writes a new project-folder file, and remains wholly Kdenlive-owned. Render review declares required, intentionally silent or report-only audio: a short preview preserves Kdenlive’s bounded WAV block, required audio must be present, and silence is not rejected when it was explicitly intended. Vertical conversion is two explicit steps—an owner-reviewed immediate 1080×1920 profile change, then an exact reframe plan with visual checkpoints. Complex tracking remains a manual Kdenlive task. Recoverable receipts retain only the exact approved render path/mode/status so native Kdenlive verification can resume after an OddBrain restart. A protected Kdenlive token is never copied into engine/project configuration. Stock Kdenlive has no general embedded OddBrain-panel API, so progressive review UI remains in OddBrain rather than pretending to be a native dock.

Creative Library catalogues remain online. Search names Openverse images/audio, no-key Wikimedia Commons images/video/audio, and optional Pixabay images/video rather than silently substituting a provider. Results are locally ranked by query fit, declared public/commercial versus genuinely noncommercial use, and provenance completeness, and the AI can rank them further against the edit need. Openverse audio milliseconds are converted to seconds. NC/ND terms are visibly classified: conflicting NC and all ordinary editable ND selections are restricted rather than quietly treated as cleared; allowed noncommercial results still carry a warning and no legal guarantee. Preview fetches are bounded and missing previews remain explicit; only an owner-selected result is streamed to the project. Results without a specific licence are blocked from download. Every successful download records provider, source page, creator, displayed licence/attribution, media metadata, byte count, resolved URL, SHA-256, and the actual Kdenlive import outcome/bin ID when requested. Bounded live timeline/bin readback removes native session secrets and file paths while giving plans real clip, track, subtitle, effect and bin IDs. Index/provider metadata is evidence, not a legal guarantee. Separately reviewed local kits create title/lower-third/shape/gradient SVGs, two caption families, a colour LUT, native recipe data, instructions and hashes; Kdenlive still performs and previews every title animation, transition, effect, reframe and mix. Because the pinned native protocol exposes neither composition creation nor sequence-subtitle writes, recipe-guided cross-track transitions and native caption-track creation remain visible manual Kdenlive steps and must never be recorded as applied by OddBrain. Source transcript evidence, generated caption style files, reviewed timed title-based burned-in captions, titles/fades/effects/reframes/audio envelopes, media import and exact clip insertion remain available within the protocol’s real commands; native editable/exportable subtitle tracks do not.

Approved public-link acquisition must automatically create the same durable intake as local video before reading begins. Processing/blocked status, source path, hash and receipt survive navigation and restart; an interrupted intake stays blocked until an explicit retry reuses the retained source without another attachment or download. Raw scene/transcript/frame/audio evidence, unconfirmed AI descriptions and confirmed owner notes stay separate but linked to the source hash. The complete local time map uses silence-aware roughly 60-second speech intervals, with a small overlap plus exact sequence deduplication when no suitable pause exists; interval-level pace/RMS/pause measurements with explicit complete/empty/failed diagnostics; a bounded two-frame-per-second scene-change index; and initial retained frame slots distributed across the full duration. The AI first reads that index, may run literal local retrieval, then reads only relevant complete intervals/retained frames and requests more bounded timestamp frame/audio windows when evidence is insufficient. Current broad System.Speech intervals, absent diarization and absent pitch contour must be disclosed rather than relabelled as fine word timing, speaker identity or emotion.

Public video links are inspect-first and limited to supported public YouTube, TikTok, Instagram, or direct-video sources. Social acquisition uses an owner-installed yt-dlp with the owner-reviewed FFmpeg location, no cookies, login automation, playlists, live streams, or access-control bypass. The optional owner-selected maximum is enforced against declared and actual bytes without becoming a universal cap. Useful failed yt-dlp streams remain in deterministic project staging with a recovery record and are reused only after another explicit approval; they are not silently deleted or accepted as finished. Each approved acquisition is one source, gets a URL/hash receipt, and is never interpreted as instruction authority. Provider terms, creator rights, anti-bot behavior, and changed interfaces can still refuse the operation.

Local videos may enter directly from Video Studio without becoming chat attachments; both direct intake and video attachments always pause for visible storage/OCR choices (chat intake may also offer an explicit range). Once the owner chooses use-in-place or private copy, the staged source becomes a durable intake before decoding; a partial chat range cannot be mislabeled as a ready full Video Studio map. Complete selected audio remains in scope. Local processing adds complete interval-level acoustic evidence, timestamped speech when supported, scene-change planning, up to twelve retained adaptive evidence frames for durable Video Studio intake, and question-driven frame/audio retrieval. Short clips scale spacing to retain beginning/middle/end evidence where the approved frame budget permits. A complete fresh frame generation is written and renamed before its evidence index is committed; failed replacement or expansion leaves the prior referenced generation usable. Optional frame OCR reuses the single hash-reviewed DeepSeek-OCR-2 adapter and remains unconfirmed. The current implementation does not claim speaker diarization, emotion/intent detection, every-frame visual understanding, full style replication, or successful live editing when the MCP server lacks a required tool.

## Branching

Every completed AI reply has an inline **Branch** action. A branch is an isolated stored chat through that reply: stored messages and attachment/artifact references are remapped, project/context choices continue, and the active Working Notes—including the retained “What I didn’t approve” difference—are copied into a new notebook revision. The new chat starts a separate native session. OddBrain never claims hidden provider state, thinking, or unrecorded tool context was copied.

## Stop and transcript truth

Stop requests cancellation, then waits for the matching recorded `closed` event. The transcript record is appended before the event reaches the renderer. Until confirmation, the UI says **Stopping…**, blocks new sends and queue draining, and does not mark the turn done. A timeout reports uncertain process exit; it never fabricates success.

Native transcripts are append-only private records. Startup reconciliation copies bounded completed/interrupted turns only into matching existing app chats. Manual transcript restore is owner initiated and copies a complete recorded turn into the recorded chat or an explicitly new chat. It never resumes sessions, tools, approvals, queues, workflows, or schedules.

## Sources and execution

Evidence envelopes state provenance and explicitly deny instruction, permission, and authorization authority. Oversized evidence is refused or offered as complete selectable sections. Project references with invisible or instruction-like text are refused for model context.

Native source-bearing turns require the engine’s Plan mode and run in a fresh isolated process without native resume. Claude Code additionally starts with an empty tool registry, empty MCP configuration, and no filesystem setting sources. Any permission request is refused inside the source-bearing turn, and its temporary native session cannot replace the owner conversation’s resume link. Read approvals are main-process records, visible and revocable. Mentioning a path grants nothing.

## Current owner-facing features

- Native chat through Claude Code or agy, with honest engine/model labels, effort controls, Stop, queue state, permissions, transcripts, and usage when reported. Windows Claude discovery launches real executables rather than arbitrary command scripts; exact `/help`, `/status`, `/doctor`, and `/cost` app controls remain read-only and every other slash command is refused before dispatch. Owner prompts are not subject to the removed arbitrary 20,000-character front-door/queue limit; explicit transport, provider, model-context and resource safeguards remain.
- Separate app chats with revisioned storage, recovery export/import, inline per-reply branches with Working Notes continuity, projects, attachments, exact native turn copies, and vault capture when enabled.
- Main-owned Working Notes with migration, revisions, recovery, model-proposal review, and persistent unapproved differences.
- Vault capture, raw conversations/files, confirmed memory, people, provenance, personal recall, raw-first cited research, source maps, previews, and separate vault backup/restore.
- PC browser companion capture, explicit context insertion, safe typing suggestions, pairing, outbox recovery, and never-Send behavior.
- Artifacts with HTML/SVG versions, isolated previews, exact element rewrite refusal at unsafe limits, restore, duplicate, import/export, PDF, and library recovery.
- Structured inline bar/line/pie charts with an exact data table; visible citations; artifact extraction from completed native replies; varied gerund status wording.
- Ink & Sketchbook, brain personality and wording, appearance customization, projects, previews, exports, editor assistance, recipes, skills, connectors, plugins, reviewed commands, workflows, schedules, checkpoints, and report-only review.
- Monthly/custom interpretation Review with Questions, Conflicts, Connections, Keep-or-Forget, cleanup candidates, immutable run reports, and manual external-AI packets/imports.
- Shared Attachment Center with use-in-place/private-copy identity, deferred selectable sections, durable section jobs/budgets, coverage, safe private-copy deletion previews, and streamed exact turn retention.
- Purpose-limited Folder Access with duration, separate authorities, receipts, metadata-only listing, and revocation.
- Large document selection: complete locally extracted sections and supported page ranges are shown for owner selection; selected sections are attached whole within the prompt limit.
- Complete selected-duration local audio timelines, full audio handling for video, timestamped speech, local scene-change planning, adaptive timestamped evidence frames, and measured acoustic level/dynamics without emotion claims.
- Optional owner-installed, hash-pinned DeepSeek-OCR-2 adapter protocol; no automatic model download, second OCR subsystem, or text-API substitution.
- Kdenlive-only Video Studio with pinned native-protocol identity checks; visible project/revision readback; exact structured plans; validation plus one-step native Apply; Stop/Undo/Redo/history/frame inspection; owner-reviewed short-preview verification and separate complete-evidence inspection/improvement plus portrait-checked vertical-short or current-sequence short/long export through Kdenlive; automatic link-to-evidence intake; durable question-driven video evidence; AI-operated paged review-only library search across no-key Commons image/video/audio plus named providers; selected-only downloads/imports with real bin IDs; expanded local kits; and source/licence/hash receipts.

## Backup and restore domains

Vault backup and app-private backup remain independently usable and verified by size and SHA-256. **Complete Memory Backup** is their coordinator: it records one `Memmory_OB` revision, runs both domains without an interleaving app-data write, hashes both nested manifests, and writes a top-level manifest with explicit external-file handling and exclusions.

The app-private domain includes the `Memmory_OB` catalogue, selected app chats, native transcripts, Working Notes/review differences, Attachment Center private copies and inventory, processing state, artifacts, projects, recipes, handoffs, reviewed command outcomes, checkpoints, review reports, non-secret interface preferences, and non-secret Video Studio paths/settings, evidence index, retained evidence frames, render receipts and the non-secret native-operation recovery journal. It excludes credentials and API keys, extension pairing secrets, Kdenlive bearer tokens, AI-connector capability secrets, read approvals and folder/project grants, engine sessions, installed engines/models, extension packages, caches, workflow signing secrets, schedule/queue attempts, and external files used in place. External sources enter a Complete Memory Backup only where OddBrain already owns an expressly retained private copy; excluded sources require later owner reconnection/re-authorization.

Both backup domains stream and hash complete files in bounded memory and no longer impose the former 2 GiB total ceiling. Manifest/file-count checks, path safety, source stability, and actual storage remain explicit operational limits.

Complete restore validates the top manifest, both nested manifests, and all listed payloads before it creates a destination. It then restores into a new inactive vault/app-data profile and writes `ACTIVATION-REVIEW.json`. It never replaces or activates live data automatically; reviewed activation is a separate owner action.

## Review target

A report-only review is bound to the supplied completed request and supplied completed result. The target is immutable for that review. If the full target exceeds the review limit, review is refused; no shortened target is sent. Review output has no tools and cannot execute fixes.

## Persistence

Owner-data writes use immutable revisions or atomic replacement with a complete prior generation where appropriate. Damaged current bytes are preserved for recovery. A failed save must not be presented as success. Unrecoverable Video Studio settings, evidence indexes, render receipts or native-operation journals are surfaced and lock the affected write/action path instead of silently replacing durable state. Security-sensitive machine-start flags remain fail-closed rather than reviving an older enabled value.

## Release and verification

The automated test, browser-test, media-test, and smoke-test suite was removed on 2026-10-21 because its results were not trusted. Replacement tests must be designed after the connected product is manually confirmed. Pull requests retain Node 24 typechecking, security-policy inspection, desktop/web builds, and release-output inspection on Linux and Windows. Windows installer CI still builds the package, checks Electron fuses and final contents, records the installer hash, produces an SBOM, and attests provenance; it no longer claims that CI launched or behaviorally tested the app. Public tagged releases additionally require valid Authenticode signatures.

A green validation check proves only its narrow type/build/policy/package assertion. It does not prove behavior. Real Windows 11 acceptance and the rebuilt test suite remain required product evidence.
