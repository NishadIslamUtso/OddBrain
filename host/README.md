# Memory_OB host shell

The thin adapter that puts Memory_OB inside Hermes Desktop. It has three
parts; none of them re-implements the engine — the shell is a door, not a
second brain.

```
Memory_OB engine  (SQLite + search + the six screens' API)
   ▲
   │  mounts the engine's routes                      ← the screens
   │
host/plugins/memory_ob/dashboard/plugin_api.py    backend, at /api/plugins/memory_ob/
host/desktop-plugins/memory-ob/plugin.js          the pane inside Hermes Desktop

   ▲
   │  implements Hermes's MemoryProvider            ← the memory pipe
   │
provider/memory_ob/__init__.py                    recall + capture + tools
```

`install.py` merges the dashboard half and the provider half into one plugin
folder in the Hermes home, copies the pane, and adds the skills (additively —
Hermes's own skills are left alone).

## Install (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

1. finds the engine; 2. runs `host/install.py` (copies the plugin, writes the
`.memory_ob_home` pointer, enables the plugin through Hermes's own CLI — never by
editing `config.yaml`); 3. creates the private write key in the memories
folder (`.brain/token`, never shipped); 4. registers the nightly run; 5. takes a
first backup. A **logon prompt** is added to your Startup folder: at login it
asks once whether to start the Hermes helper link with Windows and remembers
the answer (`--no-startup` skips it). Then fully quit and reopen Hermes.

Opening the vault for the first time on an older layout moves it to the new
one, after a verified backup zip.

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1               # keep memories
powershell -ExecutionPolicy Bypass -File uninstall.ps1 -DeleteData   # also delete them
```

In order: backup zip beside the memories folder → take Memory_OB's block out of
Hermes's own memory notes (if you turned that on) → remove the startup item and
nightly task, stop the helper link → switch the plugin off through Hermes and
delete the files the installer copied → only with `-DeleteData`, delete the
memories (and only if the backup was made). `python host/uninstall.py --dry-run`
shows what would happen.

## The nightly run

`host/nightly.py` runs the night shift. Each step is independent — one failing
does not stop the others:

| Step | What it does |
|---|---|
| read | reads conversations that were waiting for the AI helper |
| people | suggests profiles that may be the same person (never merges) |
| biography | refreshes the Journal biography unless you locked it |
| notes | rewrites the vault notes and `Me.md` |
| manifest | checks imported originals against their fingerprints (verify only) |
| hermes | updates Hermes's own memory notes, only if you turned that on |

```bash
python host/nightly.py            # everything
python host/nightly.py --dry-run  # report what would run
python host/schedule.py           # register with Task Scheduler
python host/schedule.py --status
python host/schedule.py --remove
```

## Backup and restore

```bash
python host/backup.py                       # timestamped archive
python host/backup.py --list
python host/backup.py --restore memory-ob-20261106-040000.zip
```

The write key is never put in a backup.

## Theme sync

The pane passes Hermes's own `--ui-*` colour, font and size tokens into the
page, which maps them to its own variables. There is no appearance setting:
change the app's theme and Memory_OB follows. Panels are always opaque.

## Why an iframe with `srcDoc`

An iframe cannot carry the dashboard session token, so it may not load the
backend page directly — every `/api/` route would answer 401. Instead:

1. the shell fetches the markup through `ctx.rest('/ui-html')`, riding the
   app's authenticated bridge;
2. it mounts the markup with `srcDoc` (the page is one self-contained HTML
   file — no external resources);
3. the page's own `api()` calls `window.parent.hermesDesktop.api(...)` when it
   finds the host bridge, so reads and writes authenticate too. Writes also
   need the private write key, which the backend injects into the page.

Standalone (`uvicorn memory_ob.api:app` in a browser tab) skips all of that.

## Finding the engine

`plugin_api.py`: the `MEMORY_OB_HOME` environment variable, then the
`.memory_ob_home` pointer, then a sibling of the plugin tree, then the folders
this project has used. Set `MEMORY_OB_HOME` when the project lives somewhere
unusual.

## Routes added by the shell

| Route | Purpose |
|---|---|
| `GET /api/plugins/memory_ob/status` | liveness and where the engine was found |
| `GET /api/plugins/memory_ob/ui` | the screens as HTML (browser tab with a token) |
| `GET /api/plugins/memory_ob/ui-html` | the screens as JSON, for the shell's `srcDoc` |

Everything else is the engine's own API, passed through untouched.

## Files

| Path | Role |
|---|---|
| `plugins/memory_ob/dashboard/*` | backend (`plugin_api.py`), manifest |
| `desktop-plugins/memory-ob/plugin.js` | the pane: theme hand-off and the authenticated iframe |
| `../provider/memory_ob/` | the memory provider (see its README) |
| `../skills/*/SKILL.md` | brain, memory-full-recall, anonymous-mode |
| `install.py` / `install.ps1` | install |
| `uninstall.py` / `uninstall.ps1` | uninstall |
| `nightly.py`, `schedule.py` | the nightly run and its Task Scheduler entry |
| `backup.py` | archive and restore |
| `proxy_autostart.py` | the logon prompt for the helper link |
