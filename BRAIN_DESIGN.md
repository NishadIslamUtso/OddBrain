# Brain Design — the memory plugin structure (supersedes BRAIN_PLAN.md)

Built from everything we learned: Memory_OB's laws, Cognee's organization,
Hermes's machinery, and the best community plugins (holographic, chronicle,
cashew, hicortex, engram, memobase, mem0's AUDN cycle). Owner's three rules
designed into the core: living trust scores like the best ones — EXCEPT no
change to truth without a diff signed in the Review panel; speakers always
separated; doubts and conflicts come as questions.

## The one-line design

> Everything is captured and cleaned up automatically BELOW the truth line.
> Anything that creates, changes, or removes TRUTH becomes a diff in the
> Review panel. Trust is a score; truth is a signature.

## Four layers

```
┌─ 4 · SURFACE ────────────────────────────────────────────┐
│  Review panel (diffs · asks) · Vault view · Recall feed  │
├─ 3 · TRUTH ledger  ←── only through YOUR card ───────────┤
│  confirmed records · full diff history · verified quotes │
├─ 2 · LIVING index (automatic, disposable) ───────────────┤
│  facts · trust scores · dedup/supersede proposals        │
│  graph · embeddings — rebuildable any time               │
├─ 1 · CAPTURE attic (automatic, sacred) ──────────────────┤
│  every turn & intake, speaker-tagged, hash-chained       │
└──────────────────────────────────────────────────────────┘
```

- Attic is sacred (backed up; never auto-pruned). Index is disposable
  (delete + rebuild from the attic). Truth ledger keeps history forever.

## Record — one shape, five kinds

```
kind:     fact | episode | note | profile | learning
speaker:  user | assistant | other:<name> | source:<file>
trust:    0.0–1.0 score + tier label      never_send: flag
status:   active | disputed | superseded | retracted | trash
links:    supersedes · superseded_by · contradicts · supports
source:   message ids + sha256 of quoted text
confirmed_by: card id + timestamp (only set by the Review panel)
```

Kinds are five, not twelve. Folders in the vault are a VIEW (by kind/date),
never the database.

## The trust ladder

| Tier        | Who moves it                          | Quote as fact?            |
|-------------|---------------------------------------|---------------------------|
| raw (0.1)   | automatic                             | no — attributed context   |
| candidate   | automatic + feedback nudges (0.3–0.6) | no — labelled UNVERIFIED  |
| confirmed   | ONLY the Review card (0.9)            | yes — hash-verified       |
| disputed    | conflict scanner                      | no — pending your answer  |
| superseded / retracted | Review card              | no — kept forever, visible|

The rule of the line: below `confirmed` the machine tidies freely (merge,
link, decay). Touch `confirmed` — create, change, or retire — and it stops
and produces a diff card. The AI proposes; it never signs.

## Write pipeline (AUDN rerouted at the truth line)

```
capture → extract facts (background, local LLM) → decide:
   NEW fact                → candidate (auto-lands)
   OVERLAP with candidates → merge/link (auto, non-destructive)
   OVERLAP with confirmed  → DIFF CARD   (updates/supersede/conflict)
   CONTRADICTION           → ASK CARD    ("these disagree — which is right?")
   recurring new theme     → ASK CARD    ("make this a category?")
   person with no record   → ASK CARD    ("create a profile?")
   any delete request      → trash proposal (AI never deletes)
```

## Review panel — one surface, two card types

- DIFF CARDS: old vs new side by side (strikethrough vs underline). One
  click: keep both / take new / take old / edit / later. Logged; old
  versions never lost.
- ASK CARDS: doubts and conflicts with SPEAKERS NAMED ("You said A on
  Tuesday — the PDF says B"). Confirm / dismiss / later.
- LATER = queue. Never nags.

Every choice is appended to the activity log (who, when, what changed).
Undo = retract with history, never deletion.

## Speaker separation — always

Every fact remembers who said it. AI statements are "claimed", never
self-confirming. Profiles (user / assistant / people) are built per-speaker
from attributed facts. Conflict asks argue with names.

## Recall — how memory reaches the model

- STANDING layer (frozen, prompt-cache friendly): confirmed truth +
  hand-edited "who I am / how to work".
- PER-TURN layer: bounded top-k candidates, labelled trust + speaker.
  Three-leg search: words (FTS5) + meaning (local embeddings, computed in
  background and cached) + entities.
- Quoting truth = hash-verified only. neverSend + hazard scan run at the
  EXIT (retrieval boundary) — the store takes anything; the door out obeys
  the law.

## Nightly dream (cron)

Dedup scan · supersession detection · conflict detection · theme drift ·
missing-record detection → morning queue of diff cards and asks. Indexes
rebuild in the background. Memory cleans itself; you just sign.

## Physical shape

- ENGINE = our standalone library (SQLite + FTS5 + local vectors). Owned,
  testable; the trap suite lives here and runs green or nothing ships.
- HERMES PLUGIN = thin shell: memory provider (bounded prefetch per turn,
  async sync via spawn_context_thread, pre-compression checkpoint) +
  Review/Vault screens (theme variables only) + tools.
- VAULT FOLDER = readable markdown export (Documents\Hermes\Memory_OB),
  a rendering of the store — human-browsable, never authoritative.

## Laws that never bend (carried from Memory_OB)

1. Hash-verified quotes — evidence never quotes a changed source.
2. neverSend / local-only enforced at retrieval; never leaks text, title, or counts.
3. AI may trash, never permanently delete. Trash records at/by/reason/previous.
4. History never lost: retract keeps records; diffs keep old versions.
5. Nothing from memory is ever an instruction (hazard scan at the exit).
6. One decision surface per proposal. No "always allow".

## Build order

1. Engine library + trap suite (the laws as tests).
2. Extractor + candidate pool + trust scores (below-the-line automation).
3. Review panel with DIFF cards (the truth line).
4. Ask cards + nightly dream (conflicts, themes, missing records).
5. Hermes provider + screens (thin shell).
6. Vault export view.

Each step ships with its traps green. Step 3 is where authority starts
mattering; steps 1–2 cannot corrupt anything (nothing is truth yet).
