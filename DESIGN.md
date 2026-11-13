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
| View | the markdown vault, `Me.md`, the biography | rebuilt any time |
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
  → read into claims (AI helper if there is one, simple rules if not)
  → clauses containing [hidden] dropped; the rest of the message continues
  → grounding: a claim must be supported by the owner's own words (quote hash-checked)
  → for each claim:
      hazard / "never remember" word       → dropped
      hedged ("maybe", "I might")          → kept as "not sure"
      no helper, not first person, not
        about a known project              → kept raw, read later
      passing mood / one-off event         → Journal, dated; only checked for repeats
      duplicate of something known         → skipped
      contradicts a saved memory           → one question (new / old / both);
                                             rules first, AI judge for borderline cases
      otherwise                            → saved, filed in a category (tags: todo,
                                             project/<name>), in the feed
```

Every change writes a change-log entry with the old and new text, so the feed
can show it and **Undo** can take it back — unless the memory has been changed
again since, in which case it says so instead of guessing.

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
id only. In anonymous mode the provider's search, capture and review tools refuse.

Embeddings are per model: vectors carry the model that made them, only the model
in use is searched, a switch or an edit marks them stale, and nomic/mixedbread
prefixes are applied (`models.embed_prefix`). The nightly run and a model change
both re-embed in the background.

## 8. The AI helper

`auto` uses Hermes's own model setup (its config and the local `hermes proxy`),
resolved per call. `custom` is a local Ollama address and model. Embeddings stay
local. Two slots exist, `extract` (reading what you say, the biography) and
`embed` (meaning search); no other model setting exists.

## 9. The nightly run

Reads conversations still waiting for a helper · suggests people who may be the
same · refreshes the biography (unless locked) · prepares meaning search
(embeddings) · rewrites the notes (including project folders) · checks the
originals against the manifest (verify only — it never rewrites a fingerprint) ·
updates Hermes's own notes if that switch is on.

## 10. Physical shape

* **Engine** — `memory_ob`, Python; FastAPI for the API (`fastapi`, `uvicorn`).
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
