# THE PLAN — free-first TODO + how we work

**Owner mandate, 2026-10-15 (standing):** *"the priority is to make it and use it
for free… except the API cost if and only if I ever decide to purchase a
subscription. Other than that, everything must be free."*

- **Free Gate:** every step below is labeled with its cost. Default = **$0**.
  Any item marked 🅿️ stays blocked until the owner literally says **"buy"** —
  and only he can say it. API credits *and* subscriptions both count as "cost".
- **Language rule (owner, 2026-10-15):** explain everything in plain words —
  like he understands no tech. Every technical term gets a straight
  explanation the first time it appears.
- **App status: UN-PARKED (owner, 2026-10-15 evening).** After the Desktop-app
  paywall + VS Code veto he chose the endgame: HIS app is the face, Claude Code
  is the engine inside it, `agy` CLI is engine #2. See Phase 6.
- **GUI-first (owner, 2026-10-15):** he wants APP WINDOWS, not terminal workflows —
  hand him clickable paths; console pastes only for setup when unavoidable.
- **Cadence (corrected 2026-10-15):** batched paste-blocks — one paste runs several
  commands (his call: "so i can copy paste a lot at once"). He says **"next"** between blocks.

---

## The goal

Claude + Claude Code set up the way he wants — browsing, notes, skills, mods,
memory — running on his ASUS TUF (RTX 3050 4 GB / 8 GB RAM) with zero spend.

---

## Phase 0 — free brain for Claude Code (foundation)

**Plain words:** a model is like a movie file; Ollama and LM Studio are two free
"players" for it. Ollama is chosen not because it is smarter (same models on
both) but because it is: (1) already installed and running on his machine,
(2) the player Claude Code speaks to directly — three settings, done — while LM
Studio would need an extra translator program in the middle, (3) quiet and
background-friendly. Skipping both is possible too (free online models instead:
no install, but internet, queues, and text leaves the machine) — allowed under
the Free Gate, just a different trade.

- [x] **0.1 Verify Ollama is up** ✅ 2026-10-15 — answered; `qwen2.5-coder:3b` already installed, reports `tools`. — cost: $0.
      `curl.exe http://127.0.0.1:11434/api/tags` → lists his models.
      *Done when:* JSON with `models` comes back.
- [x] **0.2 The free models** ✅ — `qwen2.5-coder:3b` (local, unlimited) + `gemma4:cloud` (remote 32.7B, thinking+tools+vision, 262k room, free starter slice — old `kimi-k2.5:cloud` tag is dead). — cost: $0.
      `ollama pull qwen2.5-coder:3b` (≈2 GB → fits the 4 GB card; the daily brain)
      `ollama pull kimi-k2.5:cloud` (optional — free, better quality, needs internet).
      *Done when:* `ollama list` shows both.
- [x] **0.3 Install Claude Code** ✅ — v2.1.300 via npm (mods-capable). — cost: $0.
      First `node -v`. If Node exists: `npm install -g @anthropic-ai/claude-code`.
      If not: I confirm the current official Windows installer when we hit this
      step (no guessed commands).
      *Done when:* `claude --version` answers.
- [x] **0.4 Point Claude Code at the free brain** ✅ — env-var wiring worked in-session; User-level (permanent) copy delivered with Phase 1. — cost: $0.
      One-liner alternative: `ollama launch claude` (Ollama does the wiring).
      Manual form for a PowerShell 5.1 session:
      `$env:ANTHROPIC_BASE_URL = "http://localhost:11434"`
      `$env:ANTHROPIC_AUTH_TOKEN = "ollama"`
      `$env:ANTHROPIC_API_KEY = ""`
      then `claude`.
      *Done when:* a prompt inside `claude` gets a local-model reply and no auth
      error. Then persist the three variables as User env vars — only after 0.4 passes.
- [x] **0.5 Wobble test** ✅ — passed on `gemma4:cloud` (hello.txt written). Local 3B reads the rulebook now but picks wrong tools (grabbed `ExitPlanMode`) → cloud = default brain for agentic tasks, local = unlimited fallback. — cost: $0.
      One real task (small file edit in a throwaway folder) to check tool-calling
      on the chosen model. If tools fail: switch model (`:cloud` or a different
      coder), not a subscription.
      *Done when:* the edit actually happened on disk.
- [ ] 🅿️ **0.9 Optional taste of real Claude** — ~$5 free starter credits on a new
      console account (no card, expires into paid use). Blocked like any cost until
      he says "buy".

**Phase 0 CLOSED 2026-10-15.** Auto-start: Startup-folder shortcut `OllamaServe.lnk`
→ hidden wrapper `%USERPROFILE%\ollama-serve-hidden.ps1` (context 16384 baked in).
Scheduled-task route was denied — non-admin account. Never run `ollama serve`
by hand again.

