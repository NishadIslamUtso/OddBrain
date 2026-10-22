# OddBrain future plan

Updated: 2026-10-22 (Asia/Dhaka)

This file lists unfinished work and validation, not standing permission. Each future item needs a reviewed design, explicit owner approval when it changes useful behavior, manual confirmation, replacement tests designed from confirmed behavior, and Windows 11 evidence.

## Implemented foundation to preserve

`Memmory_OB` version 1 now provides the strict shared schema, durable catalogue, and synchronization for chats, Projects, Working Notes, Attachment Center, processing Jobs, and reviewed memory. Intake covers chat-linked and archive-only transcript headers, imported turns, Branch links, model/native context receipts, raw browser/import review sources, People, and pending/rejected/confirmed interpretations with preserved correction revisions. Typed Project/transcript/Working Notes/attachment/Branch/receipt links, a narrow desktop bridge, exact Project search, bounded same-Project native raw-chat recall, recoverable app-chat/Project/engine-note Trash, and backup inclusion are connected. The dependency-free `@oddbrain/memmory-ob@1.0.0` source package lives in `packages/Memmory_OB`, and builds emit a hash-bound standalone core package plus a read-only stdio MCP adapter. **Settings → Connectors → Goose · Memmory_OB** installs that adapter into a chosen existing Goose `config.yaml` after an exact byte-preserving owner review; its four tools expose status, bounded exact confirmed-memory/raw-chat search, Project counts, and SHA-256 evidence verification that refuses changed sources, with no writer, confirmation, deletion, permission or Send tool. Complete Memory Backup now coordinates the existing vault and app-data engines under one revision/top-level manifest, records external-file exclusions, verifies every listed payload before restore, and creates only an inactive new profile with a separate activation-review receipt. These are pre-release capabilities requiring Windows acceptance; they are no longer future-plan-only items.

## Next validation

1. Keep the passing local Node 24 typecheck, desktop/web builds, security policy, high-severity dependency audit and release-output inspection green; complete Windows packaging/fuse/installer checks in CI and repeat them for release.
2. Manually confirm the connected product on the owner’s Windows 11 machine at 125% display scaling, including startup while the preferred local app port is occupied and browser-extension pairing against the shared preload API. Do not treat CI builds or static checks as behavioral evidence.
3. After that confirmation, design a new automated test suite from the observed contracts; do not restore the removed faulty tests by default.
4. Exercise real signed-in Claude Code and agy flows, including current native Windows Claude discovery, the four safe app slash controls, prompts beyond the former 20,000-character refusal, Stop during tools, uncertain termination, app restart recovery, and real provider context overflow.
5. Exercise multi-gigabyte use-in-place/private-copy sources, complete selected document transport near its explicit safety boundary, PDF page ranges, exact streamed turn retention, large backup verification including Video Studio evidence/receipts, separate restore folders, and manual transcript restore with disposable owner data copies.
6. Benchmark complete-duration audio/video processing, silence-aware/overlapped transcript seams, very-short and long full-duration adaptive frame distribution, crash/failure preservation between evidence generations, scene-change selection, and successful-versus-empty-versus-failed RMS/pause/scene diagnostics on Windows 11 with the owner-selected FFmpeg 7.x and recognition languages. Test the optional owner-installed DeepSeek-OCR-2 adapter only on reviewed compatible hardware; accuracy and GPU compatibility remain external gates.
7. Build and audit the separately installed native Kdenlive MCP reference `b9a1a6ce0612d9bb6be2b7df2473c2ffbe71e798` on Windows 11, configure its required bearer token on loopback port 8766, then exercise a real project end to end: capability-protected AI connector/Skill deployment with exact full-path handshake and an existing-Skill replacement review, approved/resumable link → evidence map with selected FFmpeg and optional size maximum, NC/ND and Openverse-duration handling, selective transcript and question-driven frame/audio retrieval, AI library ranking, opaque project handle plus full owner-visible plan JSON, revision/session/token conflict, native validation/batch, forced-exit durable request-ID recovery, operation timeouts, Stop uncertainty, strict Undo/Redo/Save Version/profile identity checks, 1080×1920 plus simple reframe checkpoints, required-versus-silent audio and bounded WAV preview inspection, improvement plan, render, verification, restart recovery and packaged-app behavior. Protocol compatibility in OddBrain is implemented; source/build provenance and owner-machine outcomes are not yet proven.
8. Exercise monthly/custom Review, manual consumer-AI handoff/import, folder expiry/revocation receipts, safe private-copy deletion previews, and inline branch continuity with real stored attachments and Working Notes.
9. Measure startup and route chunk loading on the target machine. Keep lazy boundaries only where measured startup or memory improves without making navigation feel delayed.
10. On Windows 11, install the Goose `Memmory_OB` adapter and `memmory-ob-memory` skill through the reviewed connector flow, verify its four read-only tools (`memmory_ob_status`, `memmory_ob_search`, `memmory_ob_project`, `memmory_ob_evidence`) and the skill's evidence rules in a real Goose session with the owner’s Ollama Cloud setup, and measure recall parity against Goose Memory and Chat Recall before disabling either. Re-run the confirmed/pending/rejected/changed-source/excluded-source/restart trap tests in that real session. Confirm Goose CLI-provider mode is not used for extension-dependent memory.

## Later desktop work

