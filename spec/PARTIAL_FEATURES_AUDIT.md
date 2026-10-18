# Partial-Features Audit — all 10 apps graded against **your** want-list

**Date:** 2026-10-12 · **Method:** every repo cloned and grepped. "Partial" is defined below and applied consistently.

**Status (2026-10-14): historical.** The grading below describes those apps as they were on 2026-10-12. The
app has moved on since — see `.ai/STATE.json` for what exists today.

---

## What "partial" means

Three different situations, all called "partial" in the advisor's report:

1. **Different mechanism** — the capability exists but works a different way than you specified.
   *Example:* Mermaid diagrams vs your ` ```chart ` JSON block. Both render a visual. Only yours validates
   the data and degrades to plain code when invalid.
2. **Different scope** — the capability exists somewhere in their *ecosystem*, not in the place you want it.
   *Example:* Atomic Chat's "sub-agents" is `atomic-agent`, a separate CLI binary — not in-chat roles.
3. **Claimed but absent** — grep finds nothing, or only noise.
   *Example:* Atomic Chat's "Flash Attention toggle" (0 hits); Atomic Chat's "branching" (160 hits, all
   `ChatInput.tsx` / `DownloadButton.tsx` / `AttachmentChip.tsx` — incidental word matches).

---

## Your want-list, graded across all 10 apps

Legend: ✅ full · ⚠ partial · ❌ none

| # | Your want | Atomic Chat | Cherry Studio | Open WebUI | AnythingLLM | Jan | Ollama | Msty | LM Studio | GPT4All | BoltAI |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Exact Claude UI + Windows title bar | ⚠ | ⚠ | ❌ | ❌ | ⚠ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 2 | Artifact runner + live preview | ✅ | ✅ | ⚠ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 3 | Artifact **only on explicit request** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 4 | Model selector | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠ | ✅ | ✅ | ✅ | ❌ |
| 5 | File upload | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| 6 | Image upload | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| 7 | **Vision bridge** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 8 | Thinking display | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 9 | **Capsule drag-drop / Capsule Hub** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 10 | **Today view / Open Loops** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 11 | **Vault driver (00–90)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 12 | **Extension collector + "wasn't accessible"** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 13 | Ollama backend | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠ |
| 14 | 4 GB VRAM friendly | ✅ | ❌ | ❌ | ❌ | ⚠ | ⚠ | ❌ | ⚠ | ⚠ | ❌ |
| 15 | Sub-agents, isolated context | ⚠ | ⚠ | ⚠ | ⚠ | **✅** | ❌ | ❌ | ❌ | ❌ | ❌ |
| 16 | Branching conversations | ❌ | **✅** | ✅ | ⚠ | ⚠ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 17 | **Deployable ZIP export** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 18 | **Comment-mode pin / region rewrite** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 19 | **Inline charts (` ```chart `)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 20 | Citations | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 21 | MCP | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠ | ❌ | ✅ | ❌ | ❌ |
| 22 | **Quillbot inline rewrite** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠ |
| 23 | **Never-check blacklist** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 24 | Windows `.bat` launcher | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Bold = exists nowhere outside your own repo.**

---

## What the partials actually are

### ⚠ Artifacts — everyone has them, nobody has your gate
Cherry Studio (381 files), Atomic Chat (185, verified `ArtifactPanel.tsx` + `HtmlArtifact.tsx`), Jan (109).
All render artifacts whenever the model emits one. **None** gate it behind an explicit request.
That gate is your `if (!requested) return []` in `src/lib/artifacts.js` — the fix for the TicTacToe /
Flappy-Bird loop. **No external app solves your actual bug.**

### ⚠ Sub-agents — Jan is the real one, not Atomic Chat
- **Atomic Chat** → `atomic-agent` (3,256★), a *separate CLI binary*: "drives your browser, edits files,
  runs approved commands, GAIA L1 · 69.8%". Launched one-click from an Integrations tab. Not in-chat roles.
