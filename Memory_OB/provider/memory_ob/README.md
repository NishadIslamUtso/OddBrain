# Memory_OB provider

The pipe between Hermes and the Memory_OB engine. Hermes calls the
`MemoryProvider` hooks every turn; this plugin translates them into the
engine's own store calls. It never reimplements a law.

Install: `host/install.py` copies this directory to
`$HERMES_HOME/plugins/memory_ob/`. Activate:

```bash
hermes config set memory.provider memory_ob
```

## Hooks

| Hook | What it does |
|---|---|
| `prefetch(query)` | Recall before a turn: confirmed records first, candidate facts labelled UNVERIFIED, `neverSend` records never leave the store. |
| `sync_turn(...)` | After a turn, extract candidate facts in the background (non-blocking). |
| `on_pre_compress(messages)` | Captures what compression is about to discard and returns a short digest for the summary prompt. |
| `on_session_end(messages)` | Same capture at a real session boundary. |

## Tools

| Tool | Use |
|---|---|
| `memory_ob_search` | Search the vault — the agent's own recall. |
| `memory_ob_capture` | Capture text as candidate facts (queued, non-blocking). |
| `memory_ob_review` | List pending Review cards, or mark one `later`. The agent never confirms or denies. |
| `memory_ob_stats` | Health: counts by status, trust distribution, pending cards. |

## Locating the engine

`MEMORY_OB_HOME`, then `~/Documents/Hermes/Workspace/Memory_OB`, then
`~/Documents/Hermes/Memory_OB`. `is_available()` reports whether one was found;
when none is, Hermes says so once instead of silently running without memory.

## Config (`memory.memory_ob`)

| Key | Default | Meaning |
|---|---|---|
| `auto_extract` | `true` | Capture turns and pre-compression context automatically. |
