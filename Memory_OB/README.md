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

## The model selector

Every slot uses the app's aux-model pattern — `provider / model / base_url`,
with `provider: auto` as the default:

```
main:                { provider: auto, model: "", base_url: "" }
auxiliary:
  extract: { provider: auto, ... }   # fact extraction on capture
  dream:   { provider: auto, ... }   # nightly consolidation
  embed:   { provider: auto, ... }   # embeddings (local model default)
  rerank:  { provider: auto, ... }   # optional result reranking
  chapter: { provider: auto, ... }   # Life Story drafting
```

### What `auto` actually means

Memory_OB does **not** keep a shadow provider chain. It has two backends:

* **HermesBackend** — used whenever a Hermes install is present. `auto` goes
  through Hermes's own model system: Memory_OB reads Hermes's config
  (`hermes config get …`) and calls through `hermes proxy` (a local
  OpenAI-compatible server on `127.0.0.1:8645` that attaches Hermes's real
  credentials). That is the same path every other auxiliary task in the app
  uses, so `auto` behaves identically everywhere.
* **LocalBackend** — standalone. Local Ollama, or any OpenAI-compatible
  endpoint you configure explicitly.

```bash
memory-ob models          # shows which backend is live and why
hermes proxy start        # start the bridge (Memory_OB detects it automatically)
```

The pipeline (capture, the nightly dream, chapter drafting) calls
`models.model_call("<slot>")`, which resolves the backend per call — so a
proxy that comes up later is picked up without restarting anything.

---

## Install

Requires Python 3.10+. The **library** is standard library only — `init`,
`capture`, `search`, `review` and the rest of the CLI run with no installs.
The **dashboard and the test suite** need three packages:

```bash
cd Memory_OB
pip install -e .[test]
python -m memory_ob.cli init
python -m memory_ob.cli doctor    # checks all of the above for you
```

A clean machine that skips the install can still use every CLI command; only
`serve`, the HTTP API and the tests will fail to import.

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
memory-ob dream                  # nightly consolidation → cards
memory-ob chapter                # draft a Life Story chapter → card
memory-ob embed                  # compute + cache embeddings
memory-ob stats
memory-ob activity
memory-ob export                 # render the vault
memory-ob models                 # the model selector
memory-ob doctor                 # is this set up right? (vault, store, token, backend)
memory-ob serve                  # run the dashboard (--host/--port)
```

HTTP API and the screens:

```bash
memory-ob serve                  # same as: python -m uvicorn memory_ob.api:app
```

Then open **http://127.0.0.1:8770/ui** — ten screens, themed with the
`--ui-*` variables so it can be embedded in Hermes Desktop later:

`Review` (diff / proposal / ask / merge cards) · `Vault` (all records) ·
`Search` (three legs) · `Graph` (typed edges) · `Journal` · `Notes` ·
`Health` (stats + monthly audit) · `Settings` (model selector + appearance) ·
`Intake` (capture, dream, chapter) · `Recall` (activity + sharing receipts).

The screens follow the host's `--ui-*` values live, so a change in the Hermes
Appearance settings lands without a reload. `Ctrl/Cmd+K` opens a command
palette over the screens and recent records; in `Review`, `j`/`k` move between
cards and `1`–`6` run the matching action.

Endpoints: `/api/health`, `/api/records`, `/api/records/{id}/history`,
`/api/search`, `/api/cards`, `/api/graph`, `/api/sweep`, `/api/audit`,
`/api/doctor`, `/api/dream`, `/api/chapter`, `/api/embed`, `/api/capture`,
`/api/activity`, `/api/journal`, `/api/models`, `/api/settings`,
`/api/appearance`, `/api/app-settings`, `/api/neversend`, `/api/export`.

### Search is three legs

1. **words** — FTS5 over title, body and tags
2. **meaning** — cosine similarity over cached embeddings (local model)
3. **entities** — tag / subject / speaker matches

Embeddings are computed on demand (`memory-ob embed`) and cached in SQLite.
When no embedding model is reachable the search silently degrades to words +
entities — it never claims to be semantic when it is not.

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
  models.py       the model selector + backends
  hermes.py       the Hermes bridge (config + proxy)
  embedder.py     the meaning leg (embeddings + 3-leg search)
  cli.py          the command line
  api.py          the HTTP API
  webui.py        the dashboard renderer (token/appearance injection)
  appearance.py   theme/accent/font/density, validated before storage
  doctor.py       health checks (backs `memory-ob doctor` and /api/doctor)
  settings.py     extended settings (.brain/settings.json)
  web/index.html  the ten screens (vanilla JS, token-based theme)
tests/
  test_laws.py         the trap suite
  test_pipeline.py     the layers
  test_hermes_bridge.py the Hermes bridge and backends
  test_search_and_wiring.py embeddings, 3-leg search, wired commands
  test_end_to_end.py   the whole-car acceptance suite
  test_appearance.py   appearance validation + endpoints
  test_doctor.py       doctor, record history, the serve command
  test_theme_safety.py the theme query string cannot inject markup
```

## Design

See `DESIGN.md` for the full architecture and the decisions behind it.
