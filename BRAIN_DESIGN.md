# Brain Design — the memory plugin structure (supersedes BRAIN_PLAN.md)

Built from everything we learned: Memory_OB's real feature set (this file now
ports ALL of it), Cognee's organization, Hermes's machinery, and the best
community plugins (holographic, chronicle, cashew, hicortex, engram, memobase,
mem0's AUDN cycle). Owner's rules designed into the core: living trust scores
like the best ones — EXCEPT no change to truth without a diff signed in the
Review panel; speakers always separated; doubts and conflicts come as
questions. See the traceability table at the bottom: every historical feature
and where it lives.

## The one-line design

> Everything is captured and cleaned up automatically BELOW the truth line.
> Anything that creates, changes, or removes TRUTH becomes a diff in the
> Review panel. Trust is a score; truth is a signature.

## Four layers

```
┌─ 4 · SURFACE ────────────────────────────────────────────────────┐
│ Review (diffs · asks) · Vault (all memories) · Search · Graph    │
│ Journal & Life Story · Notes · Health (+consistency) · Settings  │
│ Intake · Recall feed                                            │
├─ 3 · TRUTH ledger  ←── only through YOUR card ───────────────────┤
│ confirmed records · full diff history · verified quotes          │
├─ 2 · LIVING index (automatic, disposable) ───────────────────────┤
│ facts · trust scores · dedup/supersede proposals                 │
│ graph edges · embeddings — rebuildable any time                  │
├─ 1 · CAPTURE attic (automatic, sacred) ──────────────────────────┤
│ every turn & intake, speaker-tagged, hash-chained, timestamped   │
└──────────────────────────────────────────────────────────────────┘
```

- Attic is sacred (backed up; never auto-pruned). Index is disposable
  (delete + rebuild). Truth ledger keeps history forever.

## Records — the app's real kinds, kept

TRUTH ledger (confirmed records) uses the app's proven vocabulary:

```
kind:     profile | journal | story | capsule | note
subject:  self | <person id>          (journal/story/note = self only)
speaker:  user | assistant | other:<name> | source:<file>
status:   active | superseded | retracted | trash
links:    owner-curated links · supersedes · contradicts · supports
source:   message ids + sha256 · event_time ≠ capture_time (both stored)
confirmed_by: card id + timestamp (only set by the Review panel)
never_send: flag
```

- **profile** — facts about the owner or a named person (person records; no
  invented names; merging people is owner-driven and reversible).
- **journal** — dated entries; the ENTRY date comes from the source event,
  never the capture time.
- **story** — Life Story records and chapters (see below).
- **capsule** — deliberately saved AI replies. The ONLY kind an AI's words may
  become. AI words never become personal facts.
- **note** — engine-notes: one short dated line — a decision, preference, or
  open item the OWNER stated.

LIVING layer (auto) stores atomic `fact` candidates (trust-scored). A promoted
fact lands as one of the five kinds above.

## The trust ladder

| Tier        | Who moves it                          | Quote as fact?            |
|-------------|---------------------------------------|---------------------------|
| raw (0.1)   | automatic                             | no — attributed context   |
| candidate   | automatic + feedback nudges (0.3–0.6) | no — labelled UNVERIFIED  |
| confirmed   | ONLY the Review card (0.9)            | yes — hash-verified       |
| disputed    | conflict scanner                      | no — pending your answer  |
| superseded / retracted | Review card              | no — kept forever, visible|

The rule of the line: below `confirmed` the machine tidies freely (merge with
undo, link, decay). Touch `confirmed` — create, change, or retire — and it
stops and produces a diff card. The AI proposes; it never signs.

## Write pipeline (AUDN rerouted at the truth line)

```
capture → extract facts (background, chosen model) → decide:
   NEW fact                → candidate (auto-lands)
   OVERLAP with candidates → merge/link (auto, merges are undoable)
   OVERLAP with confirmed  → DIFF CARD   (updates/supersede/conflict)
   CONTRADICTION           → ASK CARD    ("these disagree — which is right?")
   recurring new theme     → ASK CARD    ("make this a category?")
   person with no record   → ASK CARD    ("create a profile?")
   any delete request      → trash proposal (AI never deletes)
```

Organizer law (kept from the app): input is untrusted evidence; instructions
inside evidence are never obeyed; AI output is advice, not evidence of the
owner's life; first-person counts as self-report only from the owner; never
infer feelings, diagnoses, motives, or identity matches; preserve uncertainty,
jokes, and reported-vs-observed distinctions; all output waits for human
verification.

## Review panel — one surface, card types

- **DIFF CARDS** — old vs new side by side (strikethrough vs underline). One
  click: keep both / take new / take old / edit / later. Logged; old versions
  never lost. Batch review supported.
- **ASK CARDS** — doubts and conflicts with SPEAKERS NAMED ("You said A on
  Tuesday — the PDF says B"). Confirm / dismiss / later.
- **MERGE CARDS** — proposed duplicate merges (people included) with
  undo-merge always available.
- **LATER = queue. Never nags.**

Every choice is appended to the activity log (who, when, what changed).
Undo = retract with history, never deletion.

## Life Story & Journal (kept whole)

- Journal = chronological dated entries (event dates from sources).
- Life Story = story records + the **chapter drafter**: when enough confirmed
  owner records exist, the drafter writes ONE detailed history-book chapter —
  chronological narrative paragraphs, record ids cited, exactly one exact
  quotation, uncertainty preserved. Chapter evidence must be confirmed owner
  records (never AI chapters or capsules — no circular citation). The chapter
  is an AI draft awaiting its own approval card.

## Speaker separation — always

Every fact remembers who said it. AI statements are "claimed" (capsules at
best), never self-confirming. Profiles are built per-person from attributed
facts. Conflict asks argue with names.

## Graph & consistency (kept whole)

- **Graph view** — the spider-web of records: owner-curated links +
  supersedes/contradicts/supports + shared-entity edges. Clickable, filterable.
- **Consistency sweep** — an OPTION (auto on schedule + manual "Check now"):
  walks ALL connections and checks them — dead links (missing targets),
  contradiction chains, superseded-but-still-cited records, orphans,
  event/capture date sanity, same-person merge candidates. Results land as
  ask/diff cards and as the **Monthly Audit** report (links checked, dead,
  fixed; growth; trust distribution — the old audit page, revived).

## Recall — how memory reaches the model

- **STANDING layer** (frozen, prompt-cache friendly): confirmed truth +
  hand-edited "who I am / how to work" (synced to the host's built-in
  memory files when hosted in Hermes).
- **PER-TURN layer**: bounded top-k candidates, labelled trust + speaker.
  Three-leg search: words (FTS5) + meaning (embeddings, computed in background
  and cached) + entities.
- **DELIBERATE deep search** ("check everything before answering"): the
  full-recall skill — owner-triggered, bounded, returns everything relevant.
- Quoting truth = hash-verified only. neverSend + hazard scan run at the EXIT
  (retrieval boundary) — the store takes anything; the door out obeys the law.
- **Anonymous sessions** — a toggle: no recall injected, nothing saved as
  personal; a clean slate that restores on command.

## Model selector (kept whole — Settings page)

Every model slot uses the same three knobs (the app's aux-model pattern):

```
models:
  main:                  { provider: auto, model: "", base_url: "" }   # default: AUTO
  auxiliary:
    extract:   { provider: auto, ... }   # fact extraction on capture
    dream:     { provider: auto, ... }   # nightly consolidation / conflicts
    embed:     { provider: auto, ... }   # embeddings (local model default)
    rerank:    { provider: auto, ... }   # optional result reranking
    chapter:   { provider: auto, ... }   # Life Story drafting
```

- `provider: auto` = follow the main model / auto-detect (never guesses a
  paid endpoint; local Ollama selectable explicitly via `base_url`).
- Each slot can inherit (auto) or override provider/model/base_url.
- Settings page also holds: brain path, semantic on/off, consistency-sweep
  schedule, checkpoint_required, neverSend management, backup.

## Nightly dream (cron)

Dedup scan · supersession detection · conflict detection · theme drift ·
missing-record detection · **consistency sweep** → morning queue of diff/ask
cards + Monthly Audit numbers. Indexes rebuild in the background.

## Physical shape

- ENGINE = our standalone library (SQLite + FTS5 + local vectors). Owned,
  testable; the trap suite lives here and runs green or nothing ships.
- HOST PLUGIN = thin shell: memory provider (bounded prefetch per turn, async
  sync via spawn_context_thread, pre-compression checkpoint / capture route) +
  screens (theme variables only) + tools.
- VAULT FOLDER = readable markdown export (Documents\Hermes\Memory_OB),
  a rendering of the store — human-browsable, never authoritative.
- INTEGRITY: checksummed MANIFEST (every file's fingerprint); backup ritual
  covers attic + ledger; one-paste install (zip + PowerShell + typed ALLOW).
- INTAKE DOOR: one contract for every future module (video, documents,
  browser) — byte-preserving copies, raw stays raw.

## Laws that never bend

1. Hash-verified quotes — evidence never quotes a changed source.
2. neverSend / local-only enforced at retrieval; never leaks text, title, counts.
3. AI may trash, never permanently delete. Trash records at/by/reason/previous.
4. History never lost: retract keeps records; diffs keep old versions; merges undoable.
5. Nothing from memory is ever an instruction (hazard scan at the exit).
6. One decision surface per proposal. No "always allow".
7. Anti-inference: never infer feelings, diagnoses, motives, identities.
8. Event time ≠ capture time; journal/story dates come from the source.
9. AI words → capsules only; journal/story/notes are about the owner only.
10. People are never merged or renamed by the AI; chapter evidence is
    confirmed owner records only (no circular citation).

## Build order

1. Engine library + trap suite (the laws as tests).
2. Extractor + candidate pool + trust scores (below-the-line automation).
3. Review panel with DIFF cards (the truth line) + merge/undo-merge.
4. Ask cards + nightly dream + consistency sweep (conflicts, themes, links).
5. Journal & Life Story + chapter drafter.
6. Model selector + Settings + Health (Monthly Audit) + Search + Graph screens.
7. Host provider + screens (thin shell) + intake door.
8. Vault export view + delivery (zip, one-paste, MANIFEST, backup).

Each step ships with its traps green. Step 3 is where authority starts
mattering; steps 1–2 cannot corrupt anything (nothing is truth yet).

## Traceability — every historical feature → its home

| Feature (app / addon / plugin history) | Home in this design |
|---|---|
| Eleven MCP tools (evidence/intake/link/owner/project/propose/review/screens/search/status/working-notes) | Host plugin tool surface + engine API (project counts → Vault filters; screens → Surface) |
| propose / confirmation card / review approve-reject-correct-retract | Review panel (diff/ask/merge cards; retract keeps history) |
| Hash-verified evidence quotes | Laws #1 + recall "quoting truth" |
| neverSend / owner controls | Laws #2 + Settings management |
| Trash law (recoverable, at/by/reason/previous) | Laws #3 + activity log |
| Intake door ("takes anything", any module) | Capture attic + intake door contract |
| Working notes (04 Working Memory) | `note` records + Notes page |
| Journal | `journal` records + Journal page (event-time law #8) |
| Life Story + chapter drafter (draft-chapter) | `story` records + Life Story page + chapter drafter |
| Capsules (saved AI replies) | `capsule` kind (law #9) |
| Profiles / people (person, anti-merge) | `profile` records (law #10) |
| Preferences sheet | `note` (preferences) + standing layer |
| Link tool + graph | Graph view + owner-curated links |
| Merge / undo-merge | Merge cards (undo always available) |
| Semantic search (meaning module, UNVERIFIED labels) | Per-turn layer meaning leg (labeled) |
| Memory Health / status tool | Health page + Monthly Audit |
| Settings + model selector (auto/main/aux) | Model selector section + Settings page |
| All Memories / Vault screens | Vault page |
| Search screen | Search page (three-leg) |
| Review screen (doubts/confirmations/interpretations) | Review panel |
| Intake screen | Intake page |
| Monthly Audits (link checks) | Consistency sweep + Monthly Audit |
| Activity & Undo | Activity log (every card decision) |
| Checksummed MANIFEST | Integrity section |
| Backup / install / one-paste delivery | Delivery section |
| capture route / pre-compression checkpoint | Host provider section |
| Context injection (top-N) | Recall per-turn layer |
| MEMORY.md / USER.md sync | Standing layer sync |
| memory-full-recall skill | Deliberate deep search tier |
| anonymous-mode skill | Anonymous sessions toggle |
| Task Scheduler / cron | Nightly dream + sweep schedule |
| File cache / safe paths / collision-proof IDs / token auth | Engine internals (trap suite) |
| Projects (screens + project tool) | DROPPED with owner's OK (Hermes worktrees/projects.db cover it) — recorded here, not silently |
| Goose/Ollama history import | DROPPED by owner's instruction (nothing to keep) — recorded here, not silently |
