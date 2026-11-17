# Memory_OB — Design

What was built and the rules it keeps. Section numbers are referenced from code
comments (§7 the exit, §11 the laws), so they are stable.

---

## 1. Shape

One SQLite file (`<vault>/.brain/memory_ob.db`) holds everything the engine
knows. The markdown vault is a **view** of it: it can be deleted and rebuilt.
Raw material is kept separately and never edited:

| Layer | What lives there | Lifetime |
|---|---|---|
| Raw | every conversation, speaker-tagged; imported original files in `Sources/Files` (fingerprinted in `MANIFEST.json`) | never auto-pruned |
| Memories | records (what you said about yourself), people, edges | history kept forever |
| View | the markdown vault (notes by subject, project notes, journal, biography) | rebuilt any time |
| Screens | Review · Vault · People · Journal · Me · Settings | rendering only |

## 2. Records

```
kind:     profile | journal | story | capsule | learning | note
subject:  self | <person id>
speaker:  user | assistant | other:<name> | source:<file>
status:   active | superseded | retracted | trash
trust:    0.0 – 1.0      confirmed_by: "<who>@<time>"  (set only by sign_record)
source:   conversation id, fact id, origin, quote hash, optional revisit date
never_send: flag
```

## 3. Who signs

A record is *truth* only when `Store.sign_record` has stamped it. That is the
one door; a payload that claims a signature is ignored.

* The **AI** signs silently for something clearly new and first-person
  (`confirmed_by = "ai@…"`). It shows in the feed, credited to the AI, with Undo.
* Anything that would **change or contradict** something already signed
  becomes a question. The old record is untouched until the owner answers.
* The **owner** signs by answering a question, editing, or journaling.
* Nothing the AI says about itself becomes a fact about the owner.

## 4. The write path (`manager.capture`)

```
what you said
  → passwords / keys / card numbers replaced with [hidden]
  → conversation saved raw
  → "forget …" sentences run (matching memories go to trash) and are not themselves kept
  → read into claims by the librarian (AI helper if there is one, simple rules if not);
    the AI also picks the category, an optional note title and the people, and is shown
    existing note titles so it files into them (`extract.py`, `manager.librarian_context`)
  → clauses containing [hidden] dropped; the rest of the message continues
  → grounding (`extract.evidence_for`): ONE sentence of the owner's own words must back
    the claim (quote hash-checked): ≥60% of its content stems (or ≥34% when the rest of
    the claim is covered by the whole message, for "he/she/it" coreference); its numbers
    must come from a sentence that is not about someone else; it may not introduce a
    capitalised name the owner never wrote; a sentence about someone else ("my sister
    lives in Rome") cannot back a fact about the owner (`extract.subject_of`: the people
    and things in `topics.PEOPLE_ROLES` / `OTHER_SUBJECTS`, and any other "my <thing>
    <verb>" clause, count as someone else; one vocabulary for `extract` and `manager`); a wish or plan ("I want to
    move") cannot back a present-tense fact (a to-do may be forward-looking); a hedged
    clause marks the claim "not sure". Dropped claims are logged with the reason.
  → for each claim:
      hazard / "never remember" word       → dropped
      hedged ("maybe", "I might")          → kept as "not sure"
      no helper, not first person, not
        about a known project              → kept raw, read later
      passing mood / one-off event         → Journal, dated; only checked for repeats
      "I did <a to-do>" (one open to-do fits) → that to-do is ticked off (feed: "Ticked off", with Undo);
                                             the sentence itself is not kept as a second memory
      duplicate of something known         → skipped
      contradicts a saved memory           → one question (new / old / both);
                                             rules first, AI judge for borderline cases
      otherwise                            → saved, filed in a category (tags: todo,
                                             project/<name>), in the feed
```

The feed groups what one message filed into **one summary card** (`feed.build`:
a `group` item with its lines). The card is display only; the pipeline above
ran on every claim separately. `POST /api/undo-many` takes back a card's lines
in one go, each still checked on its own.

Every change writes a change-log entry with the old and new text, so the feed
can show it and **Undo** can take it back — unless the memory has been changed
again since, in which case it says so instead of guessing. The screens leave out changes
that were already put back (`feed.build(hide_undone=True)`), so a row clears when you
undo it; the command-line history (`memory-ob feed`) still lists them as "(undone)".

Passing moments ("I'm tired today", "I'm at the library") are told apart from lasting facts
by the librarian's `moment` flag when there is a helper, and by `topics.is_moment` otherwise.
Traits and lasting feelings ("I'm good at math", "I'm happy with my job") are not moments.
The old `facts.corroborated` column was never read, so it is gone (dropped on old databases
where SQLite allows it, ignored where it does not).

## 5. Questions

