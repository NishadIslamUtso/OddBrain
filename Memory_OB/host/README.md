# Memory_OB host shell

The thin adapter that puts Memory_OB inside Hermes Desktop. It has three
parts, and none of them reimplements the engine — the shell is a door, not a
second brain.

```
Memory_OB (engine, SQLite + FTS5 + local vectors)
   ▲
   │  mounts its FastAPI routes                ← the screens
   │
host/plugins/memory_ob/dashboard/plugin_api.py   ← backend, at /api/plugins/memory_ob/
host/desktop-plugins/memory-ob/plugin.js         ← React shell, a dockable pane

   ▲
   │  implements agent.memory_provider.MemoryProvider   ← the memory pipe
   │
host/plugins/memory_ob/__init__.py               ← recall + capture + tools
```

The two `host/plugins/memory_ob/` halves share one directory: the dashboard
backend lives in `dashboard/`, the memory provider at the top level. Both are
loaded by the same `install.py`, which merges rather than overwrites.

## The memory provider

Hermes calls the provider's hooks every turn; the provider turns them into
engine calls:

| Hook | What it does |
|---|---|
| `prefetch(query)` | recall before a turn — confirmed records first, candidate facts labelled `UNVERIFIED`, `neverSend` records never leave the store |
| `sync_turn(...)` | after a turn, extract candidate facts in the background |
| `on_pre_compress(messages)` | capture what compression is about to discard, return a short digest |
| `on_session_end(messages)` | the same capture at a real session boundary |

Tools the agent can call: `memory_ob_search`, `memory_ob_capture`,
`memory_ob_review` (list or defer — the agent never confirms or denies),
`memory_ob_stats`.

Activate:

```bash
hermes config set memory.provider memory_ob
```

Check it:

```bash
hermes memory status     # Provider: memory_ob · available ✓
```

The engine is found via `MEMORY_OB_HOME`, then
`~/Documents/Hermes/Workspace/Memory_OB`, then
`~/Documents/Hermes/Memory_OB`.

## Theme sync

The pane follows the app's appearance. `plugin.js` reads the host's
`--ui-*` values off `document.documentElement` and the backend inlines them
into the UI markup as `:root` overrides, so a theme switch restyles the pane
on the next load.

The host names its surfaces `--ui-bg-*`, not `--ui-background`, so
`plugin.js` maps each host variable to the name the UI stylesheet reads:

| Host | UI |
|---|---|
| `--ui-bg-chrome` | `--ui-background` |
| `--ui-bg-secondary` | `--ui-background-secondary` |
| `--ui-bg-elevated` | `--ui-background-elevated` |
| `--ui-stroke-secondary` / `--ui-stroke-tertiary` | `--ui-stroke-secondary` / `--ui-stroke-tertiary` |
| `--ui-text-primary` … `--ui-text-quaternary` | same |
| `--ui-accent` | `--ui-accent` |

A host variable that resolves empty is skipped, so the UI keeps its own
fallback when the app exposes nothing.

## Delivery (Windows, one paste)

From a downloaded release:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

The script locates the engine, runs `host/install.py` (which copies the
plugin halves and skills into the Hermes home and enables the plugin through
the official CLI), asks you to **type** the ALLOW token — which *is* the
write token, stored in the vault's private `.brain/token`, never committed —
registers the nightly run with Task Scheduler, and takes a first backup.

## The nightly run

`host/nightly.py` does the dream, the consistency sweep, the vault export,
the manifest refresh and the opt-in standing-layer sync. Each step is
independent: one failing does not stop the rest.

```bash
python host/nightly.py            # everything
python host/nightly.py --dry-run  # report what would run
python host/schedule.py           # register it with Task Scheduler
python host/schedule.py --status
```

## Backup and restore

```bash
python host/backup.py            # timestamped archive
python host/backup.py --list
python host/backup.py --restore memory-ob-20261106-040000.zip
```

## The integrity surface

| Endpoint | Purpose |
|---|---|
| `GET /api/manifest` | verify every vault file against its fingerprint |
| `POST /api/manifest` | rebuild the manifest |
| `GET /api/receipts` | sharing receipts — who got what, when, on what basis |
| `GET/POST /api/intake` | the byte-preserving intake door |

The manifest never fingerprints `.brain/` (the token, the anonymous flag,
the model config live there), and a changed, missing or extra file is
reported rather than absorbed.

## Host files

| Path | Role |
|---|---|
| `plugins/memory_ob/__init__.py` | the memory provider — recall, capture, agent tools |
| `plugins/memory_ob/plugin.yaml` | provider manifest |
| `plugins/memory_ob/dashboard/*` | the dashboard backend and screens |
| `desktop-plugins/memory-ob/plugin.js` | the React shell |
| `../skills/*/SKILL.md` | brain, memory-full-recall, anonymous-mode |
| `install.py` | copies everything into the Hermes home |
| `install.ps1` | the one-paste Windows installer |
| `nightly.py` | dream + sweep + export + manifest + sync |
| `schedule.py` | Windows Task Scheduler registration |
| `backup.py` | archive and restore |

## Why an iframe with `srcDoc`

An iframe cannot carry the dashboard session token, so it may not load the
backend's `/ui` page directly — every `/api/` route 401s without the token.
Instead:

1. the shell fetches the markup through `ctx.rest('/ui-html')`, which rides the
   app's authenticated bridge;
2. it mounts the markup with `srcDoc` (the UI is one self-contained HTML file —
   inline `<style>` and `<script>`, no external resources);
3. the UI's own `api()` calls `window.parent.hermesDesktop.api(...)` when it
   finds the host bridge, so its reads and writes authenticate too.

Standalone (a plain browser tab on `uvicorn memory_ob.api:app`) skips all of
that and uses ordinary same-origin `fetch`.

## Install

```bash
cd host
python install.py            # copies both halves, enables the plugin
```

Then restart Hermes Desktop (or reload the window). The pane appears on the
right; drag it where you want it — panes stay where you put them.

`python install.py --no-enable` copies without touching the enable list.

The plugin is enabled through the official CLI, never by editing `config.yaml`:

```bash
hermes plugins enable memory_ob
```

## Files

| Path | Role |
|---|---|
| `plugins/memory_ob/__init__.py` | the memory provider — recall, capture, agent tools |
| `plugins/memory_ob/plugin.yaml` | provider manifest |
| `plugins/memory_ob/dashboard/manifest.json` | dashboard plugin manifest (tab hidden — the desktop shell owns the surface) |
| `plugins/memory_ob/dashboard/plugin_api.py` | finds the engine, mounts its routes, serves the screens |
| `plugins/memory_ob/dashboard/index.js` | manifest completeness only |
| `desktop-plugins/memory-ob/plugin.js` | the React shell: theme hand-off + authenticated iframe |
| `install.py` | copies all three parts into the Hermes home and enables the plugin |

## Locating the engine

`plugin_api.py` looks for the project in this order:

1. `MEMORY_OB_HOME` environment variable
2. `~/Documents/Hermes/Workspace/Memory_OB`
3. a sibling of the plugin tree

Set (1) when the project lives somewhere else.

## Endpoints added by the shell

| Route | Purpose |
|---|---|
| `GET /api/plugins/memory_ob/status` | liveness + where the engine was found |
| `GET /api/plugins/memory_ob/ui` | the screens as HTML (browser tabs with a token) |
| `GET /api/plugins/memory_ob/ui-html` | the screens as JSON, for the shell's `srcDoc` |

Everything else is the engine's own API, passed through untouched.
