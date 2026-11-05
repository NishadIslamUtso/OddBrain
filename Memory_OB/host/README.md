# Memory_OB host shell

The thin adapter that puts Memory_OB inside Hermes Desktop. It has two halves,
and neither one reimplements the engine — the plugin is a door, not a second
brain.

```
Memory_OB (engine, SQLite + FTS5 + local vectors)
   ▲
   │  mounts its FastAPI routes
   │
host/plugins/memory_ob/dashboard/plugin_api.py   ← backend, at /api/plugins/memory_ob/
host/desktop-plugins/memory-ob/plugin.js         ← React shell, a dockable pane
```

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
| `plugins/memory_ob/dashboard/manifest.json` | dashboard plugin manifest (tab hidden — the desktop shell owns the surface) |
| `plugins/memory_ob/dashboard/plugin_api.py` | finds the engine, mounts its routes, serves the screens |
| `plugins/memory_ob/dashboard/index.js` | manifest completeness only |
| `desktop-plugins/memory-ob/plugin.js` | the React shell: theme hand-off + authenticated iframe |
| `install.py` | copies both halves into the Hermes home and enables the plugin |

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
