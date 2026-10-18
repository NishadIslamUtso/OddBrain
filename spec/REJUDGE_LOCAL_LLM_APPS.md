# Rejudge — 10 Best Local LLM Apps 2026 + Our Branches

**Date:** 2026-10-12 · **Method:** cloned every repo and grepped real code. Not stars, not marketing, not the advisor's prose.

---

## ⚠ Finding 0 — The source article is vendor marketing

The "10 best local LLM apps in 2026" list is published **by the Atomic Chat team**, which ranks **itself #1**.
The article says so outright: *"It's also the app we build, so we'll be upfront about that."*

Verified: `Atomic-Chat/package.json` → `"name": "jan-app"`. Atomic Chat is a **fork of Jan**, and the
article's Atomic Chat section is nearly a copy of its own README (including the `6× faster` line, verbatim).

**Consequence:** every "best for X" label in that list is written by a competitor of the other nine apps.
Atomic Chat's section is self-reported and unbenchmarked. Treat its ranking as advertising, not evidence.

---

## 1. Verified repo facts (from GitHub API, 2026-10-12)

| # | App | Repository | Stars | Forks | License | Lang | Last push |
|---|-----|-----------|-------|-------|---------|------|-----------|
| 1 | Atomic Chat | https://github.com/AtomicBot-ai/Atomic-Chat | 1,759 | 198 | NOASSERTION* | TypeScript | 2026-10-10 |
| 1a | ↳ atomic-agent | https://github.com/AtomicBot-ai/atomic-agent | 3,256 | 268 | MIT | TypeScript | 2026-10-09 |
| 1b | ↳ atomic-llama-cpp-turboquant | https://github.com/AtomicBot-ai/atomic-llama-cpp-turboquant | 422 | 56 | MIT | C++ | 2026-10-06 |
| 2 | LM Studio | **no app repo** · CLI only: https://github.com/lmstudio-ai/lms | 5,347 | 463 | MIT | TypeScript | 2026-10-09 |
| 3 | Ollama | https://github.com/ollama/ollama | 182,802 | 18,223 | MIT | Go | 2026-10-12 |
| 4 | Jan | https://github.com/janhq/jan | 44,897 | 3,086 | NOASSERTION | Rust | 2026-10-12 |
| 5 | GPT4All | https://github.com/nomic-ai/gpt4all | 77,363 | 8,261 | MIT | C++ | **2025-05-27** |
| 6 | AnythingLLM | https://github.com/Mintplex-Labs/anything-llm | 66,955 | 7,472 | MIT | JavaScript | 2026-10-09 |
| 7 | Msty | **closed** · https://github.com/cloudstack-llc/msty-docs (68★) · msty-app-i18n (3★, archived) | — | — | — | — | — |
| 8 | Cherry Studio | https://github.com/CherryHQ/cherry-studio | 52,549 | 5,066 | AGPL-3.0 | TypeScript | 2026-10-12 |
| 9 | Open WebUI | https://github.com/open-webui/open-webui | 154,343 | 22,607 | NOASSERTION | Python | 2026-10-11 |
| 10 | BoltAI | https://github.com/BoltAI/BoltAI | 26 | 3 | none | — | 2026-09-20 |

\* `LICENSE` file text is Apache 2.0; GitHub cannot auto-detect it.

**Two red flags found:**
- **GPT4All last pushed 2025-05-27** — ~17 months stale. Effectively unmaintained despite 77k stars.
- **BoltAI has 26 stars and no license** — it is an issue tracker, not source. Mac-only, closed.

---

## 2. Atomic Chat claims — audited

| Advisor claim | Verdict | Evidence |
|---|---|---|
| Fork of Jan | ✅ TRUE | `package.json` `"name": "jan-app"`; 7 files still reference `@janhq/web-app` |
| TurboQuant 3-bit / KV-cache | ✅ TRUE | 244 files mention `turboquant`; `turbo3` 22, `turbo4` 9 |
| Multi-Token Prediction (MTP) | ✅ TRUE | 162 files mention `MTP`; 18 mention `multi-token` |
| "FlashBlock-diffusion" | ✅ TRUE (named **DFlash**) | 154 `DFlash` files; README: *"DFlash block-diffusion decoding — up to 6× faster"* |
| EAGLE-3 | ✅ TRUE | 39 files |
| 10+ extensions | ✅ TRUE (12) | `extensions/`: assistant, atomic-prism, conversational, download, foundation-models, llamacpp, llamacpp-upstream, mlx, rag, tensorrt-llm, vector-db, vllm |
| 6 engines | ✅ TRUE | turboquant, upstream llama.cpp, mlx-vlm, foundation-models, tensorrt-llm, vllm |
| iOS + Android native | ✅ TRUE | `src-tauri/tauri.ios.conf.json`, `src-tauri/tauri.android.conf.json` |
| One-click agent launch | ✅ TRUE | `web-app/src/constants/integrations.ts` |
| Apache 2.0 | ✅ TRUE | LICENSE file text |
| **Flash Attention toggle** | ❌ **NOT FOUND** | 0 matches for `flash_attention` / `flash-attention` |
| 6× / 8× speedup numbers | ⚠ SELF-REPORTED | Appear only in their README. No benchmark in repo. |

**Bottom line:** Atomic Chat is a real, substantial Jan fork with genuine inference-engine work.
But its headline numbers are **its own marketing**, and one claimed feature (Flash Attention toggle) does not exist.

---

## 3. Capability matrix (files mentioning each — rough proxy, not proof of a working feature)

