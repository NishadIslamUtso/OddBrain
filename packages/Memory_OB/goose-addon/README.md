# Memory_OB for Goose

This addon gives your **plain Goose** a real memory — the OddBrain brain — with
**no OddBrain app** to install, build, or maintain, and **no browser window**:
the screens live inside Goose itself.

Once it is installed:

- Goose reads **your** memory only: confirmed facts first, raw chat evidence
  second, pending/rejected never as facts, and "not found" instead of guessing.
- Goose's **own stock memory is switched off** in the same reviewed step. After
  install, Goose never touches its original memory structure again — only yours.
- Everything lives in **one brain folder** as plain files you can open and read.
- You confirm facts on the **confirmation card in the chat** — nowhere else.

## Install (one command)

1. Make sure Goose has run once (so `config.yaml` exists) and Node.js is installed.
2. Run:

```
node install.mjs --goose-config <path\to\goose\config.yaml>
```

On Windows the config is usually `%APPDATA%\Block\goose\config\config.yaml`. The
brain folder defaults to `Memory_OB` in your home directory; change it with
`--brain <folder>`.

3. Read the exact proposed changes it prints. Type `ALLOW` to write them,
   anything else cancels. Nothing is written before you allow.

**Before you install on a computer that has history you want to keep:** run the
history import first (see *Import your Goose history* below). The install
switches Goose's stock memory off in the same change, and Goose stops reading
its old memory store afterwards.

The installer:

- adds one `memory_ob` extension entry to Goose's config (the eleven tools plus
  the in-chat screens),
- switches **off** Goose's stock `memory` extension (`enabled: false`),
- **repairs damage left by earlier broken installers** — duplicate
  `memory`/`apps`/`memory_ob` blocks (a second enabled `memory` block can
  silently switch stock memory back on) are collapsed to one clean block, and a
  damaged catalogue manifest is kept aside, never deleted,
- writes a config Goose can always parse (a regression-tested guarantee),
- creates the brain folder ready to use, including an empty memory catalogue,
- installs the `memory-ob-memory` rule sheet into Goose's skills folder,
- drops the stamped screens snapshot onto Goose's Apps page
  (`data\apps\memory-ob.html`) beside your other apps,
- keeps your original `config.yaml` as a backup,
- writes a receipt with SHA-256 hashes of everything it installed,
- refuses to overwrite any file it did not write itself.

## What the tools do

| Tool | What it does |
|---|---|
| `memory_ob_status` | Is the brain alive? Which revision? |
| `memory_ob_search` | Find exact word matches in confirmed memory and raw chat evidence. Every answer carries its authority label. |
| `memory_ob_evidence` | Return exact wording, only while the stored bytes still match the SHA-256 you were given. Changed source → refused. Raw chat evidence needs its Project ID — same boundary as search. |
| `memory_ob_project` | Bounded counts for one Project. |
| `memory_ob_propose` | The ONE confirmer. Saves exactly one memory through your Allow click on the confirmation card — see below. |
| `memory_ob_review` | Undo and revoke: `retract` withdraws a confirmed record and **keeps its full history** (nothing is ever permanently deleted); `reject` dismisses a pending draft; `approve`/`correct` act on a draft you explicitly named. |
| `memory_ob_working_notes` | Per-chat draft continuity (objective, plan, decisions, open questions, next actions). Drafts forever — never facts. |
| `memory_ob_owner` | Your controls: hide a record (`never-send`), unhide it, move it to recoverable Trash, restore it. |
| `memory_ob_link` | Declared relationships: supports, contradicts, derived-from, branch-of. |
| `memory_ob_intake` | **Memory_OB takes anything**: notes, pages, documents, video — any module can hand over captured text. It lands as raw unconfirmed evidence with a byte-preserving copy. |
| `memory_ob_screens` | Your screens — Projects, Vault, Review — inside the chat. |

## Your screens, inside Goose

No browser, no window. Either:

- say **"show my memory screens"** in any chat — one app renders **in the
  conversation** with **Projects, Vault and Review as tabs**, live memory state
  every time you ask. Its **Refresh** button asks the chat for the screens
  again; or
- open Goose's **Apps page** — Memory_OB sits beside your other apps
  (a stamped snapshot that says when it was captured and how to get live).

The screens are **view-only**. Records marked Never Send never appear in them —
not their text, titles, ids, or a count.

## Remember this — the card in chat

When Goose wants to remember something, it calls `memory_ob_propose` and a
confirmation card appears **in the chat** showing exactly what is being saved
and as what: the destination (`memory`, `journal`, `capsule` or `life-story`),
the title, the exact text, and the quotation it is based on.

