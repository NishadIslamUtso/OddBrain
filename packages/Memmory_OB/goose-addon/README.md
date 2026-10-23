# Memmory_OB for Goose

This addon gives your **plain Goose** a real memory — the OddBrain brain — with
**no OddBrain app** to install, build, or maintain.

Once it is installed:

- Goose reads **your** memory only: confirmed facts first, raw chat evidence
  second, pending/rejected never as facts, and "not found" instead of guessing.
- Goose's **own stock memory is switched off** in the same reviewed step. After
  install, Goose never touches its original memory structure again — only yours.
- Everything lives in **one brain folder** as plain files you can open and read.
- Goose gets **read-only** tools. It can never write, confirm, delete, or send
  memory. Only you confirm facts, in the Review screen.

## Install (one command)

1. Make sure Goose has run once (so `config.yaml` exists) and Node.js is installed.
2. Run:

```
node install.mjs --goose-config <path\to\goose\config.yaml>
```

On Windows the config is usually `%APPDATA%\Block\goose\config.yaml`. The brain
folder defaults to `Memmory_OB` in your home directory; change it with
`--brain <folder>`.

3. Read the exact proposed changes it prints. Type `ALLOW` to write them,
   anything else cancels. Nothing is written before you allow.

**Before you install on a computer that has history you want to keep:** run the
history import first (see *Import your Goose history* below). The install
switches Goose's stock memory off in the same change, and Goose stops reading
its old memory store afterwards.

The installer:

- adds one `memmory_ob` extension entry to Goose's config (four read-only tools),
- switches **off** Goose's stock `memory` extension (`enabled: false`),
- creates the brain folder ready to use, including an empty memory catalogue,
- installs the `memmory-ob-memory` rule sheet into Goose's skills folder,
- keeps your original `config.yaml` as a backup,
- writes a receipt with SHA-256 hashes of everything it installed,
- refuses to overwrite any file it did not write itself.

## What the tools do

| Tool | What it does |
|---|---|
| `memmory_ob_status` | Is the brain alive? Which revision? |
| `memmory_ob_search` | Find exact word matches in confirmed memory and raw chat evidence. Every answer carries its authority label. |
| `memmory_ob_project` | Bounded counts for one Project. |
| `memmory_ob_evidence` | Return exact wording, only while the stored bytes still match the SHA-256 you were given. Changed source → refused. Raw chat evidence needs its Project ID — same boundary as search. |

## Hiding a record from Goose (Never Send)

You decide what Goose can ever see. On your own machine, in a terminal:

```
node <brain>/adapter/memmory-ob-mcp.cjs --catalogue <brain>/store --chats <brain>/chats --vault <brain> owner list
node <brain>/adapter/memmory-ob-mcp.cjs --catalogue <brain>/store --chats <brain>/chats --vault <brain> owner never-send <recordId>
node <brain>/adapter/memmory-ob-mcp.cjs --catalogue <brain>/store --chats <brain>/chats --vault <brain> owner allow-send <recordId>
```

`owner list` shows every record with its `recordId`, sensitivity and Never-Send
mark. `never-send` hides it from all four tools immediately and permanently —
OddBrain keeps your choice across every memory sync. `allow-send` clears the
mark again. The install receipt prints the full command with your real paths.

## The brain folder

```
Memmory_OB/
  00 System/        privacy rules (your Never-Check list)
  02 Sources/       raw sources (conversations, documents)
  03 Memory/        confirmed memory
  06 Review/        the review queue (doubts, confirmations, interpretations)
  99 Trash/         recoverable trash — nothing is ever permanently deleted
  store/            the catalogue (identities, links, hashes)
  chats/            durable chat records
  adapter/          the adapter bundle + ownership receipt
```

## The Brain Window (your screens on your brain)

```
node brain-window.mjs
```

One command opens the **same OddBrain screens** in your browser, on your brain
folder (default `~/Memmory_OB`, change with `--brain <folder>`):

- **Projects screen** — create and edit Projects, their goals and attached
  reference files; shared Project memory is one catalogue for Goose and the app.
- **Vault screen** — your brain's files, vault search, and the memory graph with
  an honest link check (dead and ambiguous links are reported, never repaired
  behind your back).
- **Review screen** — doubts, confirmations, interpretations: the only place
  memory is ever confirmed. Decisions are saved immediately.
- **Brain screen** — memory checking at a glance: chats, trash, and what memory
  holds.
- **First run** — selecting a folder (your memory folder / data folder) and
  deciding what to do with it: prepare it as a brain, or leave it untouched.

It is local-only (127.0.0.1): nothing on your network can reach it. No desktop
app is installed or required. Anything that needs the real desktop app keeps
saying so out loud instead of pretending.

## Import your Goose history (one time, before installing)

On the computer that still has your Goose history:

```
node import-goose-history.mjs            # preview — changes nothing
node import-goose-history.mjs --apply    # type ALLOW to write it into the brain
```

It reads Goose's sessions (the SQLite store and old `.jsonl` files) and the
stock `memory/*.txt` categories — including `Chat Recall`, which is only a
search over those same sessions. Every message lands in the brain labelled
**raw unconfirmed evidence** (`origin: import`), to be reviewed in the Review
screen like any other evidence. Goose's folders are never changed; re-running
skips what is already imported. Tool calls and tool results are counted and
skipped — only the conversation itself is kept.

## Still coming next (built on this)

- **Engine-notes proposals**: the organizer drafts memory proposals from
  conversations and shows them for review — confirmation still only ever
  happens in the Review screen.
- **Real-machine acceptance** on your Windows machine with plain Goose.

## The ready-to-download folder

`npm run package:addon` (in `apps/03_oddbrain`) builds
`packages/Memmory_OB/dist-addon/Memmory_OB-addon/` plus a `.zip`: the whole
addon pre-built — installer, import CLI, Brain Window launcher with its server
and interface, the four-tool adapter core, and the skill — with a `MANIFEST.md`
recording sources, versions, commands, states and SHA-256 checksums for every
file. Copy the folder anywhere and run its commands; nothing needs building.

## Rules this addon lives by

- One memory authority: this brain. Not a second database anywhere.
- Goose never confirms its own memory.
- Raw, pending, rejected and confirmed stay separate and labelled.
- Excluded/Never-Check sources are never returned, even if they were reviewed before.
- Trash is recoverable; permanent deletion is yours alone, after impact review.
