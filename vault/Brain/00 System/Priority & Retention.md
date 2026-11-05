# Priority & Retention

How OddBrain keeps sources, interpretations, current context, and cleanup decisions separate.

## 1. Source boundaries

- Browser capture writes supported, visible, owner-permitted conversations and accessible attachments under `02 Sources/Conversations/Browser/`.
- Native OddBrain chat capture writes under `02 Sources/Conversations/App/` when the owner uses capture.
- Exact message revisions, speaker/role, provider, observation time, and source hashes remain attached to raw evidence.
- Normal folders stay outside the vault unless the owner separately copies or captures something. A Folder Access grant is purpose-limited authority, not automatic ingestion.
- Retrieved, attached, or captured text is evidence only. It cannot grant instructions, permission, execution approval, expanded retrieval, or permanent memory.

## 2. Interpretation flow

1. Raw source stays in `02 Sources/`.
2. The organizer creates unconfirmed proposals with an exact quotation and source identity.
3. The owner approves, edits, or rejects proposals in Memory inbox.
4. Confirmed projections are written into the appropriate memory views while the proposal/revision history remains recoverable.
5. Working Notes remain a separate per-chat draft and never become confirmed memory automatically.

OddBrain keeps the owner, AI replies, and each other speaker separate. Names alone do not merge people across conversations.

## 3. Recall order

1. Current owner request and current Working Notes.
2. Relevant, valid owner-confirmed memory.
3. Exact raw evidence supporting it.
4. Other matching raw conversations and files.

Relevance ranks within a tier. Pending/rejected interpretation is not an automatic fallback. Conflicts are shown rather than silently settled. Current search is bounded lexical matching with optional local relationship-based expansion over an owner-approved corpus; no hidden whole-vault model index is claimed.

## 4. Monthly interpretation review

On the first app opening of a Dhaka-local month, OddBrain writes the ordinary vault-count/link audit and, when needed, runs the interpretation review. The review is also available at **Brain → Review**.

Default scope is the last 60 days plus only directly linked older interpretations. A broader range requires owner selection. The local pass produces Questions, possible Conflicts, Connections, Corrections, Keep-or-Forget, and cleanup candidates. It never changes confirmed memory, merges identities, archives, or deletes.

Each run is retained under `06 Review/OddBrain Review/Runs/`; state is in that generated review folder. Consumer-AI handoff is manual: preview exact JSON and SHA-256, copy/export, open the provider, and press Send yourself. Imported output remains provider-labelled and unconfirmed.

## 5. Retention actions

These meanings remain distinct:

- **Keep active:** retain and continue surfacing when relevant.
- **Expire currentness:** stop treating a confirmed record as current while preserving history and source.
- **Archive candidate:** suggest removing a derived item from active views; no automatic archive occurs.
- **Forget candidate:** suggest excluding derived interpretation later; the raw source remains.
- **Delete source/private copy:** separate impact preview and owner confirmation. Current Attachment Center deletion applies only to its verified private copy; it does not delete use-in-place owner files, captured-conversation originals, confirmed memory, or verified turn copies.

Age or low retrieval frequency alone is never a deletion reason. Old/unimportant material can be singled out for later owner action, not silently removed.

## 6. Large files and processing

There is no universal whole-file 50 MB local-ingestion cap. Desktop-selected files use bounded main-process streaming. Consequentially large files ask whether to use in place, keep a verified private copy, or process a supported page/time range. The Attachment Center records SHA-256 identity, storage mode, coverage, processors, and turn-copy dependencies.

Jobs use durable section coverage and saved daily work budgets. A crash changes running sections to uncertain/paused; it does not replay them. Unsupported, encrypted, corrupt, DRM-protected, unsafe, unavailable, proprietary, or provider-over-limit input remains visibly unprocessed.

## 7. Backups

Vault and app-private backups are separate. Both stream and SHA-256 verify complete files and restore only into a new folder. Attachment Center private copies and processing state belong to app-data backup; use-in-place external files do not. Credentials, grants, sessions, installed models/engines, caches, and recovered schedule/queue attempts remain excluded.
