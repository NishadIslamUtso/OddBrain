# The Brain Plan — Memory_OB · Hermes · Cognee

One page of decisions, then the checklist everything must pass. Written for the
owner; built against by everyone. Privacy enforcement is deferred by owner
decision — the fields and hooks stay in place so it becomes a switch, not a
rebuild.

## 1. The arrangement

Four layers. **Authority flows down, data flows up. One writer only.**

```
UI        Vault · Review · Health · Working Memory · Settings   (Hermes desktop plugin + theme)
Authority Memory_OB engine                                     (propose is the ONE writer)
Index     Cognee-style graph + embeddings                      (disposable, rebuildable, writes CANDIDATES only)
Attic     state.db + intake archive                            (verbatim past, the source of truth)
```

- **The one rule:** nothing becomes a fact except through `propose` + owner
  approval. Cognee output is `authority: raw` candidates forever until promoted.
- **The index is disposable.** If it breaks, delete and rebuild from the Attic.
  Nothing that can crash sits between the owner and the files.
- **The Attic is sacred.** `sessions.auto_prune: false` (NOT `auto_archive` —
  different switch) on day one, or the 90-day default eats the journey.

## 2. What is taken from where

| From | Kept |
|---|---|
| **Memory_OB** | One writer (`propose`), hash-verified quotes, intake door ("takes anything"), trash law (AI never permanently deletes), history never lost, record kinds (memory / journal / capsule / life-story / working-note / raw evidence), neverSend fields, hazard scan (invisible + instruction-like text never reaches a model), 11-tool engine + 86/86 trap suite |
| **Cognee** | Knowledge graph + meaning search + connections + answers with sources; background ingest; visualization data (JSON payloads); `contradicts`-style conflict candidates → Ask queue |
| **Hermes** | Scratchpad + transcript attic (state.db), FTS5 search, prefetch/provider machinery, desktop plugin door, theme system, compression gates, free Nous Portal models (online days) + local models (offline days + ALL ingest) |

## 3. Screens (dark/gold, via theme variables — never hardcoded colors)

| Screen | Shows |
|---|---|
| **Vault** | ALL record kinds (memories, journal, capsules, life-story, attachments), keyword + semantic + graph search merged in one ranked list, hash-verified quotes, connection graph (auto graph + owner `link`s) |
| **Review** | Diffs, journey (attic search), Ask queue (conflicts / new categories / missing records), confirmations ledger (every promotion, rejection, retract keeps history) |
| **Health** | Counts, stale records, trash, semantic status, last index rebuild |
| **Working Memory** | The owner's notes-v1 (04 Working Memory) |
| **Settings** | Brain path, semantic endpoint, checkpoint_required, theme picker (dark/gold registered via THEMES_AREA) |

- Plugin styles with `var(--ui-*)` theme variables only → reskins with any theme.
- **Fallback viewer stays:** `brain-window.mjs` (host-free HTML). Data survives a
  broken plugin; screens need a second door. Plugin breakage on Hermes updates
  is documented and real.
- Plugin may import only `@hermes/plugin-sdk`, `react`, `react/jsx-runtime` —
  namespace-import + feature-detect every SDK export (named import of a missing
  export kills the module). Graph view is hand-built React or media-renderer.

## 4. Freshness — how the session "re-checks" memory

| Tier | What | When | Cost |
|---|---|---|---|
| Base | Durable facts (who the owner is, how to work) | Frozen at session start | Zero per turn — protects the prefix cache. ON PURPOSE |
| Per-turn recall | Topical, matches the conversation now | Every turn via `prefetch` | Bounded top-k, cached, skips trivial prompts. Sub-second (hard deadline 5s) |
| Deliberate search | The agent looks because prefetch missed | Rarely | One bounded tool call, hash-verified quotes |
| **Never** | Full vault re-read | — | Fills context, costs every turn, the thing that makes the owner complain |

Compression (threshold 0.50, protects first 3 / last 20 messages) can summarize
away per-turn recall → **durable facts live in base, topical in turns.**
`compression.checkpoint_required: true` + `on_pre_compress` implemented —
otherwise compression permanently drops context with no checkpoint.

## 5. Efficiency rules (hot path stays invisible)

1. Prefetch: top-k only, cached across turns, local search, no network, skip
   trivial prompts. Must beat the model call's own cost.
2. Snapshot stays frozen (prefix cache = the single biggest efficiency lever).
   Micro-compaction stays OFF (it breaks the cache every turn).
