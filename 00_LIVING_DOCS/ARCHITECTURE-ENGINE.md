# ARCHITECTURE — your app is the FACE, Claude Code is the ENGINE

**Written 2026-10-15 for the owner. Plain words on purpose.**
One sentence: the app you already have (v0.1.2) becomes the window, and the
Claude Code you installed today becomes the muscle inside it — plus `agy` as a
second muscle you can switch to. Everything stays free.

---

## 0 · The cast (read this first)

| Name | What it is | Already on your machine? |
|---|---|---|
| **The face** | Your app's windows, screens, buttons. Yours. Change any time. | ✅ v0.1.2 |
| **The engine** | Claude Code — the worker that reads files, edits, runs commands, uses skills | ✅ installed today (v2.1.300) |
| **Brain (cloud)** | `gemma4:cloud` — the big free online brain | ✅ |
| **Brain (local)** | `qwen2.5-coder:3b` — the small unlimited offline brain (your seatbelt — keeping it) | ✅ |
| **Engine #2** | `agy` (Google's free agent CLI) — same job as Claude Code, different brand | ◻ pending a Windows check |
| **The socket** | One plug inside the app where ANY engine connects | 🔨 we build this |

Analogy for the whole doc: **your app is a car you designed. Claude Code and
agy are two engines that bolt into the same engine bay. Ollama is the fuel
pump. You drive; the engines do the lifting.**

---

## 1 · The picture

```
 ┌──────────────────────────────────────────────────────┐
 │  THE FACE  (your app — Electron window, your layout) │
 │                                                      │
 │  Chat · Today · Vault · Artifacts · Projects · Code  │
 │  Browsing Maps · Settings · approval cards           │
 └───────────────▲──────────────────────▲───────────────┘
                 │ events up            │ commands down
        ┌────────┴──────────────────────┴────────┐
        │  THE SOCKET  (new, inside the app)     │
        │  • picks the engine (CC or agy)        │
        │  • turns engine chatter into app events│
        │  • asks YOU for permission when needed │
        └───────┬───────────────────┬────────────┘
                │                   │
      ┌─────────┴────────┐  ┌───────┴─────────┐
      │ ENGINE #1        │  │ ENGINE #2       │
      │ Claude Code      │  │ agy (Google)    │
      │ (Agent SDK)      │  │ (added after    │
      │                  │  │  Windows check) │
      └─────────┬────────┘  └───────┬─────────┘
                └─────────┬─────────┘
                  ┌───────┴────────┐
                  │  FUEL: Ollama  │
                  │ gemma4:cloud   │  ← default (big, free slice)
                  │ qwen2.5:3b     │  ← fallback (small, unlimited, offline)
                  │ (9Router door  │  ← later: hundreds more free brains)
                  └────────────────┘
```

---

## 2 · What already exists and stays untouched

Your app was built in layers (this is *good* news today):

| Layer | Where it lives | Fate |
|---|---|---|
| Window + screens (React) | `src/renderer/` | **Stays. This is the face.** |
| Bridge (the only door between screen and machine) | `src/preload/` | Stays; grows a new `engine` door |
| Machine-side services (vault, artifacts, settings, keys, extension port) | `src/main/*` | Stays as-is |
| Provider system (talks to Ollama + cloud brains) | `src/main/cloud/` + `shared/lib/providers` | Stays; the engine reuses it |
| Your 11 skills, house rules, env wiring | `~/.claude/` | **Auto-loaded by the engine. Zero re-doing.** |

The old rule stands too: the screen never talks to the internet directly —
everything goes through the app's back room (`src/main`). The engine lives in
the back room. Safer, and it keeps the console clean.

---

## 3 · The Socket — what we build (the heart of this doc)

A new back-room module: `src/main/engine/`. It has three jobs:

### Job 1 — pick the engine (Settings gets an "Engine" switch)
- `claude-code` (default) · `agy` (when it lands) · later: 9Router door.
- Choice saved in the app's existing Settings file — no new config universe.

### Job 2 — adapter #1: Claude Code — DECISION FLIPPED 2026-10-15 (build)