| App | MCP | OpenAI-compat API | Ext/plugin system | GGUF | MLX | ONNX |
|---|--:|--:|:--:|--:|--:|--:|
| Cherry Studio | 979 | 143 | ✅ | 8 | 144 | 51 |
| Atomic Chat | 348 | 23 | ✅ (12 ext) | 654 | 457 | 9 |
| Jan | 357 | 15 | ✅ (7 ext) | 116 | 182 | 3 |
| Open WebUI | 93 | 3 | ✅ | 68 | 1 | 8 |
| AnythingLLM | 91 | 64 | ✅ | 9 | 44 | 12 |
| Ollama | 25 | 13 (`openai/`) | — | 116 | 335 | 0 |
| GPT4All | 9 | 0 | ❌ | 50 | 6 | 0 |

Verified specifics:
- **Ollama OpenAI compat** — real, dedicated `ollama/openai/` package (`openai.go`, `responses.go`).
- **Open WebUI RBAC** — real, roles (`admin`/`user`/`pending`) in `backend/open_webui/config.py`.
- **AnythingLLM LanceDB** — real, referenced in `server/` (`.env.example`, `endpoints/api/openai/index.js`).
- **GPT4All LocalDocs** — real, in README and Python bindings docs.
- **Cherry Studio "300+ assistants"** — **not verified**; no such catalog file found in a shallow clone.

---

## 4. Rejudged verdict — which app is actually best at what

| Category | Winner | Link | Why |
|---|---|---|---|
| **Inference performance / low VRAM** | Atomic Chat | [repo](https://github.com/AtomicBot-ai/Atomic-Chat) | Only app with TurboQuant + MTP + DFlash + EAGLE-3 in code. Matters most for a 4 GB VRAM TUF A15 |
| **Feature breadth (one window)** | Cherry Studio | [repo](https://github.com/CherryHQ/cherry-studio) | Highest MCP/RAG/extension counts; 52.5k★; AGPL-3.0 |
| **RAG / document knowledge base** | AnythingLLM | [repo](https://github.com/Mintplex-Labs/anything-llm) | LanceDB + Pinecone/Qdrant/Weaviate, workspaces, 30+ providers |
| **Team / self-hosted / multi-user** | Open WebUI | [repo](https://github.com/open-webui/open-webui) | 154k★, real RBAC, most extensible |
| **Backend / ecosystem / CLI** | Ollama | [repo](https://github.com/ollama/ollama) | 182k★, MIT, real OpenAI-compat layer — **this is what we already use** |
| **Beginner GUI** | LM Studio | [lms](https://github.com/lmstudio-ai/lms) | Polished, but desktop is closed-source with analytics on by default |
| **Mobile (iOS/Android)** | Atomic Chat | [repo](https://github.com/AtomicBot-ai/Atomic-Chat) | Only one with real Tauri iOS/Android configs |
| **Clean open-source base** | Jan | [repo](https://github.com/janhq/jan) | Upstream of Atomic Chat; 7 extensions; Rust/Tauri |
| ❌ **Avoid** | GPT4All | [repo](https://github.com/nomic-ai/gpt4all) | 17 months stale |
| ❌ **Avoid** | BoltAI | [repo](https://github.com/BoltAI/BoltAI) | 26★, no license, Mac-only, no source |

---

## 5. Rejudging our own branches — is `3eeced36` really better?

**Verdict: YES, it is the best of our branches — but the advisor's "8/8" is wrong. It is 7/8.**

`3eeced36` passes **70/70 tests** (verified by running them). Our current branch `3c06e1bf` passes **61/61**.

| Feature | 3eeced36 | 3c06e1bf (ours) |
|---|--:|--:|
| Sub-agents (6 roles) | **9** | **0** |
| Comment-mode pin | **3** | **0** |
| Live artifacts / Live badge | **52** | 9 |
| Stop keeps draft | **31** | 15 |
| Deployable ZIP | **5** | 3 |
| Citations | 0 | **8** (added this session) |
| Vision bridge | 4 | 5 |
| Branching | 2 | 3 |
| Capsule Hub / drag-drop | 39 | 39 |
| Vault 00-90 structure | 2 | 2 |
| Today view / Open Loops | 11 | 11 |
| Never-check blacklist | 9 | 9 |

**The error:** the advisor claimed `3eeced36` has **inline charts (pure SVG)**. It does **not**.

```
arena/3eeced36-ai-assistant   — NONE —
arena/3c06e1bf-ai-assistant   — NONE —
arena/abc0197f-ai-assistant   src/components/ChartBlock.jsx + src/lib/chart.js + tests/chart.test.js
arena/cb0eb781-ai-assistant   src/components/InlineChart.jsx + src/lib/chart.js + tests/chart.test.js
```

Inline charts live on **`abc0197f`** and **`cb0eb781`** — two *different* branches. Neither `3eeced36`
nor our branch has it. So `3eeced36` = **7/8**, and the 8th feature must be ported from `cb0eb781`.

---

## 6. Recommendation

1. **Keep Ollama as the backend.** It is the most-starred, MIT-licensed, ecosystem-standard choice, and it is already working in our stack. Atomic Chat's speed claims are self-reported and would mean replacing a working backend with a 1.7k★ Jan fork.
2. **Adopt `3eeced36` as the base branch** — it is measurably ahead of ours (sub-agents, comment pin, live artifacts, stop-keeps-draft) and its 70 tests pass.
3. **Port inline charts from `cb0eb781`** (`InlineChart.jsx` + `lib/chart.js`) to reach a genuine 8/8.
4. **Keep our `citations.js`** — `3eeced36` has zero citations; ours has it. Merge forward, don't drop.
5. **Steal from Atomic Chat only what is verifiable**: the TurboQuant/KV-cache idea is real, but porting its engine is a large project. Do not adopt it on the strength of its own marketing.

---

**Verified by:** cloning all 9 open repos and grepping source; GitHub API for stars/licenses/dates;
running `npm test` on `3eeced36` (70/70) and `3c06e1bf` (61/61).
