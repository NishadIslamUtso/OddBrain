---
name: brain
description: "Use Brain (Memory_OB) for memory operations: propose, search, review, and direct write. The vault lives at C:\\Users\\Nishad Islam Utso\\Documents\\Hermes\\Memory_OB. Everything starts as a proposal — nothing is confirmed without user approval in the Review screen."
metadata:
  author: Hermes Agent
  version: 0.2.0
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
- **Build or debug the plugin** — install, configure, or fix the Brain desktop plugin.

## The rule

> Everything starts as raw unconfirmed evidence. Nothing is confirmed without user approval.

When you propose a memory, it lands in the Review screen as pending. The user approves or denies it there. Never tell the user you "remembered" something until they've approved it.

## Plugin SDK rules (desktop-plugins/brain/plugin.js)

These are hard-won from this user's Hermes install. They apply to every plugin edit.

### ctx is passed into register(), not exported from the SDK

`sdk.ctx` does not exist. The `PluginContext` is the first argument to `register()`:

```js
export default {
  id: 'brain',
  register(ctx) {
    // ctx has .rest(), .pet, .runAction(), .setInterval(), .onDispose()
  }
}
```

### React components outside register() must receive ctx as a prop

Components defined at module scope cannot see `ctx`. Pass it through props:

```js
function VaultPage({ ctx }) {
  const data = await ctx.rest('/records?limit=100')
  // ...
}

// In register():
render: () => jsx(VaultPage, { ctx })
```

### ctx.rest() returns parsed JSON, not a Response

`ctx.rest('/path')` resolves to the parsed JSON body directly. There is no `.ok`, `.text()`, or `.json()`:

```js
// WRONG
const res = await ctx.rest('/records')
if (!res.ok) throw new Error(await res.text())
const data = await res.json()

// RIGHT
const data = await ctx.rest('/records?limit=100')
```

### REST paths are relative to /api/plugins/<id>/

The SDK adds the namespace automatically. Do NOT include the `/brain` prefix:

```js
// WRONG — becomes /api/plugins/brain/brain/records
const data = await ctx.rest('/brain/records')

// RIGHT — becomes /api/plugins/brain/records
const data = await ctx.rest('/records')
```

### SDK area constants may not be exported

`sdk.ROUTES_AREA`, `sdk.SIDEBAR_NAV_AREA`, `sdk.PALETTE_AREA` are defined in the SDK source but may not be available in all versions. Hardcode them:

```js
const ROUTES = 'routes'
const NAV = 'sidebar.nav'
const PALETTE = 'palette'
```

### Navigation uses ctx.runAction, not sdk.host.navigate

`sdk.host.navigate` does not exist. Use `ctx.runAction`:

```js
// WRONG
sdk.host.navigate('/brain')

// RIGHT
ctx.runAction('view.navigate', { path: '/brain' })
```

### ALL page components must receive ctx as a prop

`BrainPage`, `VaultPage`, `ReviewPage`, and any future page must all accept `{ ctx }`.
Forgetting `BrainPage({ ctx })` causes `ReferenceError: ctx is not defined` at the
module-level component — the plugin loads, the route renders, but the page crashes
immediately. The error appears as `plugin:brain:brain:brain failed to render` in
the desktop app.

```js
// Every page component must destructure ctx
function BrainPage({ ctx }) { /* ... */ }
function VaultPage({ ctx }) { /* ... */ }
function ReviewPage({ ctx }) { /* ... */ }

// In register():
render: () => jsx(BrainPage, { ctx })
```

### Pet notifications

Use `ctx.pet.say()` for non-blocking user notifications. It returns a disposer:

```js
const clear = ctx.pet.say('Brain: 3 proposals awaiting review', { ttlMs: 8000 })
setTimeout(clear, 8000)
```

### Periodic checks

Use `ctx.setInterval()` for polling. Dispose on unload:

```js
const disposer = ctx.setInterval(async () => {
  const proposals = await ctx.rest('/proposals?status=pending&limit=5')
  // ...
}, 30000)
ctx.onDispose(disposer)
```

## Backend base URL

All Brain routes live under the plugin's namespace:

```
http://127.0.0.1:9119/api/plugins/brain/
```

