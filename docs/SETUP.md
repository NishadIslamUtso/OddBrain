# Setup Guide

## Prerequisites

- Hermes Desktop v0.22.5+ (Windows 11 tested)
- Python 3.10+ with pip
- Git (optional, for cloning)

## Step 1: Install Python dependencies

```bash
pip install fastapi uvicorn pyyaml
```

Or with a virtual environment:

```bash
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install fastapi uvicorn pyyaml
```

## Step 2: Copy plugin files

Copy the following into your Hermes installation:

```
desktop-plugins/brain/plugin.js       → C:\Users\<user>\AppData\Local\hermes\desktop-plugins\brain\plugin.js
plugins/brain/dashboard/manifest.json  → C:\Users\<user>\AppData\Local\hermes\plugins\brain\dashboard\manifest.json
plugins/brain/dashboard/plugin_api.py  → C:\Users\<user>\AppData\Local\hermes\plugins\brain\dashboard\plugin_api.py
skills/brain/SKILL.md                  → C:\Users\<user>\AppData\Local\hermes\skills\brain\SKILL.md
skills/brain/memory-full-recall/SKILL.md → C:\Users\<user>\AppData\Local\hermes\skills\brain\memory-full-recall\SKILL.md
skills/brain/anonymous-mode/SKILL.md   → C:\Users\<user>\AppData\Local\hermes\skills\brain\anonymous-mode\SKILL.md
```

## Step 3: Configure config.yaml

Add to `config.yaml`:

```yaml
plugins:
  enabled:
    - brain

memory:
  memory_enabled: false
  user_profile_enabled: false
  nudge_interval: 0

platform_toolsets:
  cli: [browser, clarify, code_execution, computer_use, connections, cronjob, delegation, file, image_gen, session_search, skills, terminal, todo, tts, video, vision, web]
```

Remove `memory` from the `cli:` tools list.

## Step 4: Initialize vault

Create the vault folder structure:

```bash
mkdir -p "C:\Users\<user>\Documents\Hermes\Memory_OB\03 Memory"
mkdir -p "C:\Users\<user>\Documents\Hermes\Memory_OB\04 Working Memory"
mkdir -p "C:\Users\<user>\Documents\Hermes\Memory_OB\05 Knowledge"
mkdir -p "C:\Users\<user>\Documents\Hermes\Memory_OB\06 Review\proposals"
mkdir -p "C:\Users\<user>\Documents\Hermes\Memory_OB\08 Journal"
mkdir -p "C:\Users\<user>\Documents\Hermes\Memory_OB\09 Activity & Undo"
mkdir -p "C:\Users\<user>\Documents\Hermes\Memory_OB\10 People"
mkdir -p "C:\Users\<user>\Documents\Hermes\Memory_OB\90 Archive"
mkdir -p "C:\Users\<user>\Documents\Hermes\Memory_OB\.brain"
```

Optionally copy your Obsidian vault's `.obsidian/` folder for theme sync.

## Step 5: Verify

```bash
hermes config check
```

Expected: config version passes, no errors.

```bash
node --check desktop-plugins/brain/plugin.js
```

Expected: `Syntax OK`

```bash
python -m py_compile plugins/brain/dashboard/plugin_api.py
```

Expected: no output (success)

## Step 6: Restart Hermes

Close and reopen Hermes Desktop. The Brain sidebar row should appear under sessions.

## Step 7: Test

1. Open Brain via sidebar or `/brain`
2. Vault tab should show records (or "No records found" if vault is empty)
3. Review tab should show "No pending proposals"
4. Pet notification should appear if proposals exist

## Troubleshooting

- **Plugin not loading**: check `logs/desktop.log` for `[error-boundary:contrib:plugin:brain]` errors
- **Backend 404**: ensure `brain` is in `plugins.enabled` and `manifest.json` exists
- **Config check fails**: run `hermes config check` and fix reported issues
- **Syntax errors**: run `node --check` on plugin.js and `python -m py_compile` on plugin_api.py