Built on the **raw stream** (drive the installed CLI in its official
stream-json mode) instead of the Agent SDK, for four honest reasons:
(1) the SDK can't be exercised in my sandbox (its install needs a real agent
    round-trip to verify, and npm only proves it is published — `@anthropic-ai/claude-agent-sdk` 0.3.301 and `@anthropic-ai/mcpb` 2.1.2 are public), so I'd be coding its API blind —
the raw stream I can test here, and IS tested (12 wire tests);
(2) it drives the very CLI already verified on his machine (v2.1.300 +
gemma4:cloud) — zero new dependencies, version-matched;
(3) same auto-loaded skills/memory (`~/.claude` is the CLI's own home);
(4) it keeps the mods-panel door open (section 3's stretch goal becomes
step-free). The SDK remains the fallback if the wire ever fights back.
**How it actually works (updated after six judge reviews, all findings fixed
and tested — 298 tests green):** the adapter launches the CLI you already have
in its official stream mode and speaks its documented wire in both directions:

How a message flows, plainly:
1. You type in your app's chat.
2. The socket launches `claude --output-format stream-json --input-format
   stream-json --verbose --permission-mode manual --permission-prompt-tool
   stdio --model <brain>` in your chosen folder (the vault). The two
   permission flags are PROVEN required: without them the real CLI runs in
   "auto" mode and never asks — the reviewers demonstrated this.
3. The engine works. The wire **streams events back**: engine ready, reading
   file…, editing file…, wants to run a command…, retries when the brain is
   slow, and any tool failure — nothing is swallowed.
4. The face draws all of it — the work-order panel, the brain's name on every
   turn (so you always SEE when work goes to the free cloud), your cards.
5. When the engine wants a tool, it asks over the wire → **your app shows an
   Allow/Deny card** → the answer goes back down. A denial carries a message
   the real CLI accepts (bare denies were rejected — judges proved that too).
6. One engine process serves MANY tasks in a row — a finished task never
   blocks the next one, Stop always closes the turn, and the engine saying
   goodbye mid-word (no trailing newline) is still heard.

**Honest limits (no sugar):** launching the CLI costs a moment per session;
how *well* it works depends on the brain — the free cloud brain is good, the
tiny local one will be clumsy at heavy tool work; **automatic** cloud→local
failover is still OPEN (today you pick the brain in settings; the local one is
your manual seatbelt); and the round-trip has been proven by reviewers against
the real CLI binary — YOUR own run happens with the installer.

### Job 3 — adapter #2: agy (engine #2, same plug)
- **Gate first:** agy is Google's free agent CLI but its Windows support is
  unproven — I run that check before anything else (my job, not yours).
- If it passes: same socket, adapter translates its output into the same
  events. You switch engines in Settings like switching input sources.
- If it fails: recorded, parked, nothing else changes.

### The stretch goal (later, not now): mirroring mod panels
Because the engine IS the real CLI on the real wire, the road to mirroring
**mod panels** (the little screens mods draw) inside your window is short.
Revisited after the installer lands. Noted so we don't lose it.

---

## 4 · What happens to your eight screens

| Screen | Fate under the new architecture |
|---|---|
| **Chat** | Becomes the engine's face (streaming, approval cards live here) |
| **Today (07)** | Unchanged plan — but now reads REAL engine activity (real "what happened today") |
| **Projects (04)** | Unchanged — a project = a folder you open sessions in |
| **Vault (05)** | Unchanged — and the engine can finally *use* the vault (it reads local files!) |
| **Code (06)** | Gets real: actual engine edits with your before/after cards |
| **First-run (08)** | Reborn as the **init screen**: checks Ollama awake ✓, brains ✓, skills ✓, agy ◻ with install buttons — the "everything you want, initialized" screen, zero terminal |
| **Appearance (09)** | Unchanged — your layout freedom was the whole point |
| **Agent access / permissions** | Plugs directly into the socket's permission events |

Old TODOLIST items that **dissolve** (the engine replaces them): the MCP
bridge proposal (Claude no longer needs an outside door — it lives inside),
the "Claude Mods = the other half of the bridge" item. Items that **stay**:
everything about the vault, artifacts-as-files, Browsing Maps, real-data rule.

---

## 5 · Safety & the Free Gate

- **Permissions (as the code really is, post-review):** the engine runs in
  **manual mode** — EVERY tool use raises an Allow/Deny card in your app; the
  engine cannot run so much as a file edit without your click, and Stop is
  always one press away. What is still OPEN: making your Settings permission
  switches (the per-agent table) steer the engine's flags directly, and an
  undo button on an approved action. The engine's default workplace is your
  vault — with manual mode that means you approve every touch of your notes.
- **Mods warning carried over:** mods run with full machine access — only
  install ones you've eyeballed (that rule is already in the plan).
- **Costs, the whole architecture:**

| Piece | Cost |
|---|---|
| The engine (real CLI on the real wire), agy | $0 |
| gemma4:cloud (free starter slice) | $0 |
| local brain + Ollama | $0, unlimited |
| Skills, mods, the app itself | $0 |
| The ONLY paid thing, ever | an Anthropic subscription **if you someday say "buy"** — and then the official Desktop app's Code tab lights up too, as a bonus |

---

## 6 · Build order (one landing per turn, code only after your "go")

- [x] **6.2 — Engine spike, back room DONE 2026-10-15** — then **HARDENED the
      same day after six judge reviews**: permission flags pinned (cards now
      really fire), deny replies carry the CLI-required message, multi-turn
      (one engine serves many tasks), Stop can never wedge the panel, Bangla
      survives chunk splits (StringDecoder), final lines flushed, denials and
      retries and tool failures shown, model names validated against shell
      tricks, console rule enforces warnings. **298/298 tests, typecheck
      clean.** Remaining: HIS round-trip on his machine (the reviewers proved
      the wire against the real v2.1.300 binary; the owner run is the final ✅).
- [ ] **6.2b — Engine face.** One chat
      round-trip through YOUR app on gemma4:cloud; approval card works once.
      *Done when:* you watch the engine edit a file from your app's chat.
- [ ] **6.3 — agy check + adapter.** Windows check first; then same plug.
      *Done when:* Settings switches engines and both answer.
- [ ] **6.4 — Face pass.** First-run init screen (08 reborn) + wire Today/Code
      to real engine events; mockups stay the design authority.
- [ ] **6.5 — Installer.** You run ONE file; app + checks + brains land.
      *Done when:* OddBrain icon on your desktop, engine inside, $0 spent.

---

## 7 · What I cannot promise (the honest corner)

- The **free cloud brain's quota** is Ollama's to change — if it shrinks, we
  re-plan (that's the Free Gate rule), never pay quietly.
- **agy on Windows** is still a maybe until I run the check.
- Small local brain + heavy agent work = clumsy. It's the seatbelt, not the
  sports car.
- The Agent SDK is young software; if it fights us, the raw-stream fallback
  exists (section 3).

**Your only jobs in this whole plan: read this, say "go", run installers I
hand you, and keep being the person who says when something looks wrong.**

---

## The adapter structure (2026-10-15, evening) — how both CLIs plug in, and the next ones

Checked live against both GitHub repos. What each engine actually is, and the
seams the app uses to serve them through one socket:

### The engines, as they really are (verified 2026-10-15)

| | Claude Code | agy (Antigravity CLI) |
|---|---|---|
| GitHub | `anthropics/claude-code` (issues/docs; CLI closed-source) | `google-antigravity/antigravity-cli` (public repo, **proprietary** — no OSS license, install scripts + docs) |
| Binary | `claude` | `agy` (not `antigravity` — matters for scripting) |
| Since | — | **Replaced Gemini CLI 19 May 2026** (Go rewrite, Gemini CLI sunset for individuals 18 Jun 2026) |
| Models | aliases (`default best opus sonnet haiku fable opusplan`, `[1m]` suffixes) or exact names (`claude-opus-5-5`…); pick via `--model`, `/model`, `ANTHROPIC_MODEL`, settings `model` field; third-party slots remappable via `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU,FABLE}_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL` | **Fixed, plan-dependent list from its own model selector** (Gemini 3 family + plan-gated Claude/GPT-OSS). **No custom endpoint / no base URL — Ollama brains cannot plug into agy.** |
| Extensibility | skills, plugins, hooks, MCP, `~/.claude/` + project `.claude/` | skills (`.agents/skills/*.md` → slash commands), plugins (`~/.gemini/antigravity-cli/plugins/`), rules (`.agents/rules/`, `GEMINI.md`/`AGENTS.md`), MCP (`.agents/mcp_config.json`, `agy mcp …` subcommands), hooks, subagents |
| Auth | his Ollama brain door (free) / Anthropic account | Google account sign-in (keyring); free individual quota |

**Scam warning (told to him 2026-10-15):** fake repos named
`gemini-antigravity-cli` (e.g. testerlingcodo/…, Leeanninsular877/…) hand out
`.zip`/`.exe` "installers" — do not touch them. Official =
`github.com/google-antigravity/antigravity-cli` or the install script at
`antigravity.google/cli/install.sh`.

### The structure today (one plug, one socket)

```
shared/lib/engine.ts     the contract: EngineId, EngineSettings, MODEL_PATTERN,
                         EngineModelEntry, DEFAULT_ENGINE — engine-agnostic
main/engine/claudeCode.ts adapter #1: spawn args, brain-door env, PATH
                         prepend, stream-json → EngineEvents parser
main/engine/             adapter #2 lands here as agy.ts behind the same
                         EngineEvent stream (Windows check first: does agy
                         expose a non-interactive/JSON mode? if not: PTY)
main/index.ts            the doors: engine:pick / models / model /
                         pick-workspace / send / stop / onEvent
preload → renderer bridge → state/engine.ts (store) → EngineBay / panel /
                         composer — never talks to an engine by name
```

Rule the judges confirmed: **the UI names no engine.** Everything goes through
the contract, so a third engine is: one union member in `EngineId`, one entry
in the EngineBay list, one adapter file that emits the same EngineEvents, one
`engine:models` source — nothing in the face changes.

### What the contract already gets right, what agy forces us to fix

- ✅ `EngineModelEntry {name, cloud, sizeGB}` — fits both worlds: Ollama's
  local brains (offline, sized) and cloud brains (flagged). agy's selector
  models will arrive as cloud entries with no size.
- ✅ `MODEL_PATTERN` accepts aliases, `opus[1m]`, `gemma4:cloud`,
  `claude-opus-5-5` — every spelling both CLIs use.
- ⚠ **Per-engine model sources (next structural fix, agy forces it):**
  `engine:models` today asks the brain door (Ollama) regardless of chosen
  engine — correct for Claude Code, wrong for agy. The door becomes a
  per-engine route: claude-code → Ollama `/api/tags`; agy → agy's own model
  list (read from its config/`agy` CLI on his machine; plan-gated); a future
  engine → its own source. Until that route lands, the bay must say plainly
  that agy's brain list arrives with its Windows check.
- ✅ Offline: Claude Code (local binary) + local Ollama brain + this app =
  the whole loop runs with zero internet; the models door already labels
  local brains with sizes, so "offline-ready" is visible per brain.

### Adding engine #3+ (e.g. anything new) — the checklist

1. `EngineId` union += id; EngineBay list += entry (with honest availability).
2. `main/engine/<id>.ts`: how it spawns, its model flag, its event stream →
   EngineEvents (or PTY scrape if it has no JSON mode).
3. `engineArguments` + `engine:models` route for its model source.
4. Windows check on HIS machine (same gate as agy), then availability flips
   from "soon" to live in the bay.

---

## One input, many engines, constant results (2026-10-15, night) — the five boundaries

His question: every CLI has its own input system and hard-coded instructions,
every model has different restrictions — how does the app give constant
results, and how do artifacts / skills / plugins work across all of them?

The answer in one line: **the engines keep their nature; the app owns the
boundaries.** An engine's hard-coded instructions cannot be rewritten from
outside — and should not be. Every engine was built with OFFICIAL channels
for exactly this (CLAUDE.md / AGENTS.md / skills / rules / MCP), so the app
speaks each engine's language at five boundaries instead of fighting it:

### Boundary 1 — INPUT: one composer → each engine's native mouth
The composer's text + workspace + attachments are the app's input. The
adapter translates: Claude Code gets stream-json user turns; agy gets its
native input (PTY or its JSON mode, per the Windows check). The app never
emits engine-specific syntax from the face.

### Boundary 2 — INSTRUCTIONS: the house-rules compiler (LANDING 2026-10-15)
One canonical rulebook (identity / artifacts / approvals / style) lives in
the app. `shared/lib/houseRules.ts` compiles it per engine into the file that
engine already auto-obey's — `CLAUDE.md` for Claude Code, `AGENTS.md` for
agy — plus a per-brain footnote table (`modelHints`) that absorbs known
quirks of specific models so the owner never re-prompts around them.
`instructionBlock(engine, model)` = rules + footnote, deterministic, tested
(9 tests). The edit screen lands with the settings work; the compiler is the
source of truth from today. (This is the Phase-2 "house-rules CLAUDE.md"
leftover, now general to every engine.)

### Boundary 3 — RESTRICTIONS: same card, native approval, honest refusals
Permission models differ (CC permission prompts; agy approval rules). The
adapter maps each engine's native approval into THE one approval card, and
refusals surface as honest status lines (already built). Provider-level
restrictions are never bypassed — the app unifies the SURFACE, not the
censor. A model that says no shows the same card style as one that asks.

### Boundary 4 — CONSISTENCY: the ladder (what "constant results" really means)
1. **Same instructions everywhere** — the compiled house rules ride every
   engine identically (Boundary 2).
2. **Same output contracts** — artifacts are FILES in artifacts/, work
   happens in the chosen folder; the app verifies files, not prose.
3. **Same approval surface** — one card, every engine (Boundary 3).
4. **Verification over trust** — deterministic checks where possible (file
   exists, HTML renders); a second cheap local pass can judge open-ended work.
5. **Per-brain footnotes** — the quirk table absorbs model-specific drift.
Honest limit, on the record: two different brains will never write identical
prose. The app guarantees the CONTRACT (where things go, what counts as
done, what is never faked) and verifies it — not sameness of style.

### Boundary 5 — SKILLS / PLUGINS / MCP: one vault, projected per engine
- **Artifacts (already real):** the vault watcher surfaces engine-written
  files as live artifact cards — engine-blind by construction, because it
  watches the filesystem, not the engine's opinion. The house rules make
  every engine write artifacts the same way.
- **Skills:** the app's vault (shared/lib/skills.ts — markdown + frontmatter,
  exportable) becomes canonical. Projection: Claude Code →
  `~/.claude/skills/<name>/SKILL.md`; agy → `.agents/skills/<name>.md`
  (filename becomes its slash command). Formats are near-identical
  (name/description/body), so one skill deploys to both; import-on-first-run
  pulls his existing 11 CC skills in so nothing is lost.
- **MCP:** one server list in the app; projected to CC's config and agy's
  `.agents/mcp_config.json` (field names translated per engine).
- **Plugins (level 2, honest):** CC and agy plugin packaging differs, so
  level 1 = skills + rules + MCP (fully portable markdown/JSON); plugin-pack
  generation per engine comes after the agy Windows check confirms formats.
Direction of truth is one-way: app vault → engine folders. Engine folders
are deployment targets, and a change in the app re-deploys everywhere.

### Offline, in this structure
House rules, skills vault, engine binary, and a local brain (e.g.
qwen2.5-coder:3b) are all on-disk: the whole loop — instructions, work,
verification — runs with zero internet. Cloud brains stay badged.

---

## The freedom matrix and the throttle (2026-10-15, late night)

His questions: gemma already works through Claude Code — how do the offline
models run? Can he choose whichever engine for whichever model? And he wants
as few restrictions as possible.

### How offline models run (now and future)

The brain door (Ollama) serves every brain it has — cloud (`gemma4:cloud`)
and on-his-GPU local (`qwen2.5-coder:3b`, anything else he pulls) — through
one Anthropic-compatible mouth. Claude Code consumes that door; the app
points Claude Code at it. Offline is the SAME pipe with a local brain: engine
binary (disk) + app (disk) + local brain (disk) = the whole loop with zero
internet. Future models = whatever appears in the door appears in the bay's
picker automatically (`engine:models` reads it live). Next landing in this
line: a pull-models control in the bay (`POST /api/pull`) so "whichever
models I want" needs no terminal at all.

### The freedom matrix — the honest version

| engine | which models | why |
|---|---|---|
| Claude Code | **any brain in his door** (all of Ollama: local + cloud) + Anthropic's own if ever logged in | CC reads its brains from `ANTHROPIC_BASE_URL` — the app owns that |
| agy | Google's fixed, plan-dependent selector only | verified: no custom endpoint exists in agy; Ollama brains cannot plug in |
| engine #3+ | whatever that engine allows | the bay exposes each engine's real freedom, never a fake |

So: engine choice is free; model choice is whatever the CHOSEN engine truly
accepts. The app's rule: show the truth per engine, never a pickable lie.
(structural fix queued: `engine:models` becomes per-engine routed.)

### The throttle — fewer restrictions, the official way (LANDED 2026-10-15)

Verified against the CLI's real modes (manual/default → acceptEdits →
bypassPermissions, plus plan/auto/dontAsk). The EngineBay now carries a
three-step throttle, persisted, read by the launch line:

