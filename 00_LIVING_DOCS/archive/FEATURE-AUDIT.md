# FEATURE AUDIT — every "take" item, checked against the code (2026-10-15)

> **2026-10-16:** statuses below are frozen at 2026-10-15. Everything since —
> the engine era: the OFFERED 1–14, media, auto memory — has landed and is logged
> in `CHANGELOG.md`; `TODO_NEXT.md` items 1–15-done are the current truth.

**Why this exists:** the owner asked "are you SURE everything I mentioned is done?"
The honest answer after checking every record against the actual source files:
**no — here is the complete map.** Sources audited: `BUILD-TODO.md` (12 sections,
feature-by-feature with the app each idea came from), `app-feature-matrix.md` v2
(Claude / OpenDesign / Cherry / Open WebUI / AnythingLLM / GPT4All / Jan / LM
Studio / Msty / BoltAI), `REDESIGN-PLAN.md` + `REDESIGN-FOUNDATION.md`, and the
TODOLIST §6 **Claude-OS take-list**. Every status below was verified by reading
the app's code today, not from memory.

Legend: ✅ shipped & tested · 🔨 partially there · ❌ not built ·
♻️ the new engine carries it (arrives with Claude Code inside the app) ·
🗑 dropped by your decision · 🅿️ parked (Jarvis-era) · 🆕 built in the pivot

---

## 1 · The chat shell (from Cherry, Msty, BoltAI, Claude)

