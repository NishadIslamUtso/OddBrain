# Memory_OB

Memory for Hermes that runs itself. **Tell it anything, in any order. It files
it, checks it against what it already knows, and only interrupts you when two
things really disagree.**

Your memories live on your computer: no cloud service, no accounts, no
tracking. They are plain markdown files in an Obsidian-style folder, so you can
open them in Obsidian (or anything else) at any time.

One honest exception: the AI helper that reads what you say. In **automatic**
mode it uses Hermes's own model, and if that model is an online one, your words
go there, exactly as they do when you chat with Hermes. To keep every word on
this computer, either pick your own local model in Settings or turn on **Keep
everything on this computer** (off by default). With that switch on and no local
model, Memory_OB still works, using simple rules instead of an AI. The switch is
enforced where the request is made: the only addresses that count as "this
computer" are `localhost` and loopback (`127.x`, `::1`), a name that merely points
somewhere else does not, a redirect to another host is refused, and Settings will
not save a non-local address while the switch is on (it says why).

---

## What you do

Nothing, mostly. Talk to Hermes (or paste something into Memory_OB) and it is
remembered. Open the Memory_OB tab only when you want to look, fix or search.

## The six screens

| Screen | What it is |
|---|---|
| **Review** | The only screen that ever needs you. Shows what was just remembered (one card per message you sent, with the list of what it filed; **Undo** one line or the whole card; a line you put back leaves the list, nothing greyed-out is left behind), **Waiting to be read** (anything the AI helper could not read yet, kept whole, in your words, with **Read now** and **Skip this one**), questions where something you said now disagrees with something remembered ("Which one is right?": use the new one / keep the old one / both are true / discard both; **every answer can be undone and the question comes back**), a few "not sure" items, and **Worth a look** (what the check-up found, see below). A box at the top lets you tell it something directly, and search covers everything. You can also say "forget that I like mangoes" there, or in a chat. |
| **Vault** | Your notes as folders and links. A folder tree on the left that opens and closes (the open/closed state is remembered, there is a collapse-all button, and **Ctrl+O** jumps to any note by name). Click a note to read it; hover a line to edit or delete just that line. A graph view shows how notes link (drag, zoom, show only what's around the open note, sliders for the forces, hide loose notes). Search takes Obsidian-style filters (`tag:#topic/health`, `path:Health`, `by:ai`, `-word`, `"exact phrase"`, `after:2026-01-01`, `has:revisit`, `is:orphan`, `type:memory`, `person:Riya`) and shows the matching lines, not just the file. Notes are by subject, not one file per sentence. The AI makes the folders, titles and links; you can edit anything. |
| **People** | A profile for everyone you talk about or talked to, on any platform, linked to the raw conversations. Two profiles that are the same person can be joined with one click (and un-joined from the feed). One profile can be marked **This is me** (or use **Add yourself**): it is pinned at the top as *You*, and anything said under your own name is understood as being about you. Removing a person asks whether their chats go too (group chats with other people always stay); undo brings everything back. |
| **Journal** | A professional biography of you, written from what is remembered (health and money are left out unless you allow them in Settings), plus dated journal entries. Edit it yourself and it is locked against AI rewrites until you unlock it. |
| **Me** | What is current: your **to-do list** (tick things off; they move to "Earlier"), **projects** (each with its own folder and a note that opens from here), what you're doing, things you said you'd come back to (with the date), work and study, about you, and (collapsed) health and money. Every memory has **Keep private**: it disappears from every screen and every AI and can only be brought back from Settings. |
| **Settings** | The AI helper (automatic, or your own local model, with a **Test the AI helper** button that asks it one small question so you know it really answers), meaning search, privacy switches, words never to remember, pause memory, **private memories** (listed by id only; bring one back), import, backup and tidy, and how to uninstall. Look and feel always follow the app: there is nothing to pick. |

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
* **The AI is the librarian.** With an AI helper it reads what you said, splits
  it into separate facts, picks the category, gives a note a short title when a
  subject deserves its own note ("Passport renewal", "Knee injury"), and spots
  the people. It is shown the titles of your existing notes so it adds to them
  instead of making near-copies. It may not invent names or details that are
  not in your words (that claim is dropped). With no helper it falls back to
  simple rules, and says which one filed each memory.
* A project ("my bakery business") gets a folder, `Projects & Ideas/<Project>/`,
  with a note that gathers everything about it. Anything tagged to a project
  always goes into that project's note.
* People named in a message get a profile. Profiles are **never** joined by the
  AI; only you can say two are the same.
* Something is only filed if **one real sentence of yours** backs it. A claim
  that mixes words from several sentences, takes a fact you said about someone
  else ("my sister lives in Rome") as a fact about you, or turns a wish ("I want
  to move to Rome") into a present-tense fact is dropped, and the log says why.
* A long message you send in one go ("info dump") shows up as **one summary card**
  ("Saved 7 things from your message"), not seven separate cards. The summary is
  only for display: everything in the message is still read, checked and filed
  one fact at a time, and Undo works on a single line or on the whole card.
* The **check-up** looks over what is saved and asks you only about what needs a
  human (see below).
* Say you did something and the matching to-do is **ticked off** ("I submitted my
  thesis proposal" closes "I need to submit my thesis proposal"). It only does
  this when exactly one open to-do fits; a "no", a plan or a maybe never ticks
  anything, and Undo is in the feed.
* Small talk ("thanks, that's all for now") is ignored, and two statements that can
  both be true ("budget for food 5000", "budget for rent 12000") do not trigger a
  question. "I'm based in Dhaka" next to "I live in Dhaka" is the same fact.
* The AI never answers your questions for you.

## The check-up

Review's **Worth a look** list and `memory-ob sweep` run the same check-up. The
word rules always do the looking. When an AI helper is available it gives a
**second opinion** on top: it can set aside a finding the rules got wrong, put a
finding in the right box ("the same thing twice" rather than "do not agree"), and
notice a pair the words missed (it looks at up to 30 new pairs per check-up and
remembers its answers, so it does not ask twice). It never changes a memory and
never answers a question for you, and every finding says who noticed it: simple
word rules, the AI helper, or both. `memory-ob sweep --no-ai` skips the helper. It
looks for:

* two memories that **disagree** (that slipped past the rules at the time),
* the same thing said **twice**,
* a to-do that has been open for **more than 45 days**,
* a saved quote that no longer matches the sentence it came from.

Private memories are never part of it: they are left out of the findings before
anything is written or shown, so the check-up cannot show their text on Review,
in the saved report or in the nightly output. If the memory behind a question
changed since the check-up ran (you edited it, forgot it, or answered it on
another screen), your click does nothing and says so, rather than acting on an
old answer.

Each finding is one plain question with one-click answers ("Keep the newer one /
the older one / Both are right"; "Keep just one / Keep both"; "Done / Still to
do / Not needed any more"; "Keep it / Forget it"). Nothing is changed until you
answer, and every answer that changes a memory can be undone from the feed. It also lists notes that
are not linked to anything (click to see them in the Vault with `is:orphan`);
that is only a list, never a question.

It also fixes **by itself**, and only tells you if something was wrong, these
things that have one right answer: notes that differ from the database (they are
rebuilt), a private memory that leaked into a note, a damaged database, and
original files that changed since import (verify only; it never rewrites a
fingerprint).

You can press **Check now** in Review, or let the nightly run do it (Settings, "Look over everything each night", on by default). If you already said "both are
true" to a question when it came up, the check-up will not ask again.

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

Either way a backup zip is made first, next to the memories folder. A backup
is checked before it is trusted, and restoring one refuses a damaged or
unsafe zip instead of half-restoring.

**Updating from an older version:** extract the new files over the old folder,
run `install.ps1` again, then fully quit and reopen Hermes. Each release lists
its own files in `RELEASE_FILES.txt`; the installer moves any older file that is
no longer on that list into a `_retired` folder (nothing is deleted, so you can
look or put one back), and your existing memories are moved into the new layout
after a backup zip is made. If Windows is using a temporary home folder for the
install, it warns you instead of installing into the wrong place.

## Command line

```
memory-ob init | capture "text" | search "words" | list | show <id>
memory-ob feed | doubts | answer <id> <new|old|both> | undo <number>
memory-ob import <file> | tidy | graph | embed | export
memory-ob stats | activity | models | doctor | sweep | serve | proxy
```

`sweep` runs the check-up from the terminal (`--no-fix` only reports).

## Honest limits

* **Who checks what.** The word rules always run first. A contradiction of the
  same fact with another value ("I live in Dhaka" / "I live in Sylhet") is
  settled by the rules. Anything else the rules flag (a changed number, opposite
  wording) is a guess, and when an AI helper is available it is asked about it
  too, with the closest saved memories: it can drop a false alarm, call it a
  repeat, or find a contradiction the words missed. If the helper fails or answers
  badly, the rules' answer stands, so a real contradiction is never lost. The
  question you see says who noticed. The check-up gets the same helper's second
  opinion (above). It does not read the whole vault. "Not sure" comes from wording
  ("maybe", "I think"), not from the AI doubting itself. Whether something is a
  passing moment ("I'm tired today"), a to-do or a finished to-do, and whether a
  line is about you or somebody else, is the AI helper's call when there is one
  and rules otherwise. The AI can only make the "is it backed by your own words"
  check stricter, never looser.
* **People and you.** Until you mark a profile as you, your own name is just a
  name: a line under it is read as being about someone else. Mark it (People →
  **This is me**, or **Add yourself**) and the name, its other names and your
  first name are read as "I" when saving and in the check-up, no second profile
  is made from your name, and the AI helper is told who is talking. Only one
  profile can be you; take it off first to move it. "My doctor lives in Dhaka" is
  about the doctor and never backs "I live in Dhaka", and your "I live in Dhaka"
  never backs "Rahim lives in Dhaka".
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
* The AI helper can be Hermes's model, Ollama, or any server that speaks the
  OpenAI way (llama.cpp's `llama-server`, LM Studio, vLLM). Memory_OB works out
  which kind an address is by itself.
* Reads on `localhost` are open (no key); only writing needs the key. Anyone who
  can run programs on your computer can read your memories through the app.
* A new memory is signed by the AI by design (it shows in the feed with Undo);
  there is no "ask me before saving" switch.
* On the first start after an upgrade, questions made by an older version are
  retired once, and a notice says so.
* Model-dependent parts (the AI judge, the librarian, biography) are tested with
  stand-ins here, not with a real model. The screens were tested in a real
  browser (Chromium), and the whole thing has not yet been run inside Hermes on
  Windows.
* Anonymous mode is the owner's switch: Hermes can read it or turn it **on**, but
  only you, in the app, can turn it off.
* New categories are fixed (Health, Money, Projects & Ideas, Work & Business,
  Learning, Plans, Interests, Life); the AI adds free-form tags and links
  inside them.
* A password written as ordinary words ("my password is blue banana") cannot
  be told apart from any other sentence.
* Windows only (the installer, startup item and nightly task).

## Where things live

```
Documents/Hermes/Memory_OB/        your memories (open this in Obsidian)
  Health/ Money/ Work & Business/ …   one folder per category; each has a general
                                      note plus notes by subject, with dated lines
  Plans/To-do.md                      your to-do list (open and done)
  Projects & Ideas/<Project>/         one note per project
  People/  Journal/                   profiles; monthly journal + Biography.md
  Sources/Conversations/              imported chats only (live chats stay in the app)
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
python release.py ../Memory_OB-update-N.zip   # build a release zip + RELEASE_FILES.txt
```

`tests/browser/` holds the browser checks (Chromium through Playwright:
light and dark, narrow screens, contrast, Vault, summary card, check-up, owner card). They
are not part of `run_tests.py`; see `tests/browser/README.md`.

`DESIGN.md` records the rules the engine will not bend and why.