(9119 is the Hermes gateway port on this machine. Adjust if the user's gateway runs elsewhere.)

When calling from a skill/tool via HTTP, use the full URL:

```bash
curl -s http://127.0.0.1:9119/api/plugins/brain/proposals
```

When calling from the desktop plugin, use relative paths via `ctx.rest()`:

```js
const data = await ctx.rest('/records?limit=100')
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
| `working-memory` | 04 Working Memory | Scratch notes, ongoing work |
| `knowledge` | 05 Knowledge | Reusable synthesis, linked to sources |
| `sources` | 02 Sources | Raw capture — written once, never edited |
| `people` | 10 People | One file per person |
| `system` | 00 System | System docs |
| `inbox` | 01 Inbox | Intake needing attention |
| `review` | 06 Review | Questions, conflicts |
| `activity` | 09 Activity & Undo | Actions, retractions, undo history |
| `sharing-receipts` | 07 Sharing Receipts | What was shared, with whom |
| `archive` | 90 Archive | Retracted/denied records |

## Frontmatter format

Every record is a markdown file with YAML frontmatter:

```yaml
---
title: "Record title"
kind: memory
status: confirmed
created: 2026-10-29T22:00:00+06:00
modified: 2026-10-29T22:30:00+06:00
tags: [tag1, tag2]
source: agent
never_send: false          # true = never leave the vault (no exports, no sharing)
local_only: false          # true = exclude from any remote/sync operation
---

Body text here. Plain markdown.
```

Proposals add `proposal_id` and `destination`:

```yaml
---
title: "Record title"
kind: memory
status: pending
proposal_id: 0001
destination: 03 Memory
created: 2026-10-29T22:00:00+06:00
modified: 2026-10-29T22:00:00+06:00
---

Body text here.
```

## Vault path

```
C:\Users\Nishad Islam Utso\Documents\Hermes\Memory_OB\
├── .brain/
│   └── index.json          ← next_id counter, file list cache
├── .obsidian/              ← Obsidian vault config (theme sync)
├── 00 System/
├── 01 Inbox/
├── 02 Sources/
├── 03 Memory/              ← confirmed memories land here
├── 04 Working Memory/      ← working notes, current tasks
├── 05 Knowledge/           ← research, facts, how-tos
├── 06 Review/
│   └── proposals/          ← pending proposals awaiting approval
├── 07 Sharing Receipts/
├── 08 Journal/             ← build logs, session notes
├── 09 Activity & Undo/     ← actions, retractions, undo history
├── 10 People/              ← people, preferences, relationships
└── 90 Archive/             ← denied/retracted records (never deleted)
```

## Privacy note

No proposal is ever confirmed without the user's explicit approval. When you propose a memory, the proposal file is created in `06 Review/proposals/` with `status: pending`. It stays there until the user clicks Approve or Deny in the Brain → Review screen. Nothing you propose silently becomes a fact.

## Configuration (config.yaml)

Brain REPLACES Hermes's built-in memory system. These settings must be applied
after installing the plugin. Run `scripts/patch_config.py` to apply them automatically.

```yaml
memory:
  memory_enabled: false
  user_profile_enabled: false
  nudge_interval: 0

platform_toolsets:
  cli: [browser, clarify, code_execution, computer_use, connections, cronjob, delegation, file, image_gen, session_search, skills, terminal, todo, tts, video, vision, web]
  # Note: 'memory' removed from cli list
```

### Why each setting matters

| Setting | What it does | Why disable |
|---|---|---|
| `memory_enabled` | Injects ~800 tokens of recalled memory into every session | Brain handles recall on demand |
| `user_profile_enabled` | Stores user preferences separately | Brain's `10 People` folder handles this |
| `nudge_interval` | Nudges agent to save memories every N turns | Brain has its own capture flow |
| `memory` CLI tool | Writes to Hermes's store, not Brain vault | Removed from cli tools |

### What stays enabled

| System | Why keep |
|---|---|
| `session_search` | Finds past chat sessions; Brain handles memory |
| Compression/context management | Hermes needs this for long sessions |

## Setup Scripts

The repo includes three helper scripts in `scripts/`:

| Script | Purpose |
|---|---|
| `init_vault.py` | Creates 12 vault folders, `.brain/index.json`, `README.md` |
| `patch_config.py` | Adds `brain` to `plugins.enabled`, disables Hermes memory, removes `memory` from cli |
| `check.py` | Pre-flight check: verifies Python deps, plugin files, skills, vault, config, syntax |

Run in order:
```bash
python scripts/init_vault.py
python scripts/patch_config.py
python scripts/check.py
```

## Workspace / Deployment

Place the repo in a visible folder the user can open in File Explorer or VS Code.
Do NOT leave it in hidden folders like `AppData/Local/hermes/workspace/` — the user
cannot see or open it from there. Preferred locations:

- `C:\Users\<user>\Documents\Hermes\Workspace\`
- `C:\Users\<user>\Documents\Brain-Repo\`
- `C:\Users\<user>\Desktop\Brain-Repo\`

## Vault Initialization

Run `scripts/init_vault.py` once before first use. It creates all 12 folders,
`.brain/index.json`, and `README.md`.

### Obsidian sync

Copy your existing Obsidian vault's `.obsidian/` folder into the Memory_OB vault
for theme sync. The vault is a standard Obsidian vault and can be opened
directly in Obsidian.

## Config Patching

Run `scripts/patch_config.py` once after installing the plugin. It:
- Adds `brain` to `plugins.enabled`
- Disables Hermes built-in memory
- Removes `memory` from cli tools

## Pre-flight Checks

Run `scripts/check.py` after installation. It verifies:
- Python dependencies (fastapi, uvicorn, pyyaml)
- Plugin files exist and have valid syntax
- Skills installed
- Vault structure correct
- Config.yaml has all required settings

## Pitfalls

- **`write_file` refuses to overwrite existing files**. Use `patch` for targeted edits, or write to `cache/scratch/` then copy with Python/Node. This applies to plugin.js, plugin_api.py, SKILL.md, and any other tracked file.
- **Sed corrupts YAML**. Never use sed to edit `config.yaml`. Use a Python script with exact string replacements instead. Sed patterns that don't match silently fail or create invalid YAML.
- **`sdk.ctx` does not exist**. The `PluginContext` is passed into `register()`, not exported from `@hermes/plugin-sdk`. Every plugin must receive `ctx` as a parameter and pass it to components via props.
- **ctx is undefined inside page components**. `BrainPage`, `VaultPage`, `ReviewPage` must all destructure `{ ctx }` from props. Forgetting this on any one page causes `ReferenceError: ctx is not defined` at render time — the plugin loads but the page crashes immediately.
- **`ctx.rest()` returns JSON, not Response**. There is no `.ok`, `.text()`, or `.json()`. Treat it like `await fetch().json()`.
- **REST paths are relative**. The SDK adds `/api/plugins/<id>/` automatically. Do NOT include the plugin name in the path.
- **Backend only runs when Hermes is running**. The gateway must be running for `ctx.rest()` and `curl` to work. Check `netstat -ano | grep LISTEN | grep 9119`.
- **Cache invalidation is manual**. The backend caches the vault file list for 5 seconds. Every write route must call `_invalidate_vault_cache()` after modifying files.
- **Plugin files are loaded uncompiled**. JSX does not parse — use `jsx()`/`jsxs()` calls, not JSX syntax.
- **Plugin debugging sequence**. When a plugin fails to render: (1) check `logs/desktop.log` for the exact error, (2) fix the first error, restart, repeat. Multiple errors are often chained — fixing `ctx is not defined` may expose the next error (`res.text is not a function` → `ctx.rest()` returns JSON, not Response), which may expose the next (doubled REST path `/brain/records` → `/records`).
- **shutil.rmtree fails on locked .git folders on Windows**. When moving a git repo, `PermissionError` on `.git/objects/` is normal if git has files open. Use `cmd /c rd /s /q` as a fallback, or copy contents and leave the old folder for manual deletion.

## Related Skills

- **memory-full-recall** — Full vault search before answering. Use when the owner wants context-heavy responses or says "full memory recall".
- **anonymous-mode** — Toggle anonymous/private sessions. No memory, no personalization, like a fresh install. Re-prompt to restore.

## References

- `references/setup.md` — Full setup procedure, workspace location, moving repos, GitHub push
- `references/debugging.md` — Plugin debugging sequence: the exact order of fixes applied this session and why each error exposes the next
