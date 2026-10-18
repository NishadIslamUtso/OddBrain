# Merge Plan — which part from which, and why

**Date:** 2026-10-12 · based on verified code inspection, not the advisor report.

**Status (2026-10-14): historical.** This plan decided which parts of which app were merged into
`apps/03_ai-assistant/`. That work is done and the app is now maintained in its own right; this file is kept
as the record of why the pieces were chosen. Current state: `00_LIVING_DOCS/HANDOVER_LIVING.md`.

---

## The principle that decides everything

**Only our own branches have portable code.**

| Source | Stack | Portable? |
|---|---|---|
| Our branches (`3eeced36`, `cb0eb781`, `abc0197f`, `01199af1`) | React + Vite + JS | ✅ **Yes** — same codebase, drops in with tests |
| Atomic Chat | Rust + Tauri | ❌ No — reimplement ideas only |
| Cherry Studio | Electron + TS | ❌ No — reimplement ideas only |
| Open WebUI | Python + Svelte | ❌ No — reimplement ideas only |
| AnythingLLM | Node + JS | ⚠ Partial — small utility code only |

You cannot "take" Atomic Chat's TurboQuant or Cherry Studio's MCP marketplace into a React+Vite app.
Those are different languages and different process models. What is portable from them is **the idea**,
which must be rewritten. What is portable from our own branches is **working, tested code**.

---

## Phase 1 — Consolidate our branches (real code, tests included)

### Base: `arena/3eeced36-ai-assistant`
**Why:** 70/70 tests pass (I ran them). It is the only branch with all of:
sub-agents (9), comment-mode pin (3), live artifacts (52), stop-keeps-draft (31),
Capsule Hub (39), vault 00-90 (2), Today view (11), blacklist (9), vision bridge (4),
branching (2), ZIP export (5).

### Add inline charts from `abc0197f` — **not** `cb0eb781`
The advisor recommended `cb0eb781`. That is the weaker implementation:

| | `abc0197f` (`ChartBlock.jsx`) | `cb0eb781` (`InlineChart.jsx`) |
|---|---|---|
| Chart types | bar, line, **pie** | bar, line |
| Intent detection | ✅ `wantsChart()` — renders only when asked | ❌ none |
| Max points | 24 | 30 |
| Validation errors | per-field messages | returns `null` |

**Take `abc0197f`.** Its `wantsChart()` gate matches your standing rule — *artifacts only on
explicit request or when artifact mode is on*. `cb0eb781` would render charts unprompted, which is
exactly the behaviour you rejected.

### Keep `citations.js` from `3c06e1bf`
`3eeced36` has **zero** citations; ours has it (8 refs). Merge forward. Do not drop it.

### Take styling from `01199af1` — but **not the branch**
`01199af1` is missing two files you explicitly required:

```
01199af1 lacks:  TitleBar.jsx   TodayView.jsx
```

So it cannot be the base — it has no Windows title bar and no Today view. Extract its **CSS and
visual language** into `3eeced36`, which has both.

---

## Phase 2 — Reimplement these ideas (small, low risk)

| Feature | From | Why it's worth it | Cost |
|---|---|---|---|
| Global hotkey for inline rewrite | BoltAI | Completes your Quillbot requirement — you have inline, not system-wide | Small |
| Split chats (2 models side by side) | Msty | Genuinely useful for comparing qwen2.5:3b vs a vision model | Medium |

Both are **ideas to reimplement in React**, not code to copy.

---

## Phase 3 — Engine level (defer, benchmark first)

**Do not swap Ollama for Atomic Chat's TurboQuant engine.** Atomic Chat is a 1.7k★ Jan fork whose
speed numbers are self-reported with no benchmark in the repo. Swapping means abandoning a working
Ollama integration for a vendor's marketing claim.

**Get most of the practical benefit on Ollama today, at zero risk:**
- Use a more aggressive quant of `qwen2.5:3b` (`Q4_K_M` → `Q3_K_L`) — smaller, fits 4 GB VRAM easier
- Tune `num_ctx` to cap context growth (KV-cache is the memory hog Atomic Chat's compression targets)
- Keep the existing 12,000-character guard

This is the honest version of "6× memory reduction" for your TUF A15.

---

## Excluded, with reasons

| App | Why not |
|---|---|
| Atomic Chat as base | Different stack (Rust/Tauri), 1.7k★ Jan fork, self-reported benchmarks |
| Cherry Studio | Electron, different stack; "300+ assistants" not verifiable |
| Open WebUI | Python/Svelte, Docker-oriented, multi-user is irrelevant to a single-user desktop app |
| AnythingLLM | RAG/workspaces solve a problem you already solve with your vault |
| GPT4All | Last push 2025-05-27, 17 months stale |
| BoltAI | 26★, no license, Mac-only, no source |

---

## Result

`3eeced36` base + `abc0197f` charts + our `citations.js` + `01199af1` styling
= **8/8**, with sub-agents, comment pin, live artifacts, Capsule Hub, vault 00-90,
Today view, blacklist, vision bridge, branching, ZIP export, charts, and citations —
all on the existing Ollama backend you already have working.
