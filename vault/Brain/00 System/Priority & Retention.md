# Priority & Retention

How vault decides what connects, what surfaces, what expires, what stays long-term.

## 1. Connections build over time

Empty at start by design. Not pre-made.

Flow: Extension captures -> 01 Inbox/ -> 02 Sources/ (originals) -> 03 Memory/ (derived) -> 04 Working Memory/ (NOW view)

On new source in 02 Sources/:
1. Search 03 Memory/Entities/ via .brain/index.sqlite (full-text + semantic, rebuildable)
2. If related entity found -> add claim with source: [[source-id]], related: [[other-entity]], create file in 03 Memory/Connections/ with evidence + dates
3. If no match and topic is meaningful (repeated, emphasized, consequential, action-bearing, personally important, has open task) -> create new entity from Templates/Entity.md
4. If trivial one-off -> stays in source transcript only

Link does not imply causation. Every link needs source + dates + evidence label. See Memory Schema.

## 2. Search

App never loads whole vault.

1. Search .brain/index.sqlite - exact + semantic
2. Follow only few relevant links via related: field
3. Rank by: relevance to query, current validity (time_valid_from/to, status), importance (pinned/high/normal/low), recency (captured_at, occurred_at)
4. Include source links + label user-stated / observed-pattern / hypothesis
5. Omit unrelated, expired, unavailable
6. Keep current-chat separate from long-term

Result -> 04 Working Memory/Current Snapshot.md + Capsule library + inline suggestions (Quillbot style).

## 3. Priority

In every claim frontmatter:

- importance: pinned > high > normal > low
- confidence: high | normal | low
- status: confirmed > candidate, current > expired/superseded

Ranking: relevance first, then pinned/high, then confirmed + current, then recent. You can pin any entity/claim to always surface when relevant.

Current Snapshot.md is short-lived, timestamped, expires. Not infinite prompt.

## 4. Raw data dump

Default policy: check everything by default (all sites + all AIs). If inaccessible -> log "wasn't accessible - reason" in 09 Activity & Undo/ + 01 Inbox/Processing Errors/, no popup.

- Raw lands in 02 Sources/ only - Conversations/<provider>/<year>/, Browser Activity/<year>/<month>.jsonl, Web Pages/, Laptop Files/ (pointer, original stays in place)
- Deduplication: same conversation ID not duplicated, edits kept as versions
- No whole-disk copy, no passwords/cookies/tokens/payment/unsent drafts/keystrokes

03 Memory/ is curated, source-linked claims, not dump.

## 5. Temp data

Use retention + time fields:

- retention: current - temporary state (fever today, current routine)
- retention: time-limited + time_valid_to: 2026-10-15 - auto expires after date
- retention: keep-until-user-deletes - long-term

On expiry: status: expired, removed from Current Snapshot, but history + source preserved in 03 Memory/. Not deleted.

Four distinct actions:
- Archive: remove derived note from active view, keep searchable
- Expire currentness: stop treating as current, keep history
- Forget derived: remove from retrieval/index, keep original source
- Delete source: separate confirmation, deletes transcript + attachments/index

## 6. Worth keeping long-term?

Auto long-term if:
- Explicit "remember this"
- Repeated attention, time investment, consequences
- Personally important, action-bearing (decision, goal, routine, task, preference)
- user-confirmed
- importance: high/pinned or retention: keep-until-user-deletes

Short-term / ask you if:
- One-off trivial -> stays in source only
- Uncertain meaning, important inferred relationship, same-time conflict, high-impact ambiguity -> goes to 06 Review/Questions.md / Conflicts.md / Keep-or-Forget.md
- status: candidate, evidence: hypothesis

Never auto-delete because old or rarely retrieved. Cleanup shows counts/sizes/reasons/links in 06 Review/Cleanup.md, you decide in batches. Monthly audit is user-triggered dry-run only, last 60 days + linked older, applies nothing until approval.

Low access frequency alone != reason to delete.
