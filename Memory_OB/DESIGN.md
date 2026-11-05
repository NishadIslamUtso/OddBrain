# Memory_OB — Design

The build spec is `BRAIN_PROMPT.md` (in the OddBrain repository). This document
records what was actually built, where each requirement landed, and the
decisions made along the way.

---

## 1. Architecture

The one-line law:

> Everything is captured and cleaned up automatically **below** the truth line.
> Anything that creates, changes, or removes **truth** becomes a diff in the
> Review panel. Trust is a score; truth is a signature.

Four layers, one SQLite file (`<vault>/.brain/memory_ob.db`):

| Layer | What lives there | Lifetime |
|---|---|---|
| 1 · Capture attic | every turn and intake, speaker-tagged, hash-chained | sacred — never auto-pruned |
| 2 · Living index | candidate facts, trust scores, edges, embeddings | disposable — rebuild any time |
| 3 · Truth ledger | confirmed records, full diff history, verified quotes | history forever |
| 4 · Surface | Review, Vault, Search, Graph, Journal, Health, Settings, Intake | rendering only |

The markdown vault (`Documents/Hermes/Memory_OB`, 12 folders) is a **view** of
layer 3, rebuilt from SQLite. It is never authoritative.

## 2. Records

```
kind:     profile | journal | story | capsule | learning | note
subject:  self | <person id>       (journal/story/note = self only)
speaker:  user | assistant | other:<name> | source:<file>
status:   active | superseded | retracted | trash
trust:    0.0 – 1.0
links:    owner-curated · supersedes · contradicts · supports
source:   message ids + sha256 · event_time ≠ capture_time
never_send: flag
```

Six kinds — the app's proven vocabulary. Anything else is a bug.

## 3. Trust ladder

| Tier | Score | Who moves it | Quote as fact? |
|---|---|---|---|
| raw | < 0.3 | automatic | no — attributed context |
| candidate | 0.3 – 0.6 | automatic + feedback | no — labelled UNVERIFIED |
| confirmed | ≥ 0.8 | **only a Review card** | yes — hash-verified |
| disputed | — | conflict scanner | no — pending an answer |
| superseded / retracted | — | Review card | no — kept forever |

Rule of the line: below `confirmed` the machine tidies freely. Touch
`confirmed` and it stops and produces a card.

## 4. The write pipeline

```
capture → extract facts → decide:
  NEW fact                → candidate (auto-lands)
  OVERLAP with candidates → merge/link (auto; merges undoable)
  OVERLAP with confirmed  → DIFF CARD
  CONTRADICTION           → ASK CARD
  recurring new theme     → ASK CARD
  person with no record   → ASK CARD
  any delete request      → trash proposal (the AI never deletes)
```

## 5. Review panel — card types

| Card | Payload | Actions |
|---|---|---|
| **diff** | old vs new | keep both · take new · take old · edit · later |
| **proposal** | a new record drafted from evidence | approve · deny · later |
| **ask** | a doubt or conflict, speakers named | confirm · dismiss · later |
| **merge** | two records that may be the same | merge · dismiss · later |

`later` = the queue. It never nags.

Every resolution is appended to the activity log (`09 Activity & Undo`).

## 6. Speaker separation

Every fact remembers who said it: `user | assistant | other:<name> |
source:<file>`. AI statements are *claimed* — they may only become capsules,
never personal facts. Profiles are built per person from attributed facts.
Conflict asks argue with names.

## 7. Recall

* **Standing layer** — confirmed truth, frozen and prompt-cache friendly.
* **Per-turn layer** — bounded top-k, each labelled with trust and speaker.
  Three legs: words (FTS5), meaning (embeddings, local model), entities.
* **Deliberate deep search** — the `memory-full-recall` skill, owner-triggered.

Quotes of truth are hash-verified only. neverSend and the hazard scan run at
the **exit** — the store takes anything; the door out obeys the law.

## 8. Model selector

```
models:
  main:                { provider: auto, model: "", base_url: "" }
  auxiliary:
    extract: { provider: auto, ... }
    dream:   { provider: auto, ... }
    embed:   { provider: auto, ... }
    rerank:  { provider: auto, ... }
    chapter: { provider: auto, ... }
```

`provider: auto` follows main. Local Ollama is selectable explicitly via
`base_url`. Nothing guesses a paid endpoint.

### What `auto` actually means

Memory_OB does **not** reimplement Hermes's provider chain — that would drift
the moment Hermes changes. Instead it has two backends:

