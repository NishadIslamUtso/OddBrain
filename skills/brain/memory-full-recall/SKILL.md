---
name: memory-full-recall
description: "Use when the owner wants a thorough memory pass before responding — full memory recall, what do I know about X, check everything I have, load all relevant memory, or after a large intake. Runs a bounded comprehensive search across the entire vault and surfaces every relevant record before the agent answers."
version: 1.1.0
author: Hermes Agent + Brain
license: MIT
metadata:
  hermes:
    tags: [memory, brain, recall, search, vault, full-context]
    related_skills: [brain, brain-anonymous-mode]
---

# Full Memory Recall

A deliberate, owner-initiated full search of the Brain vault before responding.
The agent surfaces every relevant record, then answers with full context.

## When to Use

Load this when the task is any of:

- "full memory recall" / "load all my memory" / "check everything you know"
- "what do you know about X" / "recall all about X"
- "before you answer, check my memory" / "search my vault first"
- after a large intake or import — the agent should re-scan before answering
- the owner signals they want context-heavy responses

Do not use this for ordinary conversation. Ordinary conversation uses the
built-in per-turn recall (which is currently disabled — Brain is the sole
memory system). This skill IS the per-turn recall replacement for
context-heavy moments.

## How It Works

1. **Owner triggers the skill** — by asking for full recall, or by the agent
   offering it after a large intake.
2. **Agent searches the vault** using every available axis:
   - Keyword search over titles and bodies
   - Kind filter: search specific folders (memory, knowledge, people, etc.)
   - Status filter: confirmed, active, pending, raw-unconfirmed-evidence
   - Tag search: exact tag matches
3. **Agent surfaces results** in a structured summary:
   - Total records found
   - Most relevant records listed with title, kind, status, path
   - Full text of the top 3-5 most relevant records included inline
4. **Agent answers** with the full context loaded — no "I don't have memory
   of that" unless the vault genuinely has nothing.

## Search Protocol

When this skill is active, the agent MUST:

1. Call `ctx.rest('/records?limit=100')` to get all vault records
   (or use a targeted query if the owner named a specific topic)
2. Read the body of each candidate record
3. Rank by relevance to the owner's question
4. Include the full text of relevant records in the context

### REST path rule

`ctx.rest()` paths are relative to `/api/plugins/brain/`. Do NOT include the `/brain` prefix:

```js
// WRONG
const data = await ctx.rest('/brain/records?limit=100')

// RIGHT
const data = await ctx.rest('/records?limit=100')
```

### Targeted Search

If the owner named a topic (e.g. "what do you know about my project?"):

```
GET /records?q=<topic>&limit=50
```

If the owner wants everything:

```
GET /records?limit=100
```

Filter by kind if relevant:

```
GET /records?kind=knowledge&limit=100
GET /records?kind=people&limit=100
```

### Calling from a skill (no ctx available)

When calling from a skill or tool via HTTP, use the full URL:

```bash
curl -s "http://127.0.0.1:9119/api/plugins/brain/records?q=project&limit=50"
```

## Output Format

The agent's response after full recall should look like:

```
[Full Memory Recall — X records found]

**Most relevant:**
1. <title> (<kind>, <status>) — <path>
   <first 200 chars of body>

2. ...

**Full records loaded:**
<full text of top 3-5 records>

Now, answering your question with full context:
...
```

## Conflict Resolution

- If Brain vault has conflicting records about the same topic, surface both
  with their status (confirmed vs pending vs raw-unconfirmed-evidence)
- Never silently pick one — the owner sees the conflict and decides
- If a record is `raw-unconfirmed-evidence`, label it clearly as unconfirmed

## Hermes Built-in Memory Conflict

Hermes's built-in memory system (`memory_enabled: true`) injects recalled
memory into every session. This conflicts with Brain. When this skill is active,
assume Hermes built-in memory is disabled in config.yaml:

```yaml
memory:
  memory_enabled: false
  user_profile_enabled: false
  nudge_interval: 0
```

If the user asks about "what do you remember" and the vault is empty, the
correct answer is "Brain has no records on that topic" — not "I don't have
memory" (which would imply the Hermes built-in is still active).

## Notes

- This skill is the replacement for Hermes's built-in per-turn memory injection
  (which is disabled in config.yaml)
- The vault is read-only from the frontend — this skill reads via the backend API
- Records marked `raw-unconfirmed-evidence` are included but clearly labeled
- The agent should offer this skill proactively after large intakes (>10 new records)
