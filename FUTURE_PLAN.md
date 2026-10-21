# OddBrain future plan

Updated: 2026-10-21 (Asia/Dhaka)

Nothing here is a current capability or standing permission. Each item needs a reviewed design, explicit owner approval when it changes a useful behavior, tests, and Windows 11 evidence.

## Next validation

1. Run the full Node 24 test suite, typecheck, desktop/web builds, security checks, and native smoke.
2. Review Windows CI evidence and test the packaged build on the owner’s Windows 11 machine at 125% display scaling.
3. Exercise real signed-in Claude Code and agy flows, Stop during tools, uncertain termination, app restart recovery, and provider context overflow.
4. Exercise multi-gigabyte use-in-place/private-copy sources, PDF page ranges, exact streamed turn retention, large backup verification, separate restore folders, and manual transcript restore with disposable owner data copies.
5. Benchmark complete-duration audio/video processing and acoustic measurements on Windows 11 with installed FFmpeg and recognition languages. Test the optional owner-installed DeepSeek-OCR-2 adapter only on reviewed compatible hardware; accuracy and GPU compatibility remain external gates.
6. Exercise monthly/custom Review, manual consumer-AI handoff/import, folder expiry/revocation receipts, safe private-copy deletion previews, and inline branch continuity with real stored attachments and Working Notes.
7. Measure startup and route chunk loading on the target machine. Keep lazy boundaries only where measured startup or memory improves without making navigation feel delayed.

## Later desktop work

- Scalable local indexing that preserves the raw/unconfirmed/confirmed/Working Notes boundaries and exact provenance.
- Richer side-by-side conflict comparison after the current evidence-backed conflict queue has real owner-use evidence.
- Owner-reviewed activation tooling for a verified app-data restore folder. Current backups/restores preserve data in a separate folder; they must never activate credentials, grants, sessions, hooks, schedules, or queues implicitly.
- Optional export/pagination improvements for very large previews and histories where current refusal or page sizes are inconvenient.
- More document section labels for spreadsheets, slides, headings, and page ranges, without partial-text claims.
- Additional accessibility and keyboard testing for charts, citations, document selection, recovery, and review history.
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
