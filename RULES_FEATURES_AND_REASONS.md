# OddBrain: rules, features, and reasons

Updated: 2026-10-21 (Asia/Dhaka)

This is the current product authority. Code and dated test evidence outrank an old claim. `CONTEXT.md` is an archive pointer, not a second rulebook.

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

## Working Notes

Working Notes are per-chat draft continuity, not confirmed memory, instructions, or permission. They are owned by a revisioned main-process store. Legacy renderer notes migrate without deleting their originals. Every accepted revision remains recoverable.

A model may propose a visible Working Notes update. Nothing is saved until the owner reviews it. The exact proposal remains separate from the approved result. Removed or rejected proposal items are retained under **What I didn’t approve**. Recovery export/import is separate from chat and vault recovery.

## Stop and transcript truth

Stop requests cancellation, then waits for the matching recorded `closed` event. The transcript record is appended before the event reaches the renderer. Until confirmation, the UI says **Stopping…**, blocks new sends and queue draining, and does not mark the turn done. A timeout reports uncertain process exit; it never fabricates success.

Native transcripts are append-only private records. Startup reconciliation copies bounded completed/interrupted turns only into matching existing app chats. Manual transcript restore is owner initiated and copies a complete recorded turn into the recorded chat or an explicitly new chat. It never resumes sessions, tools, approvals, queues, workflows, or schedules.

## Sources and execution

Evidence envelopes state provenance and explicitly deny instruction, permission, and authorization authority. Oversized evidence is refused or offered as complete selectable sections. Project references with invisible or instruction-like text are refused for model context.

Native source-bearing turns require the engine’s Plan mode and run in a fresh isolated process without native resume. Claude Code additionally starts with an empty tool registry, empty MCP configuration, and no filesystem setting sources. Any permission request is refused inside the source-bearing turn, and its temporary native session cannot replace the owner conversation’s resume link. Read approvals are main-process records, visible and revocable. Mentioning a path grants nothing.

## Current owner-facing features

- Native chat through Claude Code or agy, with honest engine/model labels, effort controls, Stop, queue state, permissions, transcripts, and usage when reported.
- Separate app chats with revisioned storage, recovery export/import, branches, projects, attachments, exact native turn copies, and vault capture when enabled.
- Main-owned Working Notes with migration, revisions, recovery, model-proposal review, and persistent unapproved differences.
- Vault capture, raw conversations/files, confirmed memory, people, provenance, personal recall, raw-first cited research, source maps, previews, and separate vault backup/restore.
- PC browser companion capture, explicit context insertion, safe typing suggestions, pairing, outbox recovery, and never-Send behavior.
- Artifacts with HTML/SVG versions, isolated previews, exact element rewrite refusal at unsafe limits, restore, duplicate, import/export, PDF, and library recovery.
- Structured inline bar/line/pie charts with an exact data table; visible citations; artifact extraction from completed native replies; varied gerund status wording.
- Ink & Sketchbook, brain personality and wording, appearance customization, projects, previews, exports, editor assistance, recipes, skills, connectors, plugins, reviewed commands, workflows, schedules, checkpoints, and report-only review.
- Large document selection: complete locally extracted sections are shown for owner selection; selected sections are attached whole within the prompt limit.

## Backup and restore domains

Vault backup and app-private backup are separate and verified by size and SHA-256.

The app-private backup includes selected app chats, native transcripts, Working Notes/review differences, artifacts, projects, recipes, handoffs, reviewed command outcomes, checkpoints, review reports, and non-secret interface preferences. It excludes credentials and API keys, extension pairing secrets, read approvals and project grants, engine sessions, installed engines/models, extension packages, caches, workflow signing secrets, schedule/queue attempts, and unselected external files.

Restore always creates and verifies a new folder. It never replaces the live vault or live app data automatically.

## Review target

A report-only review is bound to the supplied completed request and supplied completed result. The target is immutable for that review. If the full target exceeds the review limit, review is refused; no shortened target is sent. Review output has no tools and cannot execute fixes.

## Persistence

Owner-data writes use immutable revisions or atomic replacement with a complete prior generation where appropriate. Damaged current bytes are preserved for recovery. A failed save must not be presented as success. Security-sensitive machine-start flags remain fail-closed rather than reviving an older enabled value.

## Release and verification

Pull requests run Node 24 typechecking, security policy checks, tests, builds, browser coverage policy, and native smoke checks on Linux and Windows. Windows installer CI builds and launches the packaged executable, checks Electron fuses and final contents, records hashes for the executable, app archive, and smoke screenshot, produces an SBOM, and attests provenance. Public tagged releases additionally require valid Authenticode signatures.

A green check proves only its assertions. Real Windows 11 acceptance remains the final product evidence.