- **Allow** → it becomes confirmed owner memory right there.
- **Deny** → nothing is saved at all.
- Change your mind later? Say so — `memory_ob_review retract` withdraws it and
  keeps the full history (nothing is ever deleted), or ask in the Review tab
  for the record's history.

Two honest rules to keep this safe:

- **Never set "always allow" for `memory_ob_propose`.** The card is the
  approval; without it, saves would happen unseen. Keep it asking every time.
- The quotation on the card must be your exact words from the conversation —
  if Goose cannot quote you, nothing is saved.

## Hiding a record from Goose (Never Send)

You decide what Goose can ever see. Ask Goose — *"mark that Never Send"* — or
on your own machine, in a terminal:

```
node <brain>/adapter/memory-ob-mcp.cjs --catalogue <brain>/store --chats <brain>/chats --vault <brain> owner list
node <brain>/adapter/memory-ob-mcp.cjs ... owner never-send <recordId>
node <brain>/adapter/memory-ob-mcp.cjs ... owner allow-send <recordId>
node <brain>/adapter/memory-ob-mcp.cjs ... owner trash <recordId>
node <brain>/adapter/memory-ob-mcp.cjs ... owner restore <recordId>
```

`owner list` shows every record with its `recordId`. `never-send` hides it from
every agent tool immediately and permanently — the mark survives every memory
sync. Hidden records are excluded wholesale from everything the AI can see:
not their text, titles, ids, or a count. `trash` is recoverable and never
permanent — restore brings the record back, and nothing is ever deleted.

## The brain folder

```
Memory_OB/
  00 System/        privacy rules (your Never-Check list)
  02 Sources/       raw sources (conversations, documents)
  03 Memory/        confirmed memory
  04 Working Memory/  per-chat Working Notes (drafts)
  06 Review/        the review queue (doubts, confirmations, interpretations)
  99 Trash/         recoverable trash — nothing is ever permanently deleted
  store/            the catalogue (identities, links, hashes)
  chats/            durable chat records
  adapter/          the adapter bundle + ownership receipt
```

## Import your Goose history (one time, before installing)

On the computer that still has your Goose history:

```
node import-goose-history.mjs            # preview — changes nothing
node import-goose-history.mjs --apply    # type ALLOW to write it into the brain
```

It reads Goose's sessions (the SQLite store and old `.jsonl` files) and the
stock `memory/*.txt` categories. Every message lands in the brain labelled
**raw unconfirmed evidence** (`origin: import`), never silently trusted. Goose's
folders are never changed; re-running skips what is already imported. Tool
calls and tool results are counted and skipped — only the conversation itself
is kept.

## Anything, no matter the module

Any module can hand memory its raw sources (video, documents, browser —
whatever you add next), through the `memory_ob_intake` tool or directly. Memory
keeps an untouched copy, labels it raw unconfirmed evidence (never a confirmed
fact or instruction), finds it in search, and quotes it only hash-verified and
inside a Project scope — exactly like chat evidence. The same Never Send and
local-only rules apply.

## Meaning search (optional)

A separate optional module that finds candidates by *meaning*. It sits beside
the exact word search and never replaces it — word-match results stay exactly
as they are. Meaning candidates are labelled UNVERIFIED; confirm exact wording
with `memory_ob_evidence` before quoting anything.

Enable it from the standalone folder (or the addon):

```
node semantic-search.mjs --brain "C:\Users\you\Memory_OB" enable
node semantic-search.mjs --brain "C:\Users\you\Memory_OB" rebuild
node semantic-search.mjs --brain "C:\Users\you\Memory_OB" search "what did we decide about the trailer"
```

It uses any free embeddings endpoint you connect (for example your Ollama
Cloud allowance) via `ODDBRAIN_MODEL_BASE_URL` and `ODDBRAIN_EMBED_MODEL` —
no local model is ever downloaded. The vector index is a rebuildable
derivative; deleting it loses nothing.

## The ready-to-download folder

`npm run package:addon` (in `apps/03_oddbrain`) builds
`packages/Memory_OB/dist-addon/Memory_OB-addon/` plus a `.zip`: the whole
addon pre-built — installer, import CLI, the eleven-tool adapter core with the
in-Goose screens, and the skill — with a `MANIFEST.md` recording sources,
versions, commands, states and SHA-256 checksums for every file. Copy the
folder anywhere and run its commands; nothing needs building.

## Rules this addon lives by

- One memory authority: this brain. Not a second database anywhere.
- The in-chat confirmation card is the only place memory is confirmed.
- Raw, pending, rejected and confirmed stay separate and labelled.
- Never Send records are never handed to an agent — not text, titles, ids, or a
  count — on any surface.
- Excluded/Never-Check sources are never returned, even if they were reviewed before.
- Trash and retraction are recoverable; permanent deletion is yours alone,
  after impact review.