- **Jan** → has a genuine in-app system: `useCoworkRun` with **sub-agent lanes** (215 `subagents` refs,
  76 `lane`, 3 `isolated`), shipped with `useCoworkRun.test.ts`, `useCoworkSessions.test.ts`,
  `useCoworkConfig.test.ts`. **This is the closest external match to your 6-role `useSubAgents.js`.**

### ⚠ Branching — Cherry Studio has it properly
`TopicBranchPanel.tsx` with `buildTopicMessageFlowGraph` and its own test file. Atomic Chat's 160 "branch"
hits are noise (`ChatInput.tsx`, `DownloadButton.tsx`). Verified: **Atomic Chat has no branching.**

### ⚠ Inline charts — Mermaid is a different mechanism
Mermaid exists in Cherry (55), atomic-agent (16), Atomic Chat (15), Jan (13), Open WebUI (8).
Mermaid is **markup**: the model writes Mermaid syntax, the app renders it, and a malformed diagram renders
broken. Yours is **data**: a ` ```chart ` block holding JSON, validated, with pure-SVG geometry, and anything
invalid stays as plain code. No external app has the ` ```chart ` convention — it is yours alone.

### ⚠ Citations — they mean RAG provenance, you mean model-emitted links
Open WebUI (86), AnythingLLM (50), Cherry (214) all cite *which document chunk* an answer came from.
Your `citations.js` turns links the model actually wrote into source chips. Different things, same word.

### ⚠ Vision bridge — nobody. At all.
Zero hits in all nine cloneable repos. Every app just requires you to select a vision model.
Your design — a text-only model keeping the conversation while handing an image turn to an installed
vision model — does not exist anywhere else.

### ⚠ Quillbot inline — only BoltAI, and only as a system-wide hotkey
BoltAI's command palette (highlight text → hotkey → rewrite → paste back in place) is the *system-wide* half.
It's Mac-only, closed, 26★, and not integrated with any chat or vault. You have the *inline-in-chat* half.
Nobody has both.

---

## What is genuinely worth taking

| Take | From | Why | Cost |
|---|---|---|---|
| Sub-agent **isolated-lane** pattern | **Jan** `useCoworkRun` / `useCoworkSessions` | Real tested implementation of isolated context per sub-agent — closest thing to your 6 roles | Medium (read + adapt) |
| Branching **message-flow graph** | **Cherry Studio** `TopicBranchPanel.tsx` | Richer than a plain switcher; has tests | Small |
| Global hotkey for inline rewrite | **BoltAI** (idea only) | Completes your Quillbot requirement | Small |
| Mermaid as an **extra** renderer | Cherry / Open WebUI | Add alongside ` ```chart `, not instead of it | Small |
| 4 GB VRAM tuning | **Atomic Chat** (idea only) | Via Ollama `Q3_K_L` + capped `num_ctx` — **not** an engine swap | Zero risk |

## What not to take

- **Atomic Chat as a base** — Rust/Tauri, can't merge with React/Vite; and its headline numbers are its own marketing.
- **MCP** — you deliberately skipped it; adding it now is scope you don't need.
- **RAG / vector DB** (AnythingLLM, Open WebUI) — solves a problem your vault already solves.
- **GPT4All** — last push 2025-05-27, 17 months stale.

---

## The headline

**Nine of your twenty-four wants exist nowhere outside your own repository:**
vision bridge, Capsule Hub, Today view, vault driver, extension collector, deployable ZIP,
comment-mode pin, ` ```chart ` inline charts, never-check blacklist, Windows `.bat` launcher.

That is the moat. The external apps are not ahead of you on the things you actually care about —
they're ahead on breadth of integrations (MCP), team features, and mobile, none of which you asked for.

**Verified by:** cloning 9 repos; `grep -ril` per feature; targeted reading of `TopicBranchPanel.tsx`,
`useCoworkRun`/`useCoworkSessions`, `ArtifactPanel.tsx`, `atomic-agent/README.md`.
