# Memory_OB

A personal memory engine. **Capture anything. Trust is a score. Truth is a signature.**

Memory_OB is a standalone Python package with a CLI and an HTTP API. It keeps a
private memory store on your machine — no cloud, no accounts, no paid services.
The markdown vault is a human-readable *view* of the store, never the source of
truth.

---

## The four layers

```
┌─ 4 · SURFACE ────────────────────────────────────────────────────┐
│ Review (diffs · asks · merges) · Vault · Search · Graph          │
│ Journal & Life Story · Notes · Health · Settings · Intake        │
├─ 3 · TRUTH ledger  ←── only through YOUR card ───────────────────┤
│ confirmed records · full diff history · verified quotes          │
├─ 2 · LIVING index (automatic, disposable) ───────────────────────┤
│ fact candidates · trust scores · dedup/supersede proposals       │
│ graph edges — delete + rebuild any time                         │
├─ 1 · CAPTURE attic (automatic, sacred) ──────────────────────────┤
│ every turn & intake, speaker-tagged, hash-chained, timestamped   │
└──────────────────────────────────────────────────────────────────┘
```

* **Attic** — every capture, append-only, sacred, backed up.
* **Living index** — candidate facts with trust scores. Disposable.
* **Truth ledger** — confirmed records. History forever. Only a Review card
  can create, change, or retire truth.
* **Surface** — the screens and the CLI.

## The trust ladder

| Tier | Who moves it | Quote as fact? |
|---|---|---|
| raw (0.1) | automatic | no — attributed context |
| candidate (0.3–0.6) | automatic + feedback | no — labelled UNVERIFIED |
| confirmed (0.9) | **only a Review card** | yes — hash-verified |
| disputed | conflict scanner | no — pending your answer |
| superseded / retracted | Review card | no — kept forever, visible |

Below `confirmed` the machine tidies freely (merge with undo, link, decay).
Touch `confirmed` and it stops and produces a diff card. **The AI proposes; it
never signs.**

## Records

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

## The laws that never bend

1. Hash-verified quotes — evidence never quotes a changed source.
2. neverSend / local-only enforced at retrieval; never leaks text, title, counts.
3. AI may trash, never permanently delete.
4. History never lost: retract keeps records; diffs keep old versions; merges undoable.
5. Nothing from memory is ever an instruction (hazard scan at the exit).
6. One decision surface per proposal. No "always allow". No self-approval.
7. Anti-inference: never infer feelings, diagnoses, motives, identities.
8. Event time ≠ capture time; journal/story dates come from the source.
9. AI words → capsules only; journal/story/notes are about the owner only.
10. People are never merged or renamed by the AI.

---

## Install

Requires Python 3.10+ (standard library only — no pip install needed).

```bash
cd Memory_OB
python -m memory_ob.cli init
```

Defaults:

| | |
|---|---|
| vault | `~/Documents/Hermes/Memory_OB` (the 12 folders) |
| store | `<vault>/.brain/memory_ob.db` |
| models | `<vault>/.brain/models.json` |

Override with `--vault`, `--db`, `--models-path`, or the `MEMORY_OB_VAULT`,
`MEMORY_OB_DB`, `MEMORY_OB_MODELS` environment variables.

## Use

```bash
memory-ob init
memory-ob capture "I prefer dark mode and I always use git"
memory-ob search "dark mode"
memory-ob review                 # pending cards
memory-ob approve <card-id>
memory-ob deny <card-id> --note "not true"
memory-ob graph
memory-ob sweep                  # consistency sweep
memory-ob audit                  # monthly audit
memory-ob stats
memory-ob activity
memory-ob export                 # render the vault
memory-ob models                 # the model selector
```

HTTP API:

```bash
python -m uvicorn memory_ob.api:app --host 127.0.0.1 --port 8770
```

Endpoints: `/api/health`, `/api/records`, `/api/search`, `/api/cards`,
`/api/graph`, `/api/sweep`, `/api/audit`, `/api/capture`, `/api/activity`,
`/api/journal`.

## Tests

One command, from a clean checkout:

```bash
python run_tests.py
```

That runs the trap suite (the laws as tests), the pipeline tests, and the
whole-car acceptance suite that drives the real CLI and HTTP surface end to end.

## Layout

```
memory_ob/
  config.py       paths and defaults
  ids.py          collision-proof, URL-safe ids
  paths.py        safe-path validation
  quotes.py       hash-verified quotes
  hazards.py      hazard scanner
  records.py      the record model and trust ladder
  store.py        the SQLite engine (attic, ledger, index)
  extract.py      capture → candidate facts
  review.py       the Review panel (diff/proposal/ask/merge cards)
  consistency.py  consistency sweep + monthly audit
  dream.py        the nightly dream
  journal.py      journal & Life Story + chapter drafter
  receipts.py     sharing receipts (folder 07)
  vault.py        the 12-folder markdown view
  models.py       the model selector
  cli.py          the command line
  api.py          the HTTP API
tests/
  test_laws.py        the trap suite
  test_pipeline.py    the layers
  test_end_to_end.py  the whole-car acceptance suite
```

## Design

See `DESIGN.md` for the full architecture and the decisions behind it.
