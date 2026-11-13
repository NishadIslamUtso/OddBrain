# Memory_OB

Memory for Hermes that runs itself. **Tell it anything, in any order. It files
it, checks it against what it already knows, and only interrupts you when two
things really disagree.**

Everything stays on your computer: no cloud, no accounts. Your memories are
plain markdown files in an Obsidian-style folder, so you can open them in
Obsidian (or anything else) at any time.

---

## What you do

Nothing, mostly. Talk to Hermes (or paste something into Memory_OB) and it is
remembered. Open the Memory_OB tab only when you want to look, fix or search.

## The six screens

| Screen | What it is |
|---|---|
| **Review** | The only screen that ever needs you. Shows what was just remembered (with **Undo**), questions where something you said now disagrees with something remembered ("Your answer changed": keep new / keep old / keep both), and a few "not sure" items. A box at the top lets you tell it something directly, and search covers everything. You can also say "forget that I like mangoes" there, or in a chat. |
| **Vault** | Your notes exactly like Obsidian: category folders, nested tags, links, a graph, and Obsidian-style filters (`tag:#topic/health`, `path:Health`, `by:ai`, `-word`, `"exact phrase"`, `after:2026-01-01`, `has:revisit`, `is:orphan`, `type:memory`, `person:Riya`). Open a note to read or edit it. The AI makes the folders, tags and links; you can move or edit anything. |
| **People** | A profile for everyone you talk about or talked to, on any platform, linked to the raw conversations. Two profiles that are the same person can be joined with one click (and un-joined from the feed). Removing a person asks whether their chats go too (group chats with other people always stay); undo brings everything back. |
| **Journal** | A professional biography of you, written from what is remembered (health and money are left out unless you allow them in Settings), plus dated journal entries. Edit it yourself and it is locked against AI rewrites until you unlock it. |
| **Me** | What is current: your **to-do list** (tick things off; they move to "Earlier"), **projects** (each with its own folder and a note that opens from here), what you're doing, things you said you'd come back to (with the date), work and study, about you, and (collapsed) health and money. Every memory has **Keep private**: it disappears from every screen and every AI and can only be brought back from Settings. |
| **Settings** | The AI helper (automatic, or your own local model), meaning search, privacy switches, words never to remember, pause memory, **private memories** (listed by id only; bring one back), import, backup and tidy, and how to uninstall. Look and feel always follow the app: there is nothing to pick. |

## What the AI decides by itself

* A clear new fact about you is saved and shows up in the feed. You can undo it.
* Something already known is not saved twice.
* Something that **contradicts** what is saved becomes one plain question. The
  old memory stays untouched until you answer. One message that disagrees in
  two places is still one question.
* Hedged words ("maybe I'll move to Canada") are kept as "not sure" until you
  say keep or skip.
* Anything that looks like a **password, API key or card number** is replaced
  with `[hidden]` before anything is stored, and is never filed. The rest of
  the same message is still kept ("my email password is … and I live in Dhaka"
  keeps Dhaka). Edits, journal entries and profile notes are cleaned the same way.
* Passing **moods and one-off events** ("so tired today") are kept, dated, in the
  Journal. They never contradict who you are, and they are never dropped.
* Something is only filed if **you** said it: what the AI helper extracts has to
  be supported by your own words, and the quoted evidence is hash-checked.
* A **to-do** ("I need to renew my passport") goes on your list; Hermes is told
  about open to-dos and due "come back to" dates at the start of a session, as
  data, never as an instruction.
* A project ("my bakery business") gets a folder, `Projects & Ideas/<Project>/`,
  with a note that gathers everything about it.
* People named in a message get a profile. Profiles are **never** joined by the
  AI; only you can say two are the same.
* The AI never answers your questions for you.

## Bringing old things in

