# Architecture

## System Overview

Brain is a vault-based memory system for Hermes Desktop. It consists of three
layers:

1. **Desktop Plugin** (`desktop-plugins/brain/plugin.js`) — React UI
2. **Backend API** (`plugins/brain/dashboard/plugin_api.py`) — FastAPI server
3. **Vault** (`~/Documents/Hermes/Memory_OB/`) — Plain markdown files

## Data Flow

```
User / Agent
    │
    ▼
Desktop Plugin (React, /brain route)
    │  ctx.rest() → /api/plugins/brain/...
    ▼
Gateway (FastAPI, port 9119)
    │  forwards to plugin host
    ▼
plugin_api.py (FastAPI router)
    │  reads/writes vault files
    ▼
Vault (markdown + YAML frontmatter)
```

## Vault Structure

```
Memory_OB/
├── .brain/
│   └── index.json          # File list cache, next_id counter
├── .obsidian/              # Obsidian vault config (optional)
├── 00 System/              # System documents, vault rules
├── 01 Inbox/               # Raw intake, unprocessed
├── 02 Sources/             # Original sources (imports, captures)
├── 03 Memory/              # Confirmed memories
├── 04 Working Memory/      # Active WIP, current tasks
├── 05 Knowledge/           # Research, facts, how-tos
├── 06 Review/
│   └── proposals/          # Pending proposals awaiting approval
├── 07 Sharing Receipts/    # What was shared, with whom
├── 08 Journal/             # Build logs, session notes
├── 09 Activity & Undo/     # Actions, retractions, undo history
├── 10 People/              # People, preferences, relationships
└── 90 Archive/             # Retracted/denied records (never deleted)
```

## Record Format

Each record is a markdown file with YAML frontmatter:

```yaml
---
title: "Record title"
kind: memory           # memory | working-memory | knowledge | journal | people | activity | system | inbox | sources | sharing-receipts | review | archive
status: confirmed      # raw-unconfirmed-evidence | pending | confirmed | active | denied | retracted
created: 2026-10-29T22:00:00+06:00
modified: 2026-10-29T22:30:00+06:00
tags: [tag1, tag2]
source: agent          # agent | import | user | browser | android
---

Body text here. Plain markdown.
```

## Backend Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/records` | List records (query: q, kind, status, limit, offset) |
| GET | `/records/{path}` | Get single record by vault path |
| GET | `/health` | Vault stats (total files, brain_path) |
| POST | `/propose` | Create a proposal (writes to 06 Review/proposals/) |
| GET | `/proposals` | List proposals (query: status, limit) |
| POST | `/proposals/{id}/approve` | Approve proposal → move to destination folder |
| POST | `/proposals/{id}/deny` | Deny proposal → move to 90 Archive |
| POST | `/proposals/{id}/modify` | Modify proposal body and re-queue |
| POST | `/records` | Direct write (agent-side, bypasses proposal flow) |

## Plugin Registration

The desktop plugin registers three contribution areas:

- `routes` (`"routes"`) — adds `/brain` route
- `sidebar.nav` (`"sidebar.nav"`) — adds "Brain" row to sidebar
- `palette` (`"palette"`) — adds "Open Brain" command palette entry

All REST calls use `ctx.rest()` which scopes to `/api/plugins/brain/` automatically.

## Skills

| Skill | Trigger | Behavior |
|-------|---------|----------|
| `brain` | propose, search, review, write, capture | Core Brain skill |
| `memory-full-recall` | full recall, check everything, what do you know | Full vault search before answering |
| `anonymous-mode` | anonymous mode, fresh session, forget everything | Toggle anonymous/private mode |

## Conflict Handling

Hermes built-in memory is disabled in `config.yaml`:
- `memory_enabled: false`
- `user_profile_enabled: false`
- `nudge_interval: 0`
- `memory` removed from `cli:` tools

This prevents duplicate memory systems. Brain is the sole memory store.

## Performance

- Vault file list is cached in memory (5-second TTL)
- Cache invalidated on every write (propose, approve, deny, modify, direct write)
- Prevents repeated `rglob("*")` disk scans on every API request