- **Ask me** (`--permission-mode manual`, the old behavior, still default)
- **Auto-edits** (`acceptEdits`: files change in the workspace unasked;
  other commands still ask)
- **Full speed** (`bypassPermissions`: everything runs unasked)

Honest limits, stated in the UI and here: even at full speed the engine's
own deny rules and guarded deletions (rm on /, ~, cwd parents) still block —
that is the engine keeping its nature, not the app adding restrictions. The
app writes NO deny rules of its own (the settings→flags defect stays
deliberately unfixed in the owner's favor: the app imposes nothing beyond
the engine's defaults). Model-level refusals are a brain property, not an
app property — open brains through his own door are already the
minimal-restriction path, and the house-rules quirk table absorbs their
habits. `ApprovalMode`/`PERMISSION_MODE` live in the shared contract; agy
inherits the same throttle when its Windows check lands (mapped to ITS
approval rules).

---

## Memory and the over-retrieval problem (2026-10-15, late night) — his question, answered

His worry: "it may just look up everything just to answer something that
isn't even related to the thing I asked." Correct worry — here is what each
engine actually loads (verified), and the four guards:

### What the engines load today
- **Claude Code:** memory files (user `~/.claude/CLAUDE.md`, project
  `CLAUDE.md` layers) ride along in EVERY session; skills load by their
  description line (only matching ones fire); conversation history stays
  inside a session — a fresh chat does NOT inherit it unless resumed.
- **agy:** same shape, Google's names — global `~/.gemini/GEMINI.md`
  (enforced across all workspaces), workspace `AGENTS.md`, `.agents/rules/`,
  skills by description.
- Both: memory is loaded wholesale — the ENGINE cannot tell relevance before
  it loads. That is the memory problem: irrelevant context rides along and a
  weak brain may then go searching everywhere on top of it.

### The four guards (what the app controls)
1. **Memory discipline is now a house rule** (landed): "Answer from what the
   conversation already contains first. Search and read only what the
   question needs — never sweep the workspace… memory/context files are
   background, not instructions." Projected into CLAUDE.md and AGENTS.md on
   every engine, so every brain gets the same leash.
2. **His standing instruction is now a house rule** (landed): "If you are not
   sure whether a step is needed, ask the owner instead of doing it — do
   nothing unnecessary." (He confirmed the Ask-first throttle stands.)
3. **Small worlds:** the engine works inside the folder he picked (or the
   vault) — a small, relevant world by construction. Fresh chat = fresh
   engine session; old context never bleeds in unless he resumes it.
4. **Visibility:** Browsing Maps already shows what was read and when; the
   turn card shows what the engine is doing live. Later: a context pane per
   turn (exactly which files/memory were loaded).

Honest limit: rules shape behavior, they cannot straitjacket it — a weak
brain may still over-search occasionally. The guards make it rare, visible,
and correctable (the rule text improves per brain via the quirk table).

### Where content restrictions actually live (his other clarification)
"Things it wasn't supposed to say" — refusals come from the MODEL, in two
places: its training (weights) and, for cloud brains, the provider's filter.
The app adds NONE and the CLI adds none of its own. The levers that exist,
honestly: (1) local open brains through his own door — no provider filter
exists at all, the model answers from its weights alone; (2) cloud brains
(gemma4:cloud) keep Google's filter no matter what the app does — that layer
is not ours to remove; (3) house rules strip moralizing/preference language
from the surrounding instructions. A weights-level hard refusal cannot be
lifted by any app — swapping the brain is the real lever, and the picker
makes that one click.