- Finish the separately downloadable `Memmory_OB` LEGO boundary with a reviewed standalone publication flow; the dependency-free source package, hash-bound build output, and standalone Goose MCP bundle now exist. Preserve project IDs, chats, instructions, goals, optional folders, selected references, outputs, session/context/rule controls, and the current source-linked shared Project recall without merging transcripts, Working Notes, native resume IDs, attachment permissions, or provider histories. Activation must remain smooth inside the existing OddBrain shell without a second frontend or authority.
- Finish mobile and Goose-store intake adapters and the remaining import adapters; extend current Working Notes/Attachment Center intake with Project identity where the source actually carries it. Chat-linked and archive-only transcript headers, imported turns, and browser/import review sources are already catalogued; protected app-private storage remains a physical security boundary, not exclusion from memory, search, Project sharing, lifecycle, provenance, or Complete Memory Backup.
- Exercise Complete Memory Backup with disposable large Windows data, add dependency/tombstone impact reports where needed, and build the separate owner-reviewed activation path. Preserve the existing cross-domain revision manifest, hashes, explicit external/use-in-place omissions, verify-first inactive restore, and narrow independent backup tools.
- Complete and verify the guarded browser scan-to-context path: use permitted visible page/conversation material as untrusted local retrieval input for relevant context/capsule/entity suggestions; consistently exclude hidden/private/editable content, quarantine instruction-like or invisible-text hazards, explain matches, enforce sensitivity/`Never Send` scope, preview every insertion/share, and never let page text grant tools, permissions, broader retrieval, or Send.
- Scalable local indexing that preserves the raw/unconfirmed/confirmed/Working Notes boundaries and exact provenance.
- Meaning-based (semantic) recall as a separately downloadable `Memmory_OB` search adapter beside the current exact word-match search — owner decision 2026-10-22: keep on the list. It may only help find candidates using a reviewed free component (for example the owner's free Ollama Cloud allowance if it offers embeddings); every quoted answer must still pass the hash-verified evidence tool, and word-match search, authority labels and "not found over guessing" stay unchanged.
- Raw-chat Never-Send/sensitivity gate for the read-only Goose adapter before cloud-model use (judge finding 2026-10-22): confirmed memory already refuses privacy-excluded sources, but active app chats are still returned without a per-chat Never Send check and are catalogued `neverSend: false`. Add an owner-controlled per-chat gate the adapter obeys at read time, or restrict memory search to trusted/local models until then.
- Richer side-by-side conflict comparison after the current evidence-backed conflict queue has real owner-use evidence.
- Owner-reviewed activation tooling for a verified app-data restore folder. Current backups/restores preserve data in a separate folder; they must never activate credentials, grants, sessions, hooks, schedules, or queues implicitly.
- Optional export/pagination improvements for very large previews and histories where current refusal or page sizes are inconvenient.
- More document section labels for spreadsheets, slides, headings, and page ranges, without partial-text claims.
- Additional accessibility and keyboard testing for charts, citations, document selection, recovery, review history, and Video Studio approval flows.
- Broader native Kdenlive recipe coverage only when the pinned server adds documented batch commands (for example, a dedicated subtitle command). Existing exact cuts, placement, titles, effects, reframing, ducking, history and preview paths must not be replaced with guessed arguments or a second timeline engine.
- Word-level local timing, pitch/prosody contours and speaker separation where a reviewed free local recognizer truly supports them. Current question-driven frames/audio, pause/pace/dynamics evidence and unconfirmed visual notes must remain honest and source-linked; never infer emotion or identity from weak signals.
- More local design-kit families and named free catalogue providers after licence, availability, pagination, API-limit and Windows-runtime review. Do not copy proprietary catalogues or move curation back onto the owner.
- A native OddBrain dock only if a separately maintained Kdenlive GPL integration exposes a stable, auditable panel API. The current loopback MCP connection does not pretend to embed UI into stock Kdenlive.
- Authenticode publisher setup and release rehearsal. No public installer is eligible without a valid trusted signature.
- Performance work only after profiling. Do not add speculative caches, background services, or dependencies.

## Separate mobile direction

A mobile app remains separate from the PC browser extension and desktop app.

- Direct same-Wi-Fi connection first.
- Bluetooth fallback when practical.
- Delayed sync when the PC is unavailable.
- No permanent cloud relay.
- Efficient battery, storage, and network use.
- Explicit pairing, visible pending sync, conflict review, and no silent permission or retrieval expansion.

This direction is approved for planning, not implementation in the current desktop repository batch.

## Explicit non-goals

- No VS Code extension.
- No account-wide ChatGPT or Claude archive import.
- No permanent cloud relay.
- No telemetry.
- No automatic third-party-site tool execution.
- No silent provider/model substitution.
- No background replay of recovered queue, workflow, schedule, or transcript work.
- No automatic merge of raw evidence, AI interpretation, confirmed memory, and Working Notes.

## Decision checklist for any future feature

Before implementation, answer:

1. What owner problem does it solve?
2. What exact data enters, leaves, changes, or persists?
3. Which process owns the state and what is the recovery path?
4. What permissions can it use, and how are they reviewed and revoked?
5. What happens on cancellation, crash, duplicate input, conflict, partial success, and restart?
6. Does it preserve convenience, continuity, recovery, performance, security, and future usefulness?
7. What useful current behavior could be lost?
8. What is the smallest complete implementation and its Windows 11 acceptance evidence?