3. Embeddings computed once in the background, cached; a turn reads the cache.
4. Graph rebuild on a cron schedule, never inline in a turn.
5. Keyword search = FTS5, no model call.
6. ALL ingest (cognify-style extraction) runs on local models in the background —
   never through the free hosted tier (rate limits; 200+ calls per 100 chunks).
   Free Nous models = everyday chat when online; local qwen lineup = offline days.

## 6. Data flow

```
anything (chat · file · future module)
  → intake door (byte-preserving copy, raw-unconfirmed, hazard-scanned)
  → Attic (verbatim, searchable)
  → background Index build (candidates: entities, relations, summaries)
  → Ask queue (conflicts / recurring unmodeled categories / people without records)
  → owner confirms in Review → propose writes → Health/ledger records it
```

- Asks are Memory_OB records with full lifecycle (trash law applies to them too).
- Timezone: all dates stored UTC, displayed UTC+6 (owner).
- One-writer enforcement: serialize writes (cron scanner, session-end sync, and
  plugin UI all hit the store; `expectedRevision` collisions must queue, not fail).
- Backup ritual covers BOTH brain folder and state.db. The index is disposable;
  these two are not.

## 7. Build order

0. **Verify first (spend an hour, save a week):** provider local-install path
   (`memory.provider` requires catalog entry or manual install); plugin loads on
   the owner's Hermes version; Windows MCP handshake is OPTIONAL — the provider
   plugin is the real integration, MCP is the extra (Windows stdio MCP has a
   documented history of silent failures).
1. **Plugin skeleton** — sidebar row + `/brain`, empty Vault, vars-only styling.
   Read-only.
2. **Vault read** — render records from files, keyword search, hash-verified
   quotes, all record kinds. Still no writes.
3. **Import** — Goose + Ollama history (the one-time importer) so the past is in.
4. **Ask queue** — conflict scanner + queue + Review UI. The piece nothing else has.
5. **Provider** — prefetch + session-end sync via `spawn_context_thread` (bare
   threads silently write to the WRONG profile store — documented trap).
   `sync_turn` non-blocking. Session-keyed writes (resume/compression bug class).
6. **Settings + Health** — brain path contract, semantic endpoint,
   `checkpoint_required: true`, `sessions.auto_prune: false`, timezone.

Steps 1–3 are read-only and cannot corrupt anything. Step 5 is where authority
starts mattering. The 86/86 trap suite runs against the new host at every step —
a port that does not pass the traps is not a port.

## 8. Checklist (Rounds 1–3 merged — every open item)

**Must design before code**
- [ ] Search merge ranking (keyword + semantic + graph → one list)
- [ ] Ask record schema + lifecycle
- [ ] Brain path contract (config line: where the memory lives)
- [ ] Timezone handling (journal, life-story)
- [ ] Working Memory home (notes-v1) and life-story rendering in Vault

**Verify first**
- [ ] Provider manual-install path works on owner's machine
- [ ] Plugin loads on current Hermes build (import guards in place)
- [ ] MCP handshake (optional path) — expect Windows trouble; do not block on it

**Build-time traps (known to bite)**
- [ ] `spawn_context_thread` for all provider background work
- [ ] `compression.checkpoint_required: true` + `on_pre_compress`
- [ ] `sessions.auto_prune: false` (the attic is the journey)
- [ ] Session-keyed sync writes (/new · /resume · compression)
- [ ] Namespace-import + feature-detect SDK exports (update churn breaks plugins)
- [ ] Eleven tool names are hard-coded in five places — move together or don't rename
- [ ] Serialized writes across scanner / sync / UI
- [ ] Never hardcode colors; theme variables only

**Keep always**
- [ ] `brain-window.mjs` fallback viewer (second door for screens)
- [ ] Trap suite green at every step
- [ ] Built-in Hermes memory fully OFF (mirrored remove/replace blanks records)
- [ ] Backup ritual: brain folder + state.db

**Later (not memory)**
- [ ] Eyes (`qwen3-vl`) / Ears (Omni) in Hermes auxiliary model slots
- [ ] Intake door contract for future modules (video · documents · browser)
- [ ] Privacy enforcement switches (neverSend active, confirm-gate hard) — fields exist

## 9. The one open input

**The owner's PC: RAM and GPU (VRAM).** It sizes the local models (8B vs 27B
class), the ingest speed, and whether Eyes/Ears run alongside Brain. Everything
else above is decided.
