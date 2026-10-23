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
node brain-window.mjs                  # the Review window: Projects · Vault · Review
```

Run the import **before** installing, on the computer that still has your
Goose history. After install, Goose never touches its old memory again.

## How it trusts things

- Your memory lives in one folder (default `~/Memory_OB`). Nothing else is a
  second copy.
- Everything starts as **raw unconfirmed evidence** — imported history, chat
  notes, drafts. Nothing is trusted on arrival.
- The **Review window is the only place memory is confirmed**. You approve,
  reject or correct with the exact words in front of you.
- Goose will be able to **suggest** memory ("remember this"); it lands as a
  proposal and waits for your approval — never confirmed by itself.
- Deleted things go to recoverable Trash. Nothing is ever permanently deleted
  by the AI. `Never Send`/local-only marks are enforced everywhere.
- No telemetry, no credentials, no phone-home.

## What's done

- The four read-only Goose tools (status, search, project counts, evidence)
  with hash-verified quotes — evidence never quotes from a changed source.
- One-command installer: exact change shown first, type `ALLOW`, config backed
  up, receipt written, Goose's stock memory switched off in the same change.
- One-time Goose-history import (sessions.db + old sessions + memory notes;
  Chat Recall is covered). Goose's folders are never touched.
- Review window with the real screens: Projects (stable project memory),
  Vault (files, search, memory graph, link check, folder choose-and-decide),
  Review (doubts/confirmations/interpretations).
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
- One ready-to-download folder with a checksummed MANIFEST (every file's
  fingerprint, versions, commands).

## What's left

1. **Goose's "remember this" tool** — Goose proposes memory through its tools
   (smooth, few clicks), you approve each one in Review. Propose-and-approve,
   nothing confirmed by Goose itself.
2. **Your acceptance run** — install on your real Windows machine with plain
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
