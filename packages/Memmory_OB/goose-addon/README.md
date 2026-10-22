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
history import first (see *Still coming next* below). The install switches
Goose's stock memory off in the same change, and Goose stops reading its old
memory store afterwards.

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

## Still coming next (built on this)

- **History import**: one command to pull your existing Goose sessions into the
  brain as raw evidence, so nothing is lost when stock memory goes off.
- **The Review screen**: the separate screen for doubts, confirmations and
  interpretations — the only place memory is ever confirmed.

## Rules this addon lives by

- One memory authority: this brain. Not a second database anywhere.
- Goose never confirms its own memory.
- Raw, pending, rejected and confirmed stay separate and labelled.
- Excluded/Never-Check sources are never returned, even if they were reviewed before.
- Trash is recoverable; permanent deletion is yours alone, after impact review.