Settings → Import accepts: a ChatGPT or Claude export (the `.zip` or
`conversations.json`), a WhatsApp chat export, a Telegram export (`result.json`),
Messenger or Instagram messages (the "Download your information" `.zip`, or a
`message_1.json`), or a notes file / pasted text (one memory per line or bullet,
or a Hermes `MEMORY.md`/`USER.md`). For chat exports you type your name as it
appears in the chat (Messenger and Instagram can work it out when you are in
every conversation). Long notes are split at sentence ends, not skipped. PDFs,
pictures and Word files are refused with a plain message. Originals are copied
untouched into `Sources/Files`. Importing the same export twice adds nothing,
and **undoing an import** removes its chats and the people it created.

## Install and remove (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

It copies the plugin into Hermes, creates the private write key, registers the
nightly clean-up and a startup item, and takes a first backup. Then **fully quit
and reopen Hermes** and open the Memory_OB tab. An existing older vault is
moved to the new layout automatically, after a verified backup zip is made.

```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1               # keep memories
powershell -ExecutionPolicy Bypass -File uninstall.ps1 -DeleteData   # also delete them
```

Either way a backup zip is made first, next to the memories folder.

**Updating from an older version:** extract the new files over the old folder,
run `install.ps1` again, then fully quit and reopen Hermes. The installer clears
out the few files the old version had that this one no longer uses, and your
existing memories are moved into the new layout after a backup zip is made.

## Command line

```
memory-ob init | capture "text" | search "words" | list | show <id>
memory-ob feed | doubts | answer <id> <new|old|both> | undo <number>
memory-ob import <file> | tidy | graph | embed | export
memory-ob stats | activity | models | doctor | serve | proxy
```

## Honest limits

* Conflicts are found by word and number rules ("I live in X" vs "I no longer
  live in X", 5 lakh vs 8 lakh); when an AI helper is available it also judges
  borderline cases. Without one, subtle contradictions can slip past. Nothing
  is lost when that happens: both memories are kept.
* Something said about a third party ("Karim paid 20k") waits for the AI helper
  unless it is about a project you already have.
* Projects are recognised from wording ("bakery business", "idea for a
  podcast"); an odd phrasing may not start one.
* Search always finds close word forms (allergy / allergic). Search by
  *meaning* needs a local embedding model and the "meaning search" switch in
  Settings; without it Settings says so. Ollama (`ollama pull nomic-embed-text`)
  and any OpenAI-compatible server work; llama.cpp's `llama-server` needs
  `--embeddings`, which `host/llamacpp_embed.py` starts for you. Memory_OB adds
  the `search_document:` / `search_query:` prefixes these models need, redoes
  the numbers by itself when you change the model (in the background, and every
  night), and never mixes numbers from two models.
* A memory you keep private is blanked in the saved conversations too, wherever
  they are shown. The raw database still holds it (that is how you bring it back).
* Model-dependent parts (the AI judge, extraction, biography) are tested with
  stand-ins here, not with a real model.
* New categories are fixed (Health, Money, Projects & Ideas, Work & Business,
  Learning, Plans, Interests, Life); the AI adds free-form tags and links
  inside them.
* A password written as ordinary words ("my password is blue banana") cannot
  be told apart from any other sentence.
* Windows only (the installer, startup item and nightly task).

## Where things live

```
Documents/Hermes/Memory_OB/        your memories (open this in Obsidian)
  Health/ Money/ Work & Business/ …   one folder per category
  People/  Journal/  Me.md            profiles, biography, "what is current"
  Sources/Conversations/              the raw conversations
  Sources/Files/                      untouched originals you imported
  .obsidian/  .brain/                 Obsidian settings; the private database,
                                      settings, write key and receipts
```

Source layout: `memory_ob/` (engine and API), `memory_ob/web/index.html` (the
screens), `provider/` (Hermes memory provider), `host/` (Hermes plugin shell,
installer, uninstaller, nightly run), `skills/` (agent skills), `tests/`.

## Tests

```
python run_tests.py        # everything, one command
```

`DESIGN.md` records the rules the engine will not bend and why.
