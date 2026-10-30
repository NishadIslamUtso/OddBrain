# Brain — Memory_OB for Hermes

Memory_OB is a memory module for Hermes Desktop. It replaces Hermes's built-in
memory system with a vault-based, user-controlled, evidence-first memory store.

- **Vault**: `~/Documents/Hermes/Memory_OB/` — plain markdown files in 12 folders
- **Backend**: Python FastAPI plugin at `plugins/brain/dashboard/plugin_api.py`
- **UI**: Desktop plugin at `desktop-plugins/brain/plugin.js` — theme-synced, scrollable
- **Skills**: Agent skills for full recall, anonymous mode, and propose/search/review

## What it does

- Stores every memory as a markdown file with YAML frontmatter (`kind`, `status`, `tags`, `source`)
- Everything starts as `raw-unconfirmed-evidence` — nothing is confirmed without your approval
- Approve/deny proposals in the Review tab, or via pet notifications
- Search the vault by keyword, kind, or tag
- Full memory recall skill loads every relevant record before answering
- Anonymous mode toggles a clean slate — no memory, no personalization

## Quick start

1. Install dependencies: `pip install fastapi uvicorn pyyaml`
2. Enable the plugin in `config.yaml`: add `brain` to `plugins.enabled`
3. Turn off Hermes built-in memory: `memory_enabled: false`, `user_profile_enabled: false`
4. Restart Hermes
5. Open Brain via sidebar or `/brain` route

## Repo structure

```
brain-repo/
├── desktop-plugins/brain/plugin.js   # React UI (sidebar, /brain route, Vault + Review tabs)
├── plugins/brain/dashboard/
│   ├── manifest.json                 # Plugin manifest
│   └── plugin_api.py                 # FastAPI backend (records, proposals, write routes)
├── skills/brain/
│   ├── SKILL.md                      # Core Brain skill (propose/search/review/write)
│   ├── memory-full-recall/SKILL.md   # Full vault search before answering
│   └── anonymous-mode/SKILL.md       # Toggle anonymous/private sessions
├── vault/                            # Memory vault (12 folders, .obsidian, index)
├── scripts/                          # Setup, import, install helpers
└── docs/                             # Architecture, conflicts, dependencies, setup
```

## Documentation

- [SETUP.md](docs/SETUP.md) — Installation and configuration
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — System design and data flow
- [CONFLICTS.md](docs/CONFLICTS.md) — Conflicts with Hermes built-in systems and resolutions
- [DEPENDENCIES.md](docs/DEPENDENCIES.md) — Required packages, files, and checks

## License

MIT