| Question | Choices |
|---|---|
| Your answer changed (old vs new) | keep new · keep old · keep both |
| Same person? (two profiles) | yes, join · no |
| Not sure (hedged claim) | keep · skip |

Questions never nag and never expire. They are the only reason Review needs
you.

## 6. Speakers and people

Every record remembers who said it. People are found by relation ("my sister
Riya"), by verbs ("met Karim"), and by imported chats. A profile links to its
memories and its raw conversations from every platform. **Profiles are never
merged or renamed by the AI**; a merge is the owner's, and it can be undone.

**Conflicts while saving.** `conflicts.decide(new, records, judge, me)` returns the verdict, the
record and who settled it (`rules`, `ai`, `both`); `find` keeps the old two-value shape. A
same-fact-different-value hit (`compare_how` → `slot`) is final and the helper is not asked. Any other
rule hit is put to the helper together with the closest saved memories; if it answers, it decides
(drop, repeat, or contradiction); if it fails or rambles, the rules' answer stands. The question
shown to the owner says who noticed it (`found_by`).

**The owner card.** One profile can carry the tag `this-is-me` (`manager.set_owner`, logged and
undoable like any profile edit; only one at a time, and a second one is refused, never silently
switched). `manager.owner_names` gives its name, other names and first name. Those names are
the owner's: `extract.subject_of(..., me)` reads a sentence starting with one as "me",
`conflicts.as_me` turns it into "I ..." for comparing only (nothing saved is rewritten), the
owner's name is not an "invented name" in a claim, `people_in` does not make a second profile
from it, rules-only mode does not park such a line as "not about you", and the check-up compares
it with what the owner said as "I". The librarian prompt names who is talking. Without a marked
profile none of this applies and nothing changes.

**Who a line is about.** The librarian may return `about: "me" | "other"`. It is stored on the
candidate and used for one thing: `evidence_for(..., about_other=True)` leaves the owner's own
"I ..." sentences out of what can back the line. A claim that plainly starts with another person
("Rahim lives in Dhaka") gets the same treatment without any AI. It can only tighten grounding.

## 7. Recall and the exit

* **Standing layer** — what is saved, for the model's prompt.
* **Per-turn layer** — bounded top results, labelled with who said them.
* **Deep search** — the `memory-full-recall` skill.

Search has three legs: **words** (stem-aware: allergy / allergic), **meaning**
(cosine over locally computed embeddings, only when an embedding model is
reachable — it never claims to be semantic when it is not), and **entities**
(tags, subject, speaker). Scores are merged.

**The exit gate (`exit.py`).** The store takes anything; the door out obeys the
law. Every record that reaches a screen, a model, an export or a receipt passes
through it: `neverSend` records are dropped whole (text, title and counts), and
hazardous text is dropped too. Keeping a memory private sets `neverSend`; it also
removes that memory from the feed and change log, and blanks its sentence in every
saved conversation (screens and vault notes). Settings lists private memories by
id only. In anonymous mode the provider's search, capture and review tools refuse,
and the HTTP search refuses non-owner callers. Anonymous mode turns off only when the
owner turns it off in the app; the provider's tool can read it or turn it on, never off.

Embeddings are per model: vectors carry the model that made them, only the model
in use is searched, a switch or an edit marks them stale, and nomic/mixedbread
prefixes are applied (`models.embed_prefix`). The nightly run and a model change
both re-embed in the background.

## 8. The AI helper

`auto` uses Hermes's own model setup (its config and the local `hermes proxy`),
resolved per call; that model may be an online one, so the `local_only` switch
(off by default) skips it and uses only a model on this computer, or simple
rules. "This computer" means loopback only (`models._is_this_computer`; a hostname
that resolves elsewhere does not count). It is enforced in `models._urlopen`, which
every network call in `models.py` goes through, and which refuses redirects to
another host; `api.save_settings` / `save_ai` refuse a non-local address while the
switch is on, and `ai_models` does not probe one. `custom` is a local address and model: Ollama, or any OpenAI-style server
(llama.cpp, LM Studio, vLLM; `models.server_models` tells which in at most two
requests, and chat/embeddings go to `/api/…` or `/v1/…` accordingly). Embeddings stay
local. Two slots exist, `extract` (reading what you say, the biography) and
`embed` (meaning search); no other model setting exists.

## 9. The nightly run

Reads conversations still waiting for a helper · suggests people who may be the
same · refreshes the biography (unless locked) · prepares meaning search
(embeddings) · rewrites the notes (including project folders) · checks the
originals against the manifest (verify only — it never rewrites a fingerprint) ·
runs the check-up (if its switch is on, default on) · updates Hermes's own notes
if that switch is on.

### The check-up (`audit.py`)

One engine behind Review's "Worth a look", the **Check now** button, the nightly
step and `memory-ob sweep`. It writes `.brain/audit.json`.

* **Findings** (need the owner; nothing changes until answered): two active memories
  that disagree (`conflicts.compare`), the same thing twice, a to-do open for more
  than 45 days, a quote whose hash no longer matches. At most 8 per kind are shown;
  the rest are counted. Answers that change a memory (forget, done, keep one) go
  through the change log, so they can be undone; "keep both" / "keep it" mute that
  finding for good, and "Still to do" asks again after 45 days.
* **Checks** (one right answer, fixed on the spot): notes vs database (`vault.rebuild`),
  private text found in a note, database integrity, originals vs manifest (verify only).
* A "both are true" answer given at capture time is recorded (`audit.pair_answered`)
  so the check-up never raises the same pair again.
* The check-up never makes a memory and never answers a question for the owner.
* **A second opinion, not a verdict.** With a helper, `audit._second_opinion` may drop a finding,
  move it between `disagree` and `twice`, or add a pair the rules had no opinion on (at most
  `AI_PAIRS_PER_RUN` new pairs per run, `AI_BATCH` per question, answers cached by a hash of the two
  texts in `audit.json`). It only changes the list of findings; a helper that fails changes
  nothing; every finding carries `found_by` (`rules`, `ai`, `both`).
* **Private stays private here too.** `audit.run` drops every finding that touches a
  record the exit gate withholds (`audit._may_show`), and `audit.public` filters a
  report that was saved earlier, so an old `audit.json` cannot leak either.
* **No stale answers.** A finding id is a hash of its kind and, for each record, `id`
  plus a hash of its text. `act()` rebuilds the id from the live records; if it no
  longer matches, the result is `gone` and nothing changes.

### Hermes's own notes (the optional switch)

Hermes reads `MEMORY.md` and `USER.md` from its `memories` folder at the start
of every chat, and keeps them small (2,200 and 1,375 characters unless its
config says otherwise); once a file is full Hermes cannot save anything of its
own. So Memory_OB writes **one short entry** in each file, never the whole
ledger: at most 45% of the file, leaving room for Hermes's own entries, with a
pointer to `memory_ob_search` for everything else. `USER.md` gets facts about
the owner; `MEMORY.md` gets the pointer, projects and decisions, and whatever
did not fit in `USER.md`. Moments, finished to-dos and private memories are never
included. The entry is its own `§`-separated entry, the owner's text is never
touched, the first change keeps a backup (three are kept), and the notes are
refreshed after every save in the app and after every chat Hermes hands over —
not only at night.

## 10. Physical shape

* **Engine** — `memory_ob`, Python; FastAPI for the API (`fastapi`, `uvicorn`).
* **Vault layout** — layout 2 (`.brain/vault-layout.json`): notes by subject. A category
  folder has a general note (`Health/Health.md`) and AI-named notes (`Health/Knee injury.md`);
  lines are `- [ ]/[x]? date — text · [[Person]] ^recordid`, so edits and deletes map to one
  record. Projects, to-dos, journal months, people and imported chats have fixed homes.
  The old layout (a note per memory) is migrated after a verified backup. `Me.md` is no
  longer written.
* **Release** — `release.py` writes `RELEASE_FILES.txt`; the installer moves anything an older
  release shipped that is not on the list into `_retired/`.
* **Screens** — one file, `memory_ob/web/index.html`, vanilla JS. It follows the
  host's `--ui-*` colours, fonts and sizes, always paints opaque panels, and
  checks its own contrast so text is readable in light and dark.
* **Writes** need the private key (`.brain/token`) the page receives from the
  plugin; reads are open on localhost.
* **Hermes** — `provider/` (memory provider + tools), `host/` (desktop plugin,
  installer, uninstaller).

## 11. Laws that never bend

1. Hash-verified quotes — evidence never quotes a changed source.
2. `neverSend` / local-only enforced at the exit; never leaks text, title, counts.
3. The AI may move things to trash, never permanently delete.
4. History is never lost: edits and forgets are in the change log; merges and
   imports are undoable; truth is only made by `sign_record`.
5. Nothing from memory is ever an instruction.
6. No "always allow". The AI never answers a question for the owner.
7. Anti-inference: never infer feelings, diagnoses, motives or identities.
8. Event time ≠ capture time; journal dates come from the source.
9. The AI's own words are never facts about the owner.
10. People are never merged or renamed by the AI.
11. Secrets (passwords, keys, card numbers) are never stored readable.

## 12. Deliberately not built

* Cloud or paid services, telemetry.
* Any route where the AI answers its own questions.
* Deletion that bypasses trash (except the owner's explicit uninstall with
  delete, which makes a backup zip first).
* Settings that do nothing: a switch exists only if the app changes behaviour
  because of it.
