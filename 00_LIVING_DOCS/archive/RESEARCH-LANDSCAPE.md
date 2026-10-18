
## 2026-10-16 (evening) — the "what do we use permanently" sweep (his paste: CLIs + Manus + Replit)

His pasted convo compared Claude Code / Ollama / OpenCode / Pi / Aider / Kilo + free-token
routes, and asked for manus/replit-style research on top. Verified against 2026 sources;
one big CORRECTION to the paste, then verdicts.

### The correction that changes the plan
- The paste claims "Gemini CLI / Antigravity CLI: 1,000 free requests/day". That ended
  **2026-06-18**: the Gemini CLI free tier was folded into the Antigravity CLI (the `agy`
  binary — OUR second engine). Community testing puts Antigravity's free tier near
  **~20 requests/day**, not 1,000 (vpsmac 2026-06-03; tembo.io 2026-07-12; codemyspec).
  Consequence: agy stays the free GOOGLE fallback, never the daily driver; the paste's
  "millions of free tokens via Google login" is out of date.

### Verdicts for the APP (the permanent roster — stays THREE doors, still fixed)
- **claude-code** — keep as the primary cloud-agentic engine (the paste's own verdict:
  best agent loops; OpenCode's author community agrees the loop behavior is the moat).
- **Ollama door** — keep: unlimited local/offline brains; the only path that never bills.
- **agy (Antigravity)** — keep as the free Google fallback WITH honest expectations
  (~20/day). Its Windows check (plan 6.3) stays; the Engines UI should say the quota is small.
- **OpenCode / Aider / Pi / Kilo / Goose: NOT engines, permanently.** They are harnesses —
  terminals that compete with this app for the same job. Adding one as an "engine" would
  make our app a launcher for another app's UI. Our app IS the harness; the roster stays
  engines-that-plug-in. (Same logic as the judge list's no-duplication guard.)

### What to take from each (ideas only; rubric-checked)
- **Replit Agent — checkpoints/rollback**: auto-snapshot before risky engine fixes, with
  "rollback to here". Their rule worth copying verbatim: a checkpoint is created
  **before attempting fixes for critical issues** (docs verified 2026-08). Maps to our
  diff cards + undo work; candidate: a git snapshot of the workspace folder before any
  write-beyond-edits task. QUEUED-candidate.
- **Manus — scheduled tasks**: their scheduler (daily/weekly/monthly agent jobs) is the
  generalized form of our month-roll audit. Candidate only with his explicit yes — the
  app's rule is "opening the app is the schedule"; a user-facing scheduler would be a new
  decision, not a quiet add.
- **Manus — Wide Research**: hundreds of parallel agents merged into one table. Maps to
  the subagent queue; a "fan out over a list, merge into a table" task shape. PARKED.
- **Manus — the lesson**: credit burn unpredictability is their worst review point. Ours:
  usage stays on every card; never invent a token number.
- **OpenCode — compaction/summarization** of long sessions; **LSP wiring** for code
  context; **local client/server with an OpenAPI-documented door**. Compaction is the
  strongest candidate (long chats today just grow). QUEUED-candidate.
- **OpenCode — provider freedom**: 75+ providers via one config. We stay two-protocol
  (Anthropic-wire engine + Ollama door + provider keys) — freedom via the keys pane, not
  via 75 integrations to maintain.
- **Aider — repo map + every-edit-is-a-commit**: the repo-map idea feeds Code-in-Projects
  (engine context for big folders); commit discipline matches the handoff/undo rules.
  QUEUED-candidate (repo map as a vault/code context door).
- **Kilo** — cross-surface carryover (terminal ↔ IDE ↔ cloud); nothing to take while we
  are desktop-only. **Pi** — minimal-core + manual plugins: we already are that (mods).
- **Free-token reality 2026-10**: agy ~20/day; Copilot free ~2,000 completions/mo (not
  wired for us); OpenRouter rotating free models + Groq free tier = real but they are
  OpenAI-compatible — our engine currently rides the Anthropic wire, so those keys power
  the Models pane today, engine routing for them is NOT built (future door decision).
  Claude Pro/Max subscription login inside claude-code remains the cheapest heavy path.

### Bottom line (his question: "use permanently for versatility")
The permanent trio is **claude-code + Ollama + agy** — cloud-agentic, unlimited-local,
free-Google-fallback. Everything else in the paste is either an idea source (taken above)
or a competing harness (not an engine). The touch-install flow, when he approves it,
covers exactly these three, each through its own official installer, on permission cards.
# RESEARCH-LANDSCAPE.md — what similar repos are doing, and what's worth taking

**Written 2026-10-16**, after his order: "check all the GitHub repos similar
to this and tell me what's worth taking." Live-researched; license noted on
every row because we take IDEAS from MIT/Apache repos and nothing from AGPL
or proprietary ones.

## The Claude-Code-app landscape

| Repo / app | License | What it is | Verdict for us |
|---|---|---|---|
| **Nimbalyst** (github.com/nimbalyst/nimbalyst, ex-Crystal) | MIT | Visual workspace: session kanban, parallel agents in git worktrees, red/green diff review with accept/reject per change, WYSIWYG editors (markdown/Mermaid/Excalidraw/CSV/Monaco), task tracker agents read+write, session↔file links, iOS companion | **The one to study.** Take the ideas below; our engine bay + house rules + free brains are already things it does NOT have |
| **Pane** (runpane.com) | AGPL 3.0 | Runs ANY terminal agent (Claude Code, Codex, Aider, Goose), one worktree per agent | Validates our adapter/socket design (engine registry ↔ our `EngineId`). Ideas only — AGPL code never enters this repo |
| **Claudette** (utensils/claudette) | MIT | Tauri app: per-branch worktree+session+terminal, Monaco, hunk staging, **tray icon + sound on agent events** | Take the notification idea: an engine that needs you should be able to reach the tray (respecting his capture-zero-annoyance rule) |
| CodeAgentSwarm, AigoPilot, Conductor | proprietary/paid | Multi-session parallel agents + notifications | Confirms multi-session is the feature people pay for — ours stays free |
| opcode (ex-Claudia) | MIT but **unmaintained** | Old chat-shell wrapper | Avoid; also Vibe Kanban shut down — never couple the app to a hosted service |

## Worth taking — mapped to our queue

1. **Per-hunk accept/reject on approval cards** (Nimbalyst, Claudette): our
   cards already show a before/after; the upgrade is accept PART of an edit.
   Queued as the diff-card upgrade when Code 06 lands.
2. **Session kanban + session↔file links** (Nimbalyst): we already persist
   resumable session ids per workspace; the board that shows them belongs to
   Projects 04 / Code 06. Linked files feed the per-turn context pane.
3. **Worktree isolation per parallel task** (Nimbalyst/Pane/Claudette):
   "run three tasks without them stepping on each other" — optional, per
   task, later; it must stay invisible until asked for.
4. **Needs-you notifications** (Claudette): tray/title-bar pulse when a
   permission card waits. Small, free, queued after Track C's card-queue fix.
5. **Plain files, no proprietary store** (Nimbalyst's stated principle):
   already our religion — vault + artifacts + rules are all on-disk text.
   Recorded here because it validates the direction.
6. **Extension SDK / EditorHost contract** (Nimbalyst): our artifact
   previewers could later accept third-party viewers through one contract —
   parked with the Community Store plan.

## The extension landscape (browser side)

| Repo | License | Worth taking |
|---|---|---|
| open-claude-in-chrome (noemica-io) | MIT | Native-messaging-host architecture (more robust than our localhost POST; keep the port for now — it works and stays local-only); clean-room discipline |
| Prophet | open source | **Accessibility-tree capture over screenshots** — faster, cheaper, more private; the better default if we ever capture structure beyond text |
| onUI (onllm-dev) | open source | **Annotations → local MCP server** so the ENGINE can query what you marked up in the browser — the natural next power for our capture: not just saving to the vault, but letting Claude Code/agy ask for it |
| BrowserKing | MIT | Side-panel agent pattern; not our shape (we are not a browser agent) |

## What they all lack (our standing differences — keep in JUDGE-BRIEF)

Free Ollama/cloud brains behind one door · house rules projected into every
engine · the engine bay as first-class UI · no account, no key, no telemetry
· artifacts library with versions · the vault that remembers what was read.
None of the surveyed apps unify engines + free brains + a vault + captures;
that union is the product.

---

## 2026-10-16 (day) — the ones HE found: ContextFlow, capsule-hub-skills

### Tilantra/capsule-hub-skills — the cloud product's Claude Code pack
Capsule Hub is a COMMERCIAL service (capsulehub.tilantra.com, accounts,
teams, backend.tilantra.com): save conversations as "capsules" in their
cloud. This repo is its Claude Code skills: /capsule-login, -search, -read,
-save, -version, -team. Requires their account + API base; MCP-based auth.
**Why it matters to us:** our own extension's spec literally says
"Capsule Hub + Quillbot style" — this is the product our capture was
designed against. It validates the niche is real and people PAY for it.
**The one idea worth taking (better than the MCP plan):** they teach Claude
Code to operate capsules via SKILLS — markdown instructions — explicitly to
avoid loading tool schemas into context every turn. Our queued
"extension→engine MCP" becomes: **vault skills + our local vault HTTP API**
(already running, already local) — same capability as their paid cloud flow,
zero account, zero cloud, zero schema bloat. Upgrade to the queued idea.

### jeshiomurmu/ContextFlow — the "free local alternative", with red flags
Chrome extension: capture conversations as capsules, inject into any AI
site, chrome.storage.local, JSON export/import, MIT license claimed.
**Red flags (the pattern to learn):** entire history is 2 commits on ONE day
(3 Jul 2026); the latest commit is "Change copyright to Jeshio Murmu"; its
own README's bug/contribute/clone links point to a DIFFERENT account
(github.com/contextflow/extension); no tags, no tests, no releases. Classic
rebrand/clone profile — treat as unverified provenance; do not install, do
not take code. **Worth taking as IDEAS only:** keyboard shortcuts
(Ctrl+Shift+S capture, Ctrl+Shift+K panel), pins in the popup, and the
universal clipboard-fallback inject for sites without an adapter.

### The triage rubric (for the "way many like this" problem)
Every repo in this space gets five questions, in order:
1. **Provenance** — one-day history? copyright-swap commit? links pointing
   to another account? Then it is a rebrand: ideas maybe, code never.
2. **Cloud or local** — needs an account/backend? Then it is against the
   product's religion; at most study its API shape.
3. **Liveness** — commits, issues answered, releases? Dead = read, don't rely.
4. **Genuinely new or wrapper?** — most are thin wrappers around the same
   three ideas: capture, inject, store. The wrapper layer is not the moat.
5. **License** — MIT/Apache ideas free; code only with license review; AGPL
   never enters the repo.

### Standing conclusion
A paid cloud Capsule Hub + free clones + skills packs all prove the
capture/capsule niche pays. Our position is the strongest slot in it:
local + free + versioned vault + THE ENGINE can use what was captured
(nobody else wires capture to an agent). The niche being crowded is
validation, not threat.

---

## 2026-10-16 (day II) — proactive sweep #1 (his correction accepted: searching is MY job)

### The scam wave is real and worth naming
The `claude-code-desktop` GitHub topic is polluted with keyword-farm fakes:
"Claude-Opus-5.5-AI-Free-Desktop", "ClaudeCodeUncensored", "jailbreak-claude"
repos farming model-name search terms with exe downloads. Same class as the
fake gemini-antigravity repos. Our clean provenance (real history, his mark,
no download-bait) is itself a differentiator. Rubric question 1 exists for
exactly this.

### App side
- **CloudCLI / claudecodeui** (siteboon, AGPL): desktop+MOBILE web UI for
  Claude Code/Cursor/Codex, remote session management, tray companion.
  Ideas only (AGPL). Validates: mobile access to sessions is a real demand —
  parked with the community-store/mobile thinking, not queued.
- **aofp/yume** (Tauri): hooks/subagents/skills-aware desktop; watch later.

### Extension side
- **agent-memory** (jennifermarsman, MIT): MutationObserver real-time
  auto-capture to IndexedDB, JSON export. Validates our design; the
  real-time observer is the detail our capture could adopt if manual
  capture ever feels like friction.
- **ChatEngram**: one-click Markdown export to Obsidian/Notion. Our vault
  IS markdown — "export to Obsidian" is nearly free for us. Queued small.
- **AIContext Saver** (sharath2525, open source): inject an AI-COMPRESSED
  summary of a capsule instead of the full context — a real token-saver for
  cloud-brain slices; relevant to the vault skills work.

### Skills space (the big one)
- **anthropics/skills** = the official first-party repo (authoritative).
- **ComposioHQ/awesome-claude-skills** (13k stars), awesome-claude-code
  (54k stars): the curated indexes. Our one-vault-to-every-engine deploy can
  source from these directly — skills are already our format.
- **Caveman**: strips narration, cuts output tokens ~65% — EXACTLY the kind
  of footnote our per-brain quirk table wants for weak local brains.
- **Context Mode**: filters shell-output noise from context — complements
  our memory-discipline house rule.
- **Handoff**: compresses a session to markdown to continue elsewhere —
  pairs with our resume; a "hand this session to a fresh chat" button.

### Ollama space
- **ollama-model-manager** (ur3ley, MIT, Qt6): edit parameters/create
  variants WITHOUT Modelfiles, and — the clever bit — edits rebuild by NAME
  so vision projectors are never silently dropped. Future bay idea:
  parameter tweaks + variants beside pull/delete.
- **AnythingLLM** (MIT, 66k stars): validates local RAG over one's own
  files — our vault+memory direction, independently confirmed at scale.
- LibreChat (MIT, 45k stars): local+hosted side-by-side; Cherry Studio
  (AGPL): crowded space, none wired to an agent engine.


## Sweep #2 — 2026-10-16 (post Track B)
- Scam wave on `claude-code-desktop` topic intensified: "Claude Code Uncensored Desktop", "Claude-Fable-5.1-Free-Desktop", "Claude-Pro-Desktop-2026", "claude-opus-interface-toolkit" — anonymous one-repo accounts, model-name bait, several updated this very week. Clean provenance + one canonical mark remains the differentiator; never mirror their naming patterns.
- Two live, plausibly-legit newcomers to study (ideas only until checked against the rubric): **ittop** (pottz91 — Electron, xterm, session multiplexer, active Oct 12) and **moontors** (ADE-style parallel agents, git-worktree orchestration, active Oct 14).
- Opcode/Claudia still the most-cited GUI; AGPL (claudia.so confirms) — read ideas, never code; earlier unmaintained verdict stands.
- Verdict: nothing changes Track B/C priorities. Carried queues (worktree isolation, browser capture, vault-skill injection) unchanged.


## Sweep #3 + feature research — 2026-10-16 (Track D)
Researched BEFORE building each feature (his standing instruction).
- **Handoff (3 repos studied):** briansmith80/claude-handoff (/handoff → git-syncable HANDOFF.md, /catchup resumes, SessionStart hook), Vasilispapg/claude-handoff (MIT — clean handoff.md opening with instructions to the RECEIVING assistant, files/commands distilled, clipboard mode, project-memory brief), barley-dev/claude-handoff-skill (queue + index + completion gate: "evidence, not declarations"). Copied: receiver-first document shape, session-id resume block, evidence-not-declarations. Skipped: JSONL post-hoc parsing (our turn is already in memory), auto-commit/push (his git, not ours).
- **Caveman** (JuliusBrussee/caveman, ~111k stars per aggregator): telegraphic style, ~65-75% output-token claims; honest numbers inside: only ~3% median over "be concise", and its own rule block costs ~1,160 input tokens. Copied the idea, two sentences, only for small local brains. The surrounding token-tools list (RTK, Headroom, PromptThrift, Token Savior) noted for future bays — all shrink context, none engine-spine.
- **anthropics/skills verified live** (repo folder list): academy-guide, algorithmic-art, brand-guidelines, canvas-design, claude-api, discernment-nudge, doc-coauthoring, docx, frontend-design, internal-comms, mcp-builder, pdf, pptx, skill-creator, slack-gif-creator, theme-factory, web-artifacts-builder, webapp-testing, xlsx. Curated 11 into Settings > Skills. Document skills are source-available — their license rides along.
- Verdict: nothing new threatens the design; the moat (engine-as-spine + local vault + provenance) holds.


## Sweep #4 — 2026-10-16 (his "did you actually check other repos?")
Trigger: his UI correction. Checked the UI patterns of the live tools, not just their existence:
- **nexu-io/open-design #8642:** model-chip popover opens WITH A SEARCH FIELD; short distinguishing labels when every id shares a prefix. Adopted: filter input in the models popover when the engine lists >8 models.
- **backchat #64:** composer footer pickers as ONE shared picker discipline — content-fit height, max-height scroll, checkmark-only selection, provider drill-down. Adopted the discipline for our two chips; drill-down queued (our engines are two, not twelve).
- **Nimbalyst release notes:** model picker GROUPS by provider with full ranges; live model picker per session. Our engine-door list already is per-engine; grouping queued if an engine ever reports many providers.
- Verdict: our popover design is now at parity with the best pickers studied; the sidebar compact-scroll pattern matches the approved mockups (the authority that outranks all repos).


## Sweep #5 — extension injection & capture (2026-10-16)

Question: how do real MV3 extensions inject text into a focused field and queue offline, without the "Extension context invalidated" crashes the approved screenshots show?

| Prior art | What it does | Verdict |
| --- | --- | --- |
| SameerInCode/Sk-Promptvault | chrome.storage prompt library; context menu on `editable` rebuilt on `storage.onChanged`; content script tracks last-focused editable via `focusin`; insert at cursor + fire input/change so React notices; warns "refresh tab after install/reload" | ADOPTED — focusin tracking + event firing pattern for capsule-inject; the refresh caveat is inherent to MV3, noted in the popup |
| hanzla-codes/promptVault | popup "Insert into page" reports "No active text field found" on store/extension pages/sandboxed iframes | ADOPTED — the honest-failure wording for the same situation |
| HaaswithSai/ContextVault | right-click selection → save text/URL/title/date/surrounding text; badge flash confirm; minimal permissions (storage+contextMenus+scripting) | ADOPTED — capture shape already ours; permission minimality confirmed |

Rejected: none this sweep — all three confirm the existing architecture rather than replace it.

Fix shipped with the receipts (the exact ERROR shots): vault-writer's offline path could reject out of a torn-down context ("Extension context invalidated" at vault-writer.js:51/:30, capsule-inject.js:35) — the queue call is now guarded inside the writer, and capsule-inject swallows context-invalidation rejections it cannot act on. Queue≤200 / activity≤100 caps kept. Manifest 0.1.1 → 0.1.2.

## 2026-10-16 (day III) — the Obsidian/LLM-wiki convo sources, read for real (his correction accepted: the convo was mine to research, not just summarize)

His prompt convo pointed at specific repos and guides. Fetched and read (receipts = commit histories, not README vibes):

| Source | What it really is | Verdict |
| --- | --- | --- |
| AgriciDaniel/claude-obsidian | Karpathy-pattern Obsidian+Claude plugin (v2.2.0, 282 commits): wikilink LINTER (dead/ambiguous detection, exact-path resolution, skips dot-dirs, `--exclude` globs), scaffold pins Obsidian to ABSOLUTE link format because shortest-path links resolve differently in Obsidian's UI than in every exact-path tool ("genuinely wrong the moment two files share a basename") | ADOPTED — link check (`/links`, dead+ambiguous, exact path, dot-dirs skipped); rulebooks now demand path links, not bare names |
| huytieu/COG-second-brain | 35 skills/10 agents/people CRM; two transferable engineering lessons in its own fix history: (1) "a mandate no session honors teaches the model to discount the rest of the file" — few rules, all honored; (2) "a behavioral trigger cannot live in a lazily loaded file" — triggers belong in CLAUDE.md, skill bodies hold procedures. Also framework/content separation (rulebooks = framework, follow app version; notes = content, owner's) + cog-update.sh refresh flow | ADOPTED — rulebook refresh = explicit owner press (Replace), never auto-overwrite; rules stay short. Trigger lesson confirms rulebooks-over-skills split |
| COG daily-journal bug (#26/#34) | journal "automatic" skill logged nothing: trigger was inside SKILL.md (lazily loaded) | Conforming evidence — our always-apply rules live in CLAUDE.md/AGENTS.md at the root, skills carry procedures only (browser-page skill already split this way) |
| Leaked-prompt mythology (asgeirtj repo etc.) | Real Anthropic event = npm package briefly shipped unminified TS (readable, not "hacked"); "512k-line leak" numbers + "hardcoded in models" claims unverified/false — system prompts are runtime text, not weights | REJECTED as fact-base; only the structural pattern (constraints/error-handling blocks, fail-don't-guess) is real practice, and the app already embodies it |

Also shipped from the sweep: `#manual` owner-lockout + `## Evolution [date]` append + status lifecycle audit stamps in the rulebooks; `00 System/Templates/Person.md` + `Knowledge Note.md` (style-matched to the existing Entity/Sharing Receipt templates) generated for app-shaped vaults, never for adopted foreign layouts.
