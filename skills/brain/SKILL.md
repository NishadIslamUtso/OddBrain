---
name: brain
description: Use Brain (Memory_OB) for memory operations: propose, search, review, and direct write. The vault lives at C:\Users\Nishad Islam Utso\Documents\Hermes\Memory_OB. Everything starts as a proposal — nothing is confirmed without user approval in the Review screen.
metadata:
  author: Hermes Agent
  version: 0.1.0
  related_skills:
    - brain-memory-full-recall
    - brain-anonymous-mode
---

# Brain — Memory_OB Skill

## When to use this skill

Use Brain when you need to:
- **Propose a memory** — the user said something worth remembering. Propose it; they approve in Review.
- **Search the vault** — the user asks about something you might have stored.
- **Review pending proposals** — the user wants to see what's waiting for approval.
- **Write a working note** — jot something down for ongoing work (no proposal needed).
- **Capture a session** — save a conversation summary directly.

## The rule

> Everything starts as raw unconfirmed evidence. Nothing is confirmed without user approval.

When you propose a memory, it lands in the Review screen as pending. The user approves or denies it there. Never tell the user you "remembered" something until they've approved it.

## Backend base URL

All Brain routes live under the plugin's namespace:

```
http://127.0.0.1:9119/api/plugins/brain/
```

(9119 is the Hermes gateway port on this machine. Adjust if the user's gateway runs elsewhere.)

If `sdk.ctx.rest` is available in your runtime, use it — it handles the path prefix automatically:

```js
const res = await sdk.ctx.rest('/brain/proposals')
```

When calling from a skill/tool via HTTP, use the full URL:

```bash
curl -s http://127.0.0.1:9119/api/plugins/brain/proposals
```

## Operations

### 1. Propose a memory (goes to Review screen)

**When:** The user said something personal, made a decision, expressed a preference, or you think this is worth remembering.

**How:**

```bash
curl -s -X POST http://127.0.0.1:9119/api/plugins/brain/propose \
  -H "Content-Type: application/json" \
  -d '{
    "title": "User prefers dark mode with gold accent",
    "body": "User explicitly said they want the dark/gold theme as their default appearance.",
    "kind": "memory",
    "destination": "03 Memory",
    "source": "chat",
    "tags": ["preferences", "appearance"]
  }'
```

**Response:** The created proposal object, including `proposal_id` and `status: "pending"`.

Tell the user: *"I proposed that to your Brain. Open the Review screen to approve it."*

### 2. List pending proposals

**When:** The user asks "what's pending?" or opens the Review screen.

```bash
curl -s "http://127.0.0.1:9119/api/plugins/brain/proposals?status=pending&limit=50"
```

### 3. Approve a proposal

**When:** The user explicitly approves something in the Review screen.

```bash
curl -s -X POST http://127.0.0.1:9119/api/plugins/brain/proposals/0001/approve
```

The proposal moves to its destination folder (default `03 Memory`) with `status: confirmed`.

### 4. Deny a proposal

**When:** The user explicitly denies something.

```bash
curl -s -X POST http://127.0.0.1:9119/api/plugins/brain/proposals/0001/deny \
  -H "Content-Type: application/json" \
  -d '{"reason": "not relevant"}'
```

The proposal moves to `90 Archive` with `status: denied`.

### 5. Search the vault

**When:** The user asks about something you might have stored, or you need context.

```bash
curl -s "http://127.0.0.1:9119/api/plugins/brain/records?q=preference&limit=20"
```

Add `&kind=memory` or `&status=confirmed` to filter.

### 6. Write a working note directly (no proposal)

**When:** You need to jot something for ongoing work. The user doesn't need to approve every scratch note.

```bash
curl -s -X POST http://127.0.0.1:9119/api/plugins/brain/records \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "working-note",
    "title": "Current project status",
    "body": "Working on Brain plugin step 2. Backend done, desktop plugin in progress.",
    "source": "agent"
  }'
```

This writes directly to `04 Working Memory` with `status: confirmed`. No proposal step.

### 7. Capture a session summary

```bash
curl -s -X POST http://127.0.0.1:9119/api/plugins/brain/records \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "memory",
    "title": "Session 2026-10-27 — Brain plugin built",
    "body": "Built the Brain desktop plugin and Python backend. User approved the design.",
    "source": "session-capture"
  }'
```

## Record kinds

| Kind | Folder | When to use |
|---|---|---|
| `memory` | 03 Memory | Confirmed facts, preferences, decisions |
| `journal` | 08 Journal | Dated personal notes |
| `working-note` | 04 Working Memory | Scratch notes, ongoing work |
| `knowledge` | 05 Knowledge | Reusable synthesis, linked to sources |
| `source` | 02 Sources | Raw capture — written once, never edited |
| `people` | 10 People | One file per person |
| `system` | 00 System | System docs |
| `inbox` | 01 Inbox | Intake needing attention |
| `review` | 06 Review | Questions, conflicts |

## Frontmatter format

Every record is a markdown file with YAML frontmatter:

```yaml
---
type: memory
status: confirmed
title: User prefers dark mode
created: 2026-10-27T10:00:00+0600
modified: 2026-10-27T10:00:00+0600
tags: [preferences, appearance]
source: chat
---
User prefers dark mode with gold accent colors.
```

Proposals add `proposal_id` and `destination`:

```yaml
---
type: proposal
status: pending
title: User prefers dark mode
proposal_id: 0001
destination: 03 Memory
created: 2026-10-27T10:00:00+0600
modified: 2026-10-27T10:00:00+0600
---
User prefers dark mode with gold accent colors.
```

## Vault path

```
C:\Users\Nishad Islam Utso\Documents\Hermes\Memory_OB\
├── .brain\index.json          ← next_id counter
├── 00 System\
├── 01 Inbox\
├── 02 Sources\
├── 03 Memory\                 ← confirmed memories land here
├── 04 Working Memory\         ← working notes
├── 05 Knowledge\
├── 06 Review\proposals\       ← pending proposals
├── 07 Sharing Receipts\
├── 08 Journal\
├── 09 Activity & Undo\
├── 10 People\
└── 90 Archive\                ← denied proposals land here
```

## Privacy note

No proposal is ever confirmed without the user's explicit approval. When you propose a memory, the proposal file is created in `06 Review/proposals/` with `status: pending`. It stays there until the user clicks Approve or Deny in the Brain → Review screen. Nothing you propose silently becomes a fact.


## Related Skills

- **memory-full-recall** — Full vault search before answering. Use when the owner wants context-heavy responses or says "full memory recall".
- **anonymous-mode** — Toggle anonymous/private sessions. No memory, no personalization, like a fresh install. Re-prompt to restore.
