# Memory_OB

The memory module for [Goose](https://github.com/block/goose). It replaces
Goose's native memory system completely — Goose keeps your memory, you keep
Goose plain.

This is one module. Everything the old OddBrain app was meant to do will arrive
the same way: as separate modules on Goose (video, documents, editing, browser
capture, …). Memory_OB is built to fit them as they come.

## How to use it (on any machine)

Get the `Memory_OB-addon` folder (download zip, or rebuild it from this repo
with `npm run package:addon` in `apps/03_oddbrain`). Inside the folder:

```
node import-goose-history.mjs          # 1. look at your Goose history (changes nothing)
node import-goose-history.mjs --apply  # 2. bring it into your memory (type ALLOW)
node install.mjs --goose-config <config.yaml>   # 3. install into Goose (type ALLOW)
```

Then, in Goose: say **"show my memory screens"** — Projects · Vault · Review
render inside the chat (and on Goose's Apps page). No browser window.

Run the import **before** installing, on the computer that still has your
Goose history. After install, Goose never touches its old memory again.

## How it trusts things

- Your memory lives in one folder (default `~/Memory_OB`). Nothing else is a
  second copy.
- Everything starts as **raw unconfirmed evidence** — imported history, chat
  notes, drafts. Nothing is trusted on arrival.
- The **confirmation card in the chat is the only place memory is confirmed**.
  You approve or deny with the exact words in front of you; undo and revoke
  keep full history (`memory_ob_review retract`).
- Goose will be able to **suggest** memory ("remember this"); it lands as a
  proposal and waits for your approval — never confirmed by itself.
- Deleted things go to recoverable Trash. Nothing is ever permanently deleted
  by the AI. `Never Send`/local-only marks are enforced everywhere.
- No telemetry, no credentials, no phone-home.

## What's done

- The eleven Goose tools (status, search, project counts, evidence, propose,
  review, working notes, owner controls, link, intake, screens) with
  hash-verified quotes — evidence never quotes from a changed source.
- One-command installer: exact change shown first, type `ALLOW`, config backed
  up, receipt written, Goose's stock memory switched off in the same change.
  It also repairs the duplicate config blocks and unparseable configs that
  earlier broken installers leave behind (and never writes one again).
- One-time Goose-history import (sessions.db + old sessions + memory notes).
  Goose's folders are never touched.
- Screens inside Goose: Projects (stable project memory), Vault (files,
  memory graph), Review (doubts/confirmations/interpretations) as tabs in the
  chat app and on the Apps page — view-only, live on every ask.
- The proposal drafter ("engine-notes"): reads your conversations and drafts
  memory suggestions with exact quotes for you to approve — nothing lands
  without you.
- Owner tools: `never-send` / `allow-send` / `list` on any record.
- **Anything, no matter the module:** any module (video, documents, browser,
  whatever comes next) hands memory its sources through one intake door.
  Memory keeps an untouched copy, labels it `raw-unconfirmed-evidence` (never
  a confirmed fact or instruction), finds it by search, and quotes it only
  hash-verified and inside a Project scope — exactly like chat evidence.
- **Meaning search (optional module):** finds candidates by meaning, sits
  BESIDE the exact word search, never replaces it. Candidates are labelled
  UNVERIFIED; every quote still passes evidence. Uses any free
  embeddings endpoint you connect (for example Ollama Cloud) — no local model
  is ever downloaded.
- **"Remember this" with one click:** Goose proposes a memory and a
  confirmation card appears in the chat showing exactly what is saved and as
  what (destination, title, text, and your exact quotation). Allow confirms it
  on the spot — no second visit to Review. Deny saves nothing. Review keeps the
  history for later changes (nothing is ever deleted).
- One ready-to-download folder with a checksummed MANIFEST (every file's
  fingerprint, versions, commands).

## What's left

1. **Your acceptance run** — install on your real Windows machine with plain
   Goose (import first), and check everything live.

Not building (your call): per-chat "notes for AI" — Goose's own notes play
that role; Memory_OB does not rebuild it.

## The module idea

Memory_OB is the first of several modules that make Goose work the way you
want. It must keep adapting to the rest as they arrive — one memory, one
trust model, smooth to activate, done once and forgotten.

Every module's memory side flows through the same door: any module can hand
memory its raw sources (`memory_ob` module intake), and the same laws apply
everywhere — raw stays labelled raw and unconfirmed, quotes only ever come
hash-verified, Never Send and local-only records never travel, and nothing is
ever an instruction. New module, same door, no new trust model.