## Phase 1 — Claude in his browser (free plan)

- [x] **1.1 Sign into Claude** ✅ 2026-10-15 — nishadislamutso@gmail.com, free plan, chat works.
      chat works. Cost: $0. *Done when:* a conversation saves to history.
- [x] **1.2 "Claude for Chrome" — SKIPPED (paywalled, Free Gate holds).** ✅ 2026-10-15:
      since GA 2026-08-26 the extension is paid-plans-only (Pro/Max/Team/Enterprise;
      pricing table "No on Free" verified 2026-10-06). His exact wall: "This account
      doesn't have a plan that includes Claude in Chrome." NO upgrade — owner mandate.
      Free replacement queued: Claude Code + Playwright MCP (browser-driving, $0) in a
      later phase. Cowork-in-Chrome question moot.
- [ ] **1.3 Notes → Claude (OPTIONAL — may fold into Phase 2/4):** filesystem/Obsidian
      **MCP** for Claude. If paywalled on free → tick "skip", Phase 2 covers the same
      ground free. Cost: $0. *Done when:* Claude names a file from the vault folder,
      or the skip is recorded.

## Phase 2 — Claude Code, his way

- [x] **2.1 Skills** ✅ 2026-10-15 — all 11 replica skills live in
      `~\.claude\skills\`, enabled in the skills browser (`user` scope, ✔ each).
      Note: `/reload-plugins` counts only plugin-bundled skills, hence its
      misleading "0 skills" — user skills load at startup.
- [ ] **2.2 Mods (in progress):** marketplace ADDED (70 mods live, not the stale
      "explainx" from earlier notes — that one no longer exists). Candidates picked
      from the live shelf: `task-board`, `scratchpad`. Inside Claude Code — `/plugin`:
      `whyashthakker/awesome-claude-code-mods`, install 1–2 MIT, reviewed mods.
      Remember: **mods are unsandboxed** (full machine access) — trusted sources
      only; he approves each install. Cost: $0.
      *Done when:* the mod's UI/behavior is visibly active.
- [ ] **2.4 Claude Code as an APP (owner requirement 2026-10-15: "i want the claude
      code app, i don't want to do it in terminal"):** install Claude Desktop
      (claude.com/download, Windows x64), sign in FREE, try the **Code** tab.
      If it demands a subscription → Free Gate: record paywalled, fall back to
      VS Code + official Claude Code extension (free, windowed) or a free GUI
      wrapper. The app also carries the official **Ollama gateway** (local free
      brains inside the app). Cost: $0. *Done when:* Claude Code works inside a
      window on free brains, or the wall is recorded and fallback chosen.
      ⛔ OUTCOME 2026-10-15: Code tab = upgrade wall on his free sign-in; no
      local-models/Ollama toggle visible (subscriber-only or newer build). Free
      Gate: NO pay. → fallback VS Code REJECTED by owner: fixed layout 'destroys the entire purpose of freely changing app layout' (his words). Free-extension fact stands if he ever wants it.
      (same CLI core, same ~/.claude skills/mods, windowed panels); wiring via
      `%USERPROFILE%\.claude\settings.json` env block (scoped to Claude only,
      delete file to undo). If the extension also walls: community GUI wrapper.
- [ ] **2.3 Vault to Claude Code:** filesystem MCP config or a `CLAUDE.md` at the
      vault root. Cost: $0. *Done when:* Claude Code reads a named note unprompted.
- [ ] **2.5 Optional — put his existing `agy` to work:** `agy` on his device is the
      **Antigravity CLI** — Google's own terminal helper (the free successor to
      Gemini CLI; signs in with a Google account, uses Gemini free quota). Free
      add-ons let Claude Code hand tasks to `agy` for a second opinion or rescue
      passes — two free helpers checking each other. **Check first:** those
      add-ons lean Mac/Linux (bash); I verify Windows support before we install
      anything. If he'd rather not keep it: deleting it breaks nothing in this
      plan — Claude Code + Ollama don't need it. Cost: $0 either way.
- [ ] **2.4 First real workflow:** one actual job of his, start to finish, free.
      *Done when:* he uses it without me standing over it.

## Phase 3 — his eight surfaces as skills & mods (the app replacement)

Each surface gets the cheapest free vehicle: **skill** (command) · **mod** (pane)
· **MCP** (data). Never an app screen unless he un-parks.

- [ ] **3.1 `/today`** — greeting, counts, worth-doing, recent sources: reads
      Chrome history + vault files, prints the dashboard (Today 07, free).
- [ ] **3.2 `/vault-map`** — browsing/vault summary (Browsing Maps 05).
- [ ] **3.3 Artifacts home** — one declared folder Claude Code writes files into
      (Artifacts 03 without the app).
- [ ] **3.4 Always-on panels** (status/token-weather style) → mods.
- [ ] **3.5 Standing rule** — every new surface: skill, mod, or MCP first; app
      only if un-parked.

## Phase 4 — memory & notes

- [ ] **4.1 Obsidian** on the vault folder (free plan suffices for local vaults).
- [ ] **4.2 `CLAUDE.md`** at the vault root = standing context for every session.
- [ ] **4.3 `claude-os` memory layer** — evaluate Windows viability first
      (it is Mac-first); fallback stays CLAUDE.md + skills. Cost must stay $0.

## Phase 5 — free-tier upkeep (recurring)

- [ ] **5.1 My duty, before every phase:** re-check Anthropic's changelog, Ollama's
      blog, and the free-tier numbers of anything we rely on — tiers drift; the
      owner never brings release news to the build.
- [ ] **5.2 The Paid Moment:** if free caps genuinely start hurting, I lay out the
      menu (researched Oct 2026: Pro ≈ $20/mo, Max ≈ $100/mo — verify at the time)
      with exactly what each unlocks (native Claude Code on real Claude models,
      Cowork-in-Chrome, higher caps). He alone decides. Until an explicit "buy":
      **$0, no exceptions**.

---

## The structure we follow now

1. **Batched paste-blocks (owner correction):** each block runs several commands in one
   copy-paste — fewer round-trips. Phases remain the progress unit; he says "next" between
   blocks; no block may cross a payment wall without saying so first.
2. **Every step ships with:** exact commands (PowerShell 5.1-safe: no `&&`,
   `.\` for relatives), a **cost label**, and a **done-when check**. No step
   without all three.
3. **My duties:** research before he has to; verify free claims with sources;
   keep this file + session log pushed to the branch → main; hand over exact
   commands instead of assumed environments; never make a paid path the default.
4. **His duties:** run the commands on his machine (I have no access there),
   paste back errors/output verbatim, and hold the only "buy" button.
5. **Files:** this file = active plan · `TODOLIST.md` = parked app record ·
   `00_LIVING_DOCS/` = repo mirrors (fresh at every landing) ·
   `memory/sessions/` = why + what failed.
6. **Free Gate is law:** cost > $0 ⇒ blocked until "buy". Free tiers change
   without warning ⇒ we re-plan, we don't quietly pay.
7. **Plan first, code after his "go"** (standing rule from the app era).

## Phase 6 — THE APP RETURNS (active, 2026-10-15)

Owner's words: *"gonna implement that, and agy cli too, and make my the way
i want it to be, basically claude code will run on it normally, it's features
will work in the app normally too."*

- [ ] **6.1 Architecture doc (sandbox, mine, no cost):** how the engine embeds —
  Claude **Agent SDK** (TypeScript, GA: same tools/loop/sessions; loads skills +
  memory from `~/.claude/` automatically — his 11 skills carry in) VS raw
  `claude --output-format stream-json` spawn (full TUI parity, mods panels
  visible). Env wiring identical (Ollama base URL). `agy` = engine #2 behind
  the same interface (Windows support check still owed). Face: existing v0.1.2
  app + mockups (design authority) + replica-skill refresh pass vs the current
      Claude app look. *Done when:* doc in 00_LIVING_DOCS, he reads, says "go".
      GO RECEIVED 2026-10-15; 6.2 landed (raw-stream over SDK, reasons in ARCHITECTURE §Job 2) — then HARDENED after six judge reviews (permission flags pinned, multi-turn, Stop-wedge fix, Bangla-safe decoding, 298/298). Owner round-trip pending.
      📝 DRAFTED 2026-10-15 → `ARCHITECTURE.md` (workspace) +
      `00_LIVING_DOCS/ARCHITECTURE-ENGINE.md` (repo). Awaiting read + "go".
- [x] **6.2 Engine spike — DONE 2026-10-15 (back room + face).** Raw-stream socket,
      wire parser, Claude Code adapter, settings.engine, IPC doors; then the face:
      composer Engine toggle, work-order panel, Allow/Deny permission cards.
      298/298 tests after the judge-fix landing, typecheck clean. Verdicts +
      fixes in memory/sessions; decision in ARCHITECTURE.md §Job 2.
- [ ] **6.3 agy spike:** same harness, second provider (after Windows check).
- [ ] **6.4 Face refresh + mockup surfaces** (the eight screens, mockups rule).
- [x] **6.5 Installer BUILT 2026-10-15** — `AI-ASSistant-Setup-0.2.0.exe`
      (~84 MB, one click, no PowerShell, no admin, opens the app when done).
      First build (0.2.0) surfaced two real findings on his machine — old logo
      still present + `claude` invisible to the packaged app — BOTH fixed and
      re-shipped as **0.2.1** (SHA-256 78b9b40f…65de14f) with his canonical
      butt-brain mark everywhere and engine-PATH prepending. Awaiting his run.