| Item | Source | Status |
|---|---|---|
| Topic list: rename, search, sidebar | Cherry | ✅ (Sidebar + useChats; pin ❌) |
| Branch tree inside a topic | Cherry | ❌ |
| Split Chats (several models side by side) | Msty | ❌ |
| Arena compare + leaderboard | Open WebUI | ❌ (🗑 single-user stance) |
| Regenerate / edit-and-resend | — | 🔨 logic built and exported (`useChat.regenerate` / `editAndResend`), UI buttons not wired |
| Prompt library with variables | BoltAI | 🔨 library built + 11 tests (`shared/lib/prompts.ts`), UI not wired |
| Slash-command menu | Claude plugins | ❌ in-app · ♻️ engine has them (skills) |
| Inline charts in replies | your branch | ✅ (chart.ts, wired in useChat) |
| Mermaid + code highlighting | Cherry | ❌ (nothing in code) |
| Attachments: images | — | ✅ · PDF/docx/xlsx ❌ (lib mentions pdf only for images) |
| Web search tool | — | ❌ (may arrive via gemma4:cloud's own web-search — unverified) |
| Translate selection | Cherry | ❌ |
| Voice STT/TTS | Cherry | 🅿️ (Jarvis parked) |
| Image generation from chat | Cherry/OpenDesign | ❌ |
| System-wide hotkey rewrite-anywhere | BoltAI | ❌ |
| Search across ALL chats | — | ✅ sidebar search |

## 2 · Artifacts & creation (from OpenDesign, Claude)

| Item | Status |
|---|---|
| Sandboxed iframe preview | ✅ ArtifactPreview |
| Live artifacts (manifest, no-reload re-render) | ✅ extractStreamingArtifacts |
| Tweaks panel for live parameters | ❌ |
| Comment-mode / edit-in-place (highlight → instruct) | ✅ useArtifactRewrite |
| Artifact library, versions, restore | ✅ |
| Artifacts-as-FILES on disk + Artifacts screen | ✅ |
| Export: HTML single file · MD | 🔨 (files saved as v2.html; no export chain) |
| Export: PDF · PPTX · ZIP · MP4 | ❌ |
| Deck mode (15 templates, 36 themes) | ❌ |
| 93 image-prompt gallery, HyperFrames video, device frames, 5 visual directions, discovery form, agent todo panel | ❌ all (OpenDesign takes, untouched) |

## 3 · Design systems, skills, plugins (OpenDesign-shaped)

| Item | Status |
|---|---|
| DESIGN.md schema + picker, starter pack, extract-from-URL/repo | ❌ all |
| Skills as plain folders + loader (in-app) | ❌ as app code · 🆕♻️ the engine auto-loads your real `~/.claude` skills (11 live) |
| Plugin registry / marketplace UI | ❌ in-app · ♻️ engine's `/plugin` store |
| 13 scenario plugins (od-*) equivalents | ❌ |
| "Refresh a repo to my brand", Figma→React | ❌ |

## 4 · Agents, MCP, code

| Item | Status |
|---|---|
| **Agent runtime adapters (launch CLIs, structured stream)** | 🆕 ✅ **the engine socket — built 2026-10-15** (this WAS the open item; now real, agy pending its Windows check) |
| **Approval gates before destructive actions** | 🆕 🔨 **cards wired end-to-end and proven against the real CLI binary by reviewers; launch flags pinned (`--permission-mode manual` + `--permission-prompt-tool stdio`); owner's own round-trip still owed for the final ✅ |
| One-click UNDO after an approved action | ❌ (the Claude-OS half still open) |
| Local MCP server exposing vault + artifacts | ❌ (still the TODOLIST proposal) |
| One-line MCP install for external agents | ❌ |
| BYOK proxy with SSRF guard | ✅ (api/guard.ts + proxy-policy tests) |
| Real code-agent runner behind a "Code" nav item | ❌ screen · ♻️ engine does the work, no screen yet |
| Monaco + WebContainer | ❌ |
| Mode switcher Chat/Code/Vault/Settings | ❌ (nav has Chat + Artifacts only) |
| Sub-agents in separate contexts | ♻️ Claude Code's sub-agents arrive with the engine; no app UI |

## 5 · Projects, memory, automation (Claude-shaped)

| Item | Status |
|---|---|
| Projects: instructions + context + isolated history | ❌ (screen 04) |
| Chat memory: cross-session summaries + edit UI | ❌ · ♻️ engine auto-memory partially covers |
| File-system memory (/memory) | 🔨 (vault-as-files + engine can read it — primitive form works) |
| Memory consolidation ("dreaming"), import from other AIs | ❌ (Claude-OS takes) |
| Scheduled tasks (daily/weekly) | ❌ |
| Today screen (07) reading real activity | ❌ (vault route exists; screen unbuilt) |
| Session-insight extraction (Claude-OS → "Worth doing next") | ❌ |

## 6 · Local models & hardware

| Item | Status |
|---|---|
| 4 GB-safe inference profiles + VRAM fit estimator | ✅ (Settings + inference-fit tests) |
| Model catalog + download manager | ❌ |
| Keep-alive / residency control | ❌ |
| Structured output / JSON-schema mode | ❌ |
| CPU/Vulkan fallback guidance | 🔨 (advice note) |
| KV-cache tuning presets | ❌ |
| Local OpenAI-compatible API on a fixed port | ✅ own shape (loopback API :41979, origin-guarded) |

## 7 · Knowledge & storage

| Item | Status |
|---|---|
| Vault: local files, keyword index, real counts | ✅ (explicitly NO embeddings, by design) |
| Workspaces / Knowledge Stacks / Chat-vs-Query | ❌ |
| Vector DB + embedder + BYO-vector-DB | ❌ (🗑 unless you ask — R5 says 4 GB first) |
| RAG with no server | 🔨 (vault files feed the engine now) |

## 8 · Cloud providers & agent access

| Item | Status |
|---|---|
| Provider registry (Anthropic adapter included), keychain keys, test/models | ✅ |
| Local-vs-Cloud badge on replies | ✅ · audit log ❌ |
| Agent access permissions (local / capture / keep / per-provider cloud) | ✅ full-window Settings |
| Prompt-injection guard (tag untrusted, confirm outbound) | ❌ |
| Token + cost meter per turn / monthly cap | ❌ |
| Failover cloud → local, never cloud → cloud | ❌ OPEN — today the brain is picked in settings (manual seatbelt); no automatic failover code exists (judges verified the absence; the earlier ✅ was wrong) |
| Links to providers' data-use pages | ❌ |

## 9 · Browser capture & Browsing Maps

| Item | Status |
|---|---|
| Extension port, silent capture, zero-annoyance rules | ✅ (extension/server.ts) |
| Browsing Maps (clusters, graph) | ✅ MemoryMap.tsx |
| Event log: append-only, rebuildable indexes | 🔨 (sources land in vault; no dedicated log) |
| Capsule builder (version/merge/split/inject) | ❌ |
| MCP exposure of captured memory | ❌ (same proposal as above) |

## 10 · Sharing & multi-user

| Item | Status |
|---|---|
| Live share links, embeddable widget, accounts/RBAC, pipelines API, arena | ❌ (🗑 for a single-user local app unless you say otherwise) |
| Comments & feedback on artifacts | ✅ comment mode |

## 11 · OS-level polish

| Item | Status |
|---|---|
| Themes / accent picker / width memory | ✅ appearance.ts (+ collapse memory) |
| First-run onboarding | ❌ (screen 08 — reborn as the init screen in Phase 6.4) |
| Zero-telemetry guarantee, written down | ❌ (one paragraph — cheap, recommended) |
| i18n (14 languages) | ❌ |
| Mobile companion / dispatch | ❌ |

## 12 · The Claude-OS take-list (TODOLIST §6), re-checked

| Take | Status now |
|---|---|
| Skills library + knowledge lifecycle (brobertsaz/claude-os) | ❌ app-side · ♻️ engine loads skill folders today; lifecycle/dedup/health still open |
| Session-insight extraction → Today's "Worth doing next" | ❌ |
| **Approval card** (open-ClaudeOS) | 🆕 🔨 the exact pattern shipped (see-before-it-happens cards); proven against the real CLI by reviewers; owner round-trip pending |
| **One-click undo** (same repo) | ❌ — now the natural next half-step on the cards |
| Mods as plain files with declared permissions | ❌ app-native packs · ♻️ CC mods exist (unsandboxed caveat stands) |
| "Fast things never touch a model" as a written rule | ✍️ adopted in this audit — the rule is now written: trivial UI actions never wait on any model |
| Not-taking list (Mac installer, C# code, macOS-only Cowork) | ✅ respected |

## 13 · REDESIGN-PLAN (phases 0–9)

Executed: the app IS phases 0–8 (skeleton → logic port → services → chat →
sidebar → settings → artifacts → themes → branch logic). Phase 9 (packaging)
shipped as installer 0.1.1/0.1.2 pre-pivot; **a fresh installer is owed for the
engine build** (next landing). REDESIGN-FOUNDATION's stack kept as chosen.

---

## The verdict, in one paragraph

The engine wiring the pivot promised is genuinely in — adapters, cards, skills
auto-load — with every judge-found defect fixed and tested (298 green); what is
NOT yet proven is the owner's own live round-trip, and two earlier claims in
this audit were corrected the same day (failover, gate wording). What
you mentioned that is **still missing** falls in six buckets: **(1) six
screens** (Today, Projects, Vault, Code, first-run init, appearance polish),
**(2) the undo half of the approval card**, (3) **session insights** feeding
Today, (4) the **vault/artifacts MCP server**, (5) the small honest pile of
chat-shell luxuries (branching, split chats, mermaid, exports, regenerate,
prompt library), and (6) **delivery** — the installer that puts all of this on
your desktop. Nothing on the list was quietly dropped; 🗑 items were your
explicit calls (multi-user, vector DB, Vercel, voice).