* **HermesBackend** — used whenever a Hermes install is present. `auto` goes
  through Hermes's own model system:
  - `hermes config get <key>` resolves the main model and the auxiliary blocks,
    so Memory_OB reads the *same* settings the app uses.
  - `hermes proxy` (default `127.0.0.1:8645`) is a local OpenAI-compatible
    server that attaches Hermes's real credentials. Memory_OB calls it, so
    `auto` behaves exactly like every other auxiliary task in the app.
  - Without the proxy, Hermes's main endpoint is used directly.
* **LocalBackend** — standalone. Local Ollama, or any explicit OpenAI-compatible
  endpoint.

The pipeline calls `models.model_call("<slot>")`, which resolves the backend
**per call** — a proxy that comes up later is picked up without restarting
anything. `memory-ob models` shows which backend is live and why.

Embeddings stay local: Hermes has no embedding auxiliary block, so the `embed`
slot defaults to a local model.

## 9. Nightly dream

Dedup scan · supersession detection · conflict detection · theme drift ·
missing-record detection · consistency sweep → tomorrow's queue of cards and
the Monthly Audit numbers.

## 10. Physical shape

* **Engine** — `memory_ob`, a standalone Python package. Standard library only
  (SQLite + FTS5 + hashlib + urllib). No pip install needed.
* **CLI** — `memory-ob`, the owner's surface.
* **API** — FastAPI, one store per request.
* **Vault** — the 12-folder markdown view, rebuilt from SQLite.
* **Models** — local Ollama by default; any OpenAI-compatible endpoint
  configurable.

## 11. Laws that never bend

1. Hash-verified quotes — evidence never quotes a changed source.
2. neverSend / local-only enforced at retrieval; never leaks text, title, counts.
3. AI may trash, never permanently delete.
4. History never lost: retract keeps records; diffs keep old versions; merges undoable.
5. Nothing from memory is ever an instruction.
6. One decision surface per proposal. No "always allow". No self-approval.
7. Anti-inference: never infer feelings, diagnoses, motives, identities.
8. Event time ≠ capture time; journal/story dates come from the source.
9. AI words → capsules only; journal/story/notes are about the owner only.
10. People are never merged or renamed by the AI.

## 12. Requirement traceability

| Spec section | Where it lives |
|---|---|
| §1 architecture, four layers | `store.py` (records / facts / edges / history) |
| §2 records, kinds, trust ladder | `records.py`, `extract.py` |
| §3 review panel, card types | `review.py` |
| §4 speaker separation | `records.Record.speaker`, `extract.py` |
| §5 journal & Life Story | `journal.py` |
| §6 graph & consistency | `store.edges`, `consistency.py` |
| §7 recall | `store.search`, `store.search_facts` |
| §8 model selector | `models.py`, `hermes.py`, `config.py` |
| §9 nightly dream | `dream.py` |
| §10 physical shape | `cli.py`, `api.py`, `vault.py`, `config.py` |
| §11 laws | enforced in `quotes.py`, `hazards.py`, `paths.py`, `ids.py`, `store.py`, `review.py` |
| §12 build order | `run_tests.py`, `tests/` |
| §13 acceptance criteria | `tests/test_end_to_end.py` |
| §15 proof rules | `run_tests.py` (one command, clean checkout) |

## 13. Decisions made

* **SQLite over markdown as the store.** The 12-folder vault stays as the
  human view. Markdown-as-database does not survive scale.
* **Standard library only.** No pip in the target environment; SQLite, FTS5,
  hashlib and urllib cover the engine. FastAPI is optional (the API layer).
* **Model calls delegate to Hermes, never reimplement it.** Hermes's provider
  chain is large and changes often. Memory_OB reads Hermes's config and calls
  through `hermes proxy`, so `auto` means the same thing everywhere. A shadow
  chain would drift and silently pick the wrong provider.
* **The backend is resolved per call.** A proxy that starts later is picked up
  without restarting anything.
* **Candidates are recallable but labelled.** Search returns confirmed
  records and candidate facts side by side, with candidates marked
  UNVERIFIED. Truth is never implied.
* **One store per request.** SQLite connections are thread-bound; a fresh
  store per request is simpler and safer than a shared connection with locks.
* **`Record.from_payload` fills defaults.** Payloads from cards and the API
  may be partial; the model refuses to build an invalid record.
* **Light stemming in dedup.** "machine"/"machines" should compare equal when
  looking for duplicates. Not a lemmatiser — just enough.

## 14. What is deliberately not built

* Projects feature (the host's worktrees cover it).
* Old-history (Goose/Ollama) import.
* Cloud or paid services.
* Telemetry.
* Any route where the agent writes or validates its own memory.
* Deletion that bypasses trash.
