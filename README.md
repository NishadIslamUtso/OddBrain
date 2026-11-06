# Brain — Memory_OB for Hermes

Memory_OB is a memory module for Hermes Desktop. It replaces Hermes's built-in
memory system with a vault-based, user-controlled, evidence-first memory store.

- **Vault** (your data): `~/Documents/Hermes/Memory_OB/` — plain markdown in
  12 folders. Not part of this repo.
- **Engine**: `Memory_OB/memory_ob/` — Python library (SQLite + FTS5 + local
  embeddings)
- **Host plugin**: `Memory_OB/host/` — FastAPI dashboard + Hermes desktop shell
- **Skills**: `Memory_OB/skills/` — full recall, anonymous mode, propose/search

## What it does

- Stores every memory as a markdown file with YAML frontmatter (`kind`, `status`, `tags`, `source`)
- Everything starts as `raw-unconfirmed-evidence` — nothing is confirmed without your approval
- Approve/deny proposals in the Review tab, or via pet notifications
- Search the vault by keyword, kind, or tag
- Full memory recall skill loads every relevant record before answering
- Anonymous mode toggles a clean slate — no memory, no personalization

## Quick start

```bash
cd Memory_OB
pip install -e .                    # or: pip install -r requirements.txt
python -m memory_ob.cli doctor      # is this set up right?
python -m memory_ob.cli serve       # run the dashboard
python run_tests.py                 # the whole suite
```

See [Memory_OB/README.md](Memory_OB/README.md) for full install and config.

## Repo structure

```
Workspace/
├── Memory_OB/                 # the project
│   ├── memory_ob/             # engine: store, extract, review, search, graph
│   ├── host/                  # FastAPI dashboard + Hermes desktop shell
│   ├── provider/memory_ob/    # Hermes memory provider bridge
│   ├── skills/                # agent skills
│   ├── tests/                 # the suite (python run_tests.py)
│   └── docs/                  # architecture, dependencies, conflicts
├── LICENSE
└── README.md                  # this file
```

Your vault is not in this repo — it lives at `~/Documents/Hermes/Memory_OB/`.

## Documentation

- [Memory_OB/README.md](Memory_OB/README.md) — setup, config, Hermes integration
- [Memory_OB/DESIGN.md](Memory_OB/DESIGN.md) — the design record
- [Memory_OB/docs/](Memory_OB/docs/) — architecture, dependencies, conflicts

## License

MIT
