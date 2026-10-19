# Project context

The single maintained project-context document, alongside the [README](README.md). Updated 2026-10-19 (Asia/Dhaka). Code and dated verification outrank old handover claims.

A local-first desktop AI assistant for Windows. The owner's own words: **"my assistant that helps me do things in pc and everything."**

Target acceptance machine: ASUS TUF A15, Ryzen 7, 8 GB RAM, RTX 3050 4 GB, Windows 11, 1920×1080 @ 125% (1536×864 logical). Keep downloads and memory use modest; this hardware is a test target, not a restriction to a single person’s workflow.

**Documentation boundary:** README is the entry point; this file owns requirements, architecture, decisions, status and audit evidence. The obsolete `.ai/{CONTEXT,STATE,INDEX}.json` handovers have been retired: they named an old branch, deleted documents and a nonexistent limitation on extension pairing. Their still-relevant context is incorporated here; their original contents remain in Git history at `9977ae2`. Do not recreate parallel handover/TODO files.

Runtime Markdown is intentionally preserved: `vault/Brain/` holds actual vault content, templates and engine rulebooks; `apps/03_oddbrain/store/packs/` contains installable prompts and `SKILL.md` files. The root `THIRD_PARTY_NOTICES` preserves the legal notice from the removed prototype and ships with the desktop app. These are not competing project-context documents. This is **two root documentation files**, not a claim that the repository contains only two Markdown files.

**Current working branch: `arena/cc83a507-oddbrain`.** Based on the entire `clean-build` tree at `6835309cdfc3a3b5a16cea5b80f38c318badb934`, including its PDF fix and test shim. The reviewed appearance/navigation foundation is retained; the memory workflow and extension changes described below are layered on top. Product work was published at `b9d4072`, then durable capture at `9977ae2ef764c80332ab282f648e07f2cf72c763`. This audit independently confirmed that remote tip and byte-compared every tracked working file against it before editing documentation. No other branch was merged during the audit or subsequent selective integration.

---

## Current status and next work

| Work | State |
|---|---|
| Stage 1: reliable capture | Implemented and published at `9977ae2`; normal browser-restart recovery tested. Not a guarantee of complete account capture or all failures being handled. |
| Stage 2: useful recall | Pending: search original messages and memory, source-linked recall, grouped interpretation review and shared confirmed facts. |
| Stage 3: comfortable daily use | Navigation declutter implemented: grouped Settings, optional Looks lab, People management disclosure. Richer People/Journal/Life Story and unified setup remain pending. |
| Verified reliability repairs | Integrated after the audit: vault preview guard, chapter-cycle handling, damaged memory-state handling, organizer lifecycle, artifact/checkpoint/key persistence edge cases and test timeout forwarding. Regression cases now run on this branch; see the integration record below. |
| Documentation | README + this context file; stale `.ai` handovers retired. No runtime Markdown or feature removed. |

Targeted reliability integration is complete; Stage 1’s queue is unchanged. Next product work remains Stages 2/3 and real-machine acceptance. No blanket merge is justified by a higher test count.

## The laws

1. **Honesty above all.** No invented model names, no colored-dot lies — words, not dots. Every number on screen is countable from records the user can see. A feature that does not exist gets one muted line, never a nav item.
2. **Engines are exactly two**: `claude-code` and `agy`. Ollama is the local brain server, not an engine. Cloud keys ride claude-code.
3. **Automatic conversation capture is on for supported AI sites after pairing.** People/Classroom sites require explicit site grants. No browser-history collection; existing visits are preserved. Collection is limited to accessible content in open conversations, not an account-wide archive.
4. **Stay within the authorized work.** The three-stage daily-use plan is authorized; the user subsequently authorized selective integration of the demonstrated repairs, not wholesale replacement by another branch. Ask about consequential ambiguities, not already-settled goals. Real-machine reports outrank every plan.
5. **Features need regression tests and scoped verification.** Target gate: typecheck, full suite, builds, native smoke and Linux/Windows CI. State which checks actually ran, the source SHA, and any skips. Green tests establish their assertions, not universal correctness.
6. One landing = one commit. No new fonts, no cloud services, no telemetry. The in-app Ollama downloader is benched by owner decision — the route is `winget install Ollama.Ollama` (any installed copy is found automatically).

## Repo map

| Path | What it is |
|---|---|
| `apps/03_oddbrain/` | **The app.** Electron 41 + React 19 + Vite. Main process `src/main/`, renderer `src/renderer/src/`, tests `tests/`. |
| `extension/` | Chromium MV3 companion (0.5.0). Incremental open-conversation/message/media capture, progress, explicit context insertion and secondary manual clipping; no browser history. |
| `vault/Brain/` | Second brain: engine rulebooks (`CLAUDE.md`, `AGENTS.md`), sources, memory structure, templates. Seeded canonical; the real folder is chosen in-app at runtime. |
| `apps/03_oddbrain/store/packs/` | Starter packs the in-app store installs. |

## The UI/UX — the owner's branch, verbatim

The complete appearance inventory, built by the owner personally (authority: SPEC rev 2 on branch `agent-resources` under `OddBrain-UIUX-Handoff/`):

- **8 layouts** — classic sidebar, top bar, rail+list, two-pane, command-first, bento, console, floating — each with a live diagram choice, plus Full/Icon-rail sidebar and "Compare structures".
- **16 preset rows = 8 named looks × light/dark** (Warm Editorial, Cozy Studio, Quiet Minimal, Playful Lab, Ink & Sketchbook, Terminal/Engineer, Retro Desktop, Glass/Futuristic).
- **10 palettes** (app default + 9: Studio, Paper & Plum, Midnight Ink, Sage Notes, Peach Fuzz, Blue Hour, Citrus, Rose After Dark, Quiet Graphite) · **4 interface styles** (Editorial, Soft studio, Ink & paper, Glass studio) · accent follow-or-override.
- **Looks lab**: Compare looks · Taste quiz (5 questions) · My shortlist · gallery · My mixes · Custom look.
- **All 16 bundled design systems** (Claude, Linear, Apple, Stripe, Notion, Vercel, Airbnb, Glassmorphism, Neobrutalism, Editorial, Retro, Dashboard, Shadcn, Minimal, Modern, Default) applied as complete token sets to every screen.
- **All 77 mascot SVGs byte-exact** with the 8 real state roles (idle/thinking/working/waiting/done/searching/making/resting) · motion modes Calm/Balanced/Playful/Still + speed/pause.
- **8 Settings groups with 17 retained pages**, size table per SPEC §2 (15px settings headings, 13px body, 14.5px conversation, 44px bars, 260px sidebar), honest rows only.

## Standing product and design decisions

- Use the bundled `frontend-design` and `webapp-testing` skills when changing UI, plus [no-ai-slop](https://github.com/petergyang/no-ai-slop). The owner’s approved handoff is the design authority except where these explicit avoid rules override it.
- Avoid purple/blue gradients, gradient text, glows, frosted glass, generic icon tiles, uniform/nested cards, accent stripes, fake statistics, fake status dots, marketing jargon, excessive em dashes, beige/italic/serif clichés and emoji substitutes. Do not replace original artwork with decorative stand-ins or use Inter indiscriminately. Preserve the existing selectable looks, including styles that are not a new default recommendation.
- Preserve all appearance controls and exports: layouts, looks, palette/style/font/scale, motion/speed/pause, compare, quiz, shortlist, notes, custom mixes and import/export. Apply styles across the whole app, not just colors; retain the small working Home/Chat appearance preview and established defaults.
- Keep the original brain artwork, personality and 77 scenes. Normal launch uses the full window for the assembling brain/wordmark and moving letters, not a boxed splash. Respect reduced motion. Interaction should be witty and mischievous, with task-appropriate scenes and language.
- Sidebar footer is name + brain leading to Settings. Move utility actions instead of deleting them. Brand opens New chat; Back sits beside it. Settings close remains in its approved position. Remove the standalone name-only You screen; name stays in Appearance. Keep graph customization, projects, artifacts, vault and connector controls.
- Avoid redundant instructions, decorative “Local”/live indicators and “recommended” next to 4 GB VRAM. Keep meaningful task, approval, privacy and error feedback. Do not remove substantive controls merely to simplify a screenshot.
- Engines are installed separately. Keep explicit executable selection, connectors and permission cards. Remove engine-download and logo/SVG-download UI where directed, not artwork/catalog/artifact exports. Jarvis/wake-word/continuous listening is parked; read-aloud and dictation are separate.
- Build a general-purpose assistant, not a personalized demo-only shell. Samples must be visibly isolated from real data and let users explore the app without fake live claims. Attachment processing uses the selected/enabled provider, never a silent substitute.
- Collection should become automatic after pairing and one-time site permissions, with meaningful progress and incremental updates. Include AI chats and human messages; exclude Facebook posts/comments. The user accepts collection while a signed-in website conversation is open, not a promise of invisible account-wide history capture.
- Keep AI conversations separate from human relationships. Accounts/names become the same person only with explicit user confirmation. Human conversations inform detailed People profiles; owner-related material belongs in Journal and Life Story. Life Story should support detailed history-book chapters, keeping AI drafts distinct from confirmed information. All interpretations, including feelings, need review before permanent memory.
- Keep raw source material and provenance independently of model interpretation. No hidden credential/token extraction, password/payment-field capture, unsent drafts, keystroke logging or continuous screenshots. Never bypass platform restrictions. Model quality is not UI quality; only expose capabilities actually supported by the chosen model.
- Explicit capsule/context insertion never presses Send. Retain capsule library/versioning and writing-help controls, but do not silently insert private confirmed memory into cached or remote suggestions.

## Retained functionality

- Engines `claude-code` + `agy`: found via npm dir / PATH / Programs / staging; **"Point to the exe…"** persists an override that beats every probe; "Use automatic detection" clears it.
- **Ollama auto-starts at boot** from the user's installed copy (`%LOCALAPPDATA%\Programs\Ollama\ollama.exe` → PATH → staged copy); pid in `userData/ollama/serve.pid`; Stop kills only what the app started. Connectors knocks `127.0.0.1:11434`, counts real brains, "Start the brain door" when nothing answers.
- Guarded media intake (image/audio/video/document decode with named refusals, selected-provider only, no silent switching), Windows-native read-aloud + dictation (no microphone when off), engine marketplace pane reading the REAL Claude CLI catalog with mutations behind the app's permission cards, checkpoints (keep/restore), per-hop pinned downloads, security walls (`shellSafeCommand`, keys-in-main, pairing consent, zip forged-declaration checks), extension capture, thinking folds, work line, turn journal.

**Not yet real:** the owner's full acceptance run on the TUF A15 (the bar for "works"); a signed-in agy live turn; a signed release (Windows shows "unknown publisher" — stated, not hidden).

## Selective reliability upgrade

The reviewed lanes were integrated selectively, not merged wholesale. The app remains in `apps/03_oddbrain/`; starter vault files, appearance/navigation, memory review and the browser companion remain intact.

- **Engines and stores:** cancellation/routing fixes, independent Ollama/Anthropic model discovery, provider-aware model selection and stale-response protection. Switching engines during an active task is refused with an explicit explanation rather than falsely promising a switch. Failed skill installations remain retryable, not marked installed.
- **Network and attachments:** shared bounded-response handling, strict image-count/base64/size checks, HTTPS provider safeguards, and complete commit-pinned skill bundles with licenses/support files. Existing engine skills are never replaced by a catalog install; remove or relocate them deliberately before reinstalling.
- **Diagnostics and MCP:** sign-in and Ollama-version diagnostics, editable MCP configuration, verified collision-safe backups and staged multi-file saves. Backup failure stops saving; ordinary replacement failures trigger rollback. This is not power-loss atomic, and symlinked configuration paths are refused.
- **Vault repairs:** root-level writes work; dangling/linked paths are refused; source code is no longer hidden by the runtime-vault ignore rule. Markdown export requires a new external destination, refuses incomplete walks and removes its own partial copy on failure. It is not a full backup of media or the memory review database.

## Retained clean-build PDF fix

`src/main/media/documents.ts` — pdfjs's Node factories read `standardFontDataUrl` / `cMapUrl` / `wasmUrl` as filesystem paths that must end in `/`. The old code appended the platform separator: on Windows that produced `...\pdfjs-dist\cmaps\`, which pdfjs rejects — **PDF attachment extraction failed on Windows CI** (caught by `tests/media-decoding.test.ts` on Windows CI). Now the paths are normalized to forward slashes with a trailing slash. Windows APIs accept forward slashes; pdfjs's own Node factory `fs.readFile`s the result. Plus a test-env shim (`tests/shims/promise.ts`) so Node-20 sandboxes can run the same suite the app's Node-22 runtime passes — app code untouched by it.


## Memory workflow and browser companion (0.5.0)

### What exists / why / how

- **Brain → Memory inbox, People, Journal, Life Story, Map, Engine notes.** The original customizable graph and legacy engine-memory controls remain available. Today links pending interpretations; Chat → More chat tools → Memory inbox opens review without sending or discarding the draft. Configuration stays under Settings → Memory.
- **Vault → Capture sources** replaces the Browsing Maps settings screen. Its old settings destination is a shortcut to Vault, not a second source inspector. Existing files, captures and visit-only records remain readable; new `browser_visit` writes are refused, including from an outdated extension.
- **Three layers:** immutable observations → AI proposals → explicitly confirmed memory. Approval/edit/rejection is per interpretation, separate from engine action permissions. Confirmed records can be corrected or withdrawn with revision history. AI replies cannot become owner-life facts. Feelings remain the owner's self-report, not inferred reciprocation.
- **People:** source-conversation-scoped accounts, not name-only identity guesses. Create profiles, preview/confirm account links or merges, and undo merges with stale-link checks. Profiles collect approved records, source paths and independently authored notes from merged profiles. Unknown platform IDs are not invented.
- **Journal:** source-linked personal events, separate from the engine turn log. Unknown event dates remain unknown; capture time is not substituted for event time.
- **Life Story:** reviewed narrative passages plus an explicit history-book chapter workflow. Select confirmed owner records, give a chapter title, queue an AI draft, then review it separately. Chapters retain frozen input revisions and source provenance; correcting underlying records flags older drafts/chapters. No fabricated timeline or automatic publication. A chapter batch is at most 32 records / 12,000 evidence characters; split a larger period into more chapters rather than silently truncate it.
- **Organizer:** tool-free text requests to the selected engine's model (or an explicit model identifier), not a second reduced model or agent session. Up to 6,000 source characters per passage, at most eight proposals, one request at a time, 90-second timeout. Foreground engine work, chat inference and review take priority and cancel its request. External processing defaults off and requires separate consent plus applicable inference permissions. There is no verified tool-free `agy` channel: configure a local or saved-key model explicitly instead of silently falling back. Transport failures pause processing until a settings change or explicit retry/check; no automatic paid retry loop.
- **Persistence:** review state and frozen chapter evidence live under `06 Review/Organizer/`; approved projections under `03 Memory/People/`, `08 Journal/Personal/` and `03 Memory/Life Story/`. Projection hashes protect external edits from overwriting. Source-backed capsules are available only after approval and only through explicit selection/insertion; neither remote context matching nor cached typing suggestions use them. Their corrections go through Memory inbox, not the extension's ordinary capsule-version editor.

### Install and collection coverage

1. Build/run the updated desktop app. Load `extension/` unpacked from Chrome/Edge's extension manager with Developer mode enabled. Packaged desktop builds place it in `resources/extension`.
2. Copy the pairing token from the app's extension/Agent access controls to extension **Settings → Connected app → Save & test connection**. Allow browser capture and choose the intended vault. Default loopback port: 8765; change it in the extension if the app reports another port.
3. Enable the people/Classroom sites you want in extension settings and grant their site access once. Reload existing tabs after changing grants. Open the conversation itself, not just its inbox.
4. Keep the tab open until text and any desired files are saved or fully queued. “Queued on this browser” is not a desktop receipt; protected data can retry after the tab closes. Incomplete downloads still need the source tab. Pause stops collection and queued replay. Browser history is neither requested nor listened to; an obsolete grant is revoked where the browser permits it. Original saved data is not deleted.

Experimental readers: ChatGPT, Claude, Gemini, Google AI Studio, DeepSeek, Arena, GLM/Z.ai, Kimi, Grok, Qwen, Mistral Le Chat, Perplexity, Copilot and Poe; opt-in Messenger/Facebook Messages, Instagram DMs, WhatsApp Web, Slack, Discord's opened channel and Google Classroom streams. Facebook posts, Instagram feeds, unsent drafts and inbox previews are excluded. The passive Discord reader is not a self-bot or a claim of platform approval; service/workspace rules still apply.

New/changed message checksums are compared with the vault. Full current messages, immutable revisions, titles/order evidence and attachment receipts live under `02 Sources/Conversations/Browser/<hash>/`. Transfer chunks are 512 KiB; files over 256 MiB and messages over 8 million characters are visibly refused, not truncated. Completed attachment transfers are not downloaded again. Rendered images can be previews rather than originals, and that distinction is retained. Newly saved in-app OddBrain conversations also have structured text sidecars; their original Markdown, context, thinking and attachment files remain intact.

**Limits, not promises:** readers see loaded DOM only. No account crawling, opening chats, auto-scrolling older history, mobile/native-app capture, hidden-token extraction, encrypted-history restoration or restricted/view-once bypass. Authenticated live-site layouts have not been validated here. CORS, redirects, expired links, off-page media and MediaSource blobs can prevent media saving. There is no OCR, transcription or media understanding in this organizer. Conversation writes are queued transactionally in extension IndexedDB before replay. Complete queued text/files survive normal browser restarts; unloaded messages and bytes not yet downloaded do not. Partial file chunks are retained and reused by hash, but downloading an incomplete file still requires reopening its source; HTTP byte-range resume is not implemented. Legacy manual captures retain their separate bounded outbox.

**Durable capture (0.5):** the browser queue is bounded to 128 MiB / 4,096 operations, with an 18 MiB per-operation limit and explicit storage-full/write-failure messages. `unlimitedStorage` protects extension storage from browser quota/eviction rules; the app still enforces those bounds. It grants no additional site access. The extension must verify its paired vault online once before collecting offline. Retry wakes on browser startup and the existing one-minute alarm, uses only the paired loopback app, checks current site grants/exclusions, and sends only changed message bodies. No worker downloads remote attachments or runs a model.

Queued bytes are tied to the pairing and a persistent vault identity (`.oddbrain/capture-destination`). Changing vaults holds old captures rather than sending them to the new vault. Pause retains the queue; disabling a site, excluding it, removing its grant, or a capture/pairing refusal removes applicable waiting data. Re-pairing/forgetting and outbox clearing also remove waiting copies with confirmation. Activity → Outbox shows waiting conversations and supports individual discard. Retain the vault identity in backups if you need pending captures to reconnect to a restored vault. Browser profile deletion, uninstalling the extension or clearing its storage removes the browser copies; this is not an independent backup or a power-loss durability guarantee.

**Daily-use improvements in progress:** durable capture is the first completed stage. Source-linked recall, grouped interpretation review, content-first People/Journal/Life Story and consolidated setup are still pending; they are not claimed as implemented by this update.

Discovery examines the current committed message revisions, at most 64 new passages per pass, with a 15,000-JSON-file scan cap per source tree and visible coverage/error notices. Raw older revisions remain on disk; legacy Markdown-only conversations are not automatically backfilled. A single malformed source is reported without stopping healthy ones. The organizer runs while the desktop app is open, not as an independent OS service.

The extension keeps the app's original artwork and synchronized appearance; the browser controls panel geometry. Manual clipping remains available (60,000-character readable preview or 400-node visible outline), as do a persistent side panel, never-check exclusions, activity/outbox review and explicit capsule insertion that never presses Send.

### Verification scope

Use `npm run test:ui` for the original eight renderer suites plus the memory workflow browser suite. `ODDBRAIN_BROWSER_OPTIONS` points to a Playwright launch-options JSON for an installed Chromium executable. `node extension/scripts/check-browser.cjs` tests the actual popup/companion with clearly simulated browser APIs; `tests/conversation-runner.test.ts` connects the real content reader to a temporary paired vault. These do **not** replace a loaded-MV3-extension/Windows acceptance pass.

Still unverified: real model interpretation quality on personal data; signed-in live site selectors; native permission dialogs; service-worker suspension/restart; Windows Electron IPC and foreground-model cancellation on the target laptop. The earlier local validation did not run native smoke or produce an installer. This audit separately confirmed successful Linux/Windows CI build and smoke steps for published `9977ae2` in [run 39157446753](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39157446753). That does not establish acceptance on the target laptop or a signed release.

## Build, verify, ship

```
cd apps/03_oddbrain
npm ci --ignore-scripts && node node_modules/electron/install.js
npx tsc --noEmit -p tsconfig.json     # 0 errors
npx vitest run --maxWorkers=2          # use fewer workers on constrained machines
npm run build
npm run smoke                          # requires a working native Electron runtime
npm run dist:win                       # Windows installer (CI builds the artifact)
```

CI (`.github/workflows/`): `checks.yml` runs on Linux + Windows per push; `installer.yml` builds a commit-named Windows installer artifact. Report the actual artifact/commit, not a fixed historical installer size. Installing a successfully built unsigned artifact is not equivalent to native acceptance.

## Branch map (verified 2026-10-19)

| Branch | Observed tip / role |
|---|---|
| `arena/cc83a507-oddbrain` | Product baseline `9977ae2`; this session only. Documentation consolidation follows it. |
| `main`, `v3` | `a6c7807`; neither changed by this work. |
| `arena/495d260c-oddbrain` / PR11 | `80fcadb`; scanner/guard/memory validation fixes on an exact copy of `b9d4072`. |
| `arena/81a07155-oddbrain` / PR12 | `b2be19f`; integration/security work based on `df4226a`, not the later memory/capture tree. |
| `arena/ea5c07b0-oddbrain` | `6baff89`; the later artifact recovery and organizer fixes. **Not PR12’s head.** |
| `clean-build` | `d28f0d3`; absorbed `b9d4072`, then added CI/browser/redirect/manual-queue-test changes. |
| `agent-resources` | Design reference: `OddBrain-UIUX-Handoff/` (SPEC rev 2), `reference/session-v2/`, `workspace-notes/DECISIONS.json`, `uploads/OddBrain.html`. |
| `archive/workspace` | Historical workspace/reference uploads, not live implementation. |

Always work on this session’s branch. Fetch and inspect before comparing; do not reset/overwrite working files to another agent’s tree. Preserve appearance, vault content and durable capture when adapting specific fixes. Publication requires an actual push and remote verification, not merely a local commit.

Historical clean-build measurements: **124 test files / 858 tests**. These are baseline results, not proof of the newer workflow or native acceptance. Current verification is recorded below.


**Prior implementation verification at `9977ae2` (2026-10-19, sandbox; not a fresh full-suite run in this audit):** 1,021 tests across 147 files passed with no skips (including the Chromium conversation-reader/paired-vault fixture and real IndexedDB recovery across a full Chromium restart); TypeScript, Electron build and web build passed. All nine app browser suites and the extension browser suite passed. The builds still emit the existing CSS `::highlight` optimizer notices and the web bundle-size warning. Native Windows/live-account acceptance remains outstanding. No installer or signed release was produced by this validation.

Extension structural-selector references (facts, not copied automation): [timeline adapters](https://github.com/houyanchao/chatgpt-gemini-timeline/tree/main/js/timeline/adapters), [Defuddle's Grok extractor](https://github.com/kepano/defuddle/blob/main/src/extractors/grok.ts), [Arena site configuration](https://github.com/lumingya/universal-web-api/blob/main/config/sites/arena.ai.json). These are secondary evidence, not authenticated live-site verification.

## Independent audit of other agents’ claims

**Historical baseline:** this audit was recorded at `6f78969` against product `9977ae2`. The faults described below have since been selectively repaired here as recorded in the integration section; the original findings remain for provenance.

**Method and scope (2026-10-19):** fetched remote refs, checked commit tree IDs and diffs, queried GitHub run/job/artifact records, read workflow implementations, and ran targeted regression tests in isolated `git archive` snapshots. No product code was modified or other branch merged. Local audit dependencies came from the published `9977ae2` lockfile; snapshots reused those dependencies. This is a differential check of the cited source fixes, not an independent clean-room recreation of each branch’s complete install.

### Verdicts

| Claim | Finding |
|---|---|
| PR11’s `7296f2e` exactly copied `b9d4072` | **Verified.** Both tree IDs are `15e289b6ae324a012467d3aa83bd57d86381da01`. At `80fcadb`, the delta from that baseline is exactly 15 modified + 2 added files, no deletions. |
| PR12’s `b8a2be5` exactly copied `df4226a85be1efd67f8cb5ed7c4d4f63e223d38c` | **Verified.** Both tree IDs are `f7874ef18f2c53176471d89e923af8a6f311e5cc`. It is an older snapshot, not a copy of current `9977ae2`. |
| PR11 repaired the wrong Ollama endpoint text, chapter loop, damaged memory-state boundary and vault preview route | **Verified by source and differential tests.** These failures also reproduce on our current product baseline, not just the older copy. |
| PR11 fixed ignored test timeouts | **Partly true.** The marketplace test now uses a supported second-argument options object. The shim still discards third-argument options used by three `engine-battle.test.ts` tests. Instrumenting the actual `80fcadb` shim returned `{timeout:20000}` for the second argument and `{}` for the third. Do not call this a complete timeout fix. |
| PR11 adds Linux browser/no-skip enforcement and Windows exactly-one-browser-skip enforcement | **Verified.** The workflow contains those checks and the corresponding steps succeeded in push run `39157648824`. PR run `39157653922` is also successful at the stated SHA. This is not Windows real-browser coverage. |
| A default/CI browser skip disproves the prior README’s browser-enabled sandbox “no skips” result | **Incorrect inference.** These are different launch environments. The old CI lacked browser provisioning, which is a real coverage gap; it does not disprove a separate browser-enabled local run. |
| PR12’s `b2be19f` has green typecheck/test/build/native-smoke CI | **Verified at job/step level** in `39156569648`; PR run `39156574741` also succeeded. That does not establish signed-in engine behavior or target-laptop acceptance. |
| `93f0785` artifact recovery and `6baff89` organizer work are part of PR12 | **Wrong attribution if stated that way.** Those commits exist on `arena/ea5c07b0-oddbrain`; PR12 remains at `b2be19f`. Their respective implementation commits are `3153bde`/`0e92818` and `bc889da`; the cited tips are verification-note commits. |
| The four organizer lifecycle defects are real and repaired in the later lane | **Verified.** All four regressions fail against `9977ae2` and pass on `6baff89`: privacy-preflight busy wedge, cross-vault transport backoff, stale-vault late error and post-timeout late success. |
| Later artifact/checkpoint/key persistence repairs address real faults | **Verified in targeted tests.** Orphaned/gapped versions, duplicate/broken/linked artifact entries, checkpoint name collisions and failed key persistence/permissions all have failing baseline assertions and passing repaired assertions. This does not establish power-loss atomicity. |
| clean-build contains `b9d4072` plus browser CI, redirect hardening and a queue-cap test | **Verified in ancestry and diff.** Relative to `b9d4072`, its final delta is four files: workflow, README, main-process pull redirect policy and a legacy manual-outbox test. It does not include Stage 1’s newer conversation queue. |
| clean-build’s earlier Windows-browser claim at `7c9e6f7` was premature, then `9eabdf6` failed and `67cdaf1` fixed it | **Supported by committed workflow and run records.** `7c9e6f7` lacked the Windows Chromium step; `9eabdf6` used invalid job-level `runner.temp` and run `39157868003` failed; `67cdaf1` publishes the path through `GITHUB_ENV`, with successful run `39158560089`. |
| Final clean-build CI and installer are green | **Verified metadata.** Checks `39159302764` and installer `39159302188` succeed at `d28f0d3`. The non-expired artifact is `OddBrain-Setup-d28f0d350bba92f8285e01c1ac4f0a41db1bc3c1`, 117,764,397 bytes (112.3 MiB). That is GitHub’s artifact archive size, not independently measured EXE size; it was not downloaded or installed here. |
| Their complete totals (883, 1,022, 1,026, 1,028/1,029, 1,011) are independently confirmed by this audit | **Not established.** Run/step success and relevant skip-policy checks are confirmed, but log downloads fail at the sandbox-restricted `results-receiver.actions.githubusercontent.com` host. Do not imply that those complete log totals were read. Local targeted totals are below. |
| “Everything works,” “no real defects,” “only weakness,” or a higher count establishes the best branch | **Not justified.** Real failures survive earlier green suites. Branches differ in feature scope and baseline; none of these reports establishes all native/account/media behavior. |

### Local differential evidence

- On PR11 `80fcadb`: **50/50 passed** across `memory-workspace`, `memory-state-repair`, `vault-preview-route` and `ollama-version`; **2/2** extra audit assertions passed for nested-state rejection and actionable invalid-JSON errors.
- On organizer lane `6baff89`: **44/44 passed** across `memory-workspace`, `artifact-recovery`, `history-durability` and `key-storage-durability`.
- On our product `9977ae2`, using the new regression cases from those branches: **23 failed / 31 passed / 1 deliberately filtered** across six files. The filtered case references `VAULT_ROUTES`, an export introduced by PR11; its absence is not counted as a reproduced product defect. The two additional malformed-state assertions also failed. These are assertion counts, not 25 distinct bugs.
- The first isolated runs lacked `extension/`, causing one fixture-path error per snapshot. After extracting each branch’s actual extension files, that harness error disappeared. Only the corrected runs above count as evidence.
- Reproduce by extracting the stated refs without switching the working branch, installing dependencies, and running `vitest run` on the named test files. For the baseline comparison, use the later regression tests with the baseline implementation; append both branches’ new memory test groups to the common `b9d4072` memory suite. Avoid importing new implementation-only helpers into baseline tests. Temporary snapshots/logs are under ignored `.cache/claim-audit/` and may not survive a workspace snapshot.

### Evidence links

- [PR11](https://github.com/NishadIslamUtso/OddBrain/pull/11) · [push checks](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39157648824) · [PR checks](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39157653922)
- [PR12](https://github.com/NishadIslamUtso/OddBrain/pull/12) · [push checks](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39156569648)
- [Artifact recovery verification](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39156535384) · [organizer verification](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39157077979) · [organizer implementation](https://github.com/NishadIslamUtso/OddBrain/commit/bc889da)
- [clean-build parity fix](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39158560089) · [final checks](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39159302764) · [installer](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39159302188)

**Queue distinction:** the legacy manual capture outbox is 200 items / 4 MB; the new conversation IndexedDB outbox is 128 MiB / 4,096 operations. A test of the former does not validate the latter. Audits of `b9d4072` do not establish the behavior of the later `9977ae2` capture-recovery implementation.

**Decision at audit time:** keep the current product branch as the integration base. The cited lanes contain useful, demonstrably necessary repairs, but none is a safe wholesale replacement for the current feature set. The audit itself did not fix the faults or complete Stages 2/3. The user then authorized the integration below.

## Selective reliability integration (2026-10-19)

Authorized after the independent audit. Source fixes were adapted from `80fcadb` (PR11), `6baff89` (artifact/organizer lane) and `d28f0d3` (clean-build), not merged as whole branches. PR12’s older feature tree was not substituted for this one.

### Changes and preserved behavior

- **Vault previews:** allow the renderer’s existing same-origin GET route through the API guard, retain vault path/link restrictions and distinguish a missing file from an empty note. Renderer error messages expose the actual refusal rather than a generic sentence. No navigation, styling or controls changed.
- **Memory state and chapters:** reject malformed state with the repair file’s path, without resetting it; detect cyclic chapter evidence. Adapted the imported validator to accept older valid version-1 files lacking `discoveryWarnings`. An existing empty state file is corruption, not a new workspace; only a genuinely absent file initializes empty memory.
- **Organizer:** complete privacy preflight before marking work active; scope transport backoff to the vault/configuration; ignore stale-vault failures; discard late success after the timeout even if the transport ignored abort. Existing review/approval and external-processing permissions remain in force.
- **Artifact history:** recover orphaned versions into existing history without renumbering earlier public slots or replacing selected content/metadata. Ignore linked/broken/non-file entries during recovery. Deduplicate identities and use exclusive version writes so gaps or interrupted index updates cannot overwrite earlier versions.
- **Checkpoints and keys:** exclusive checkpoint filenames preserve same-millisecond preimages. Encrypt credentials before replacing the private file, and update in-memory state only after persistence succeeds. Tests cover failed set and failed clear, plus Linux file permissions. These are not power-loss or concurrent-multi-process atomicity guarantees.
- **Ollama:** diagnostics use the configured endpoint; model pull refuses redirects, consistent with the existing model-discovery/delete boundary.
- **Test runner:** forward both canonical second-argument and existing legacy third-argument timeouts. Restore mocks after synchronous exceptions, rejected promises and failing cleanup hooks. Added independent tests of the actual shim’s registration and cleanup behavior.
- **CI:** use `npm ci` and two test workers on both OSes; install Chromium through Playwright and publish its actual path via `GITHUB_ENV`. Require the reader and durable-restart suites to exist and run, not merely report zero skips. Linux permits no skips; Windows allows only the two named artifact-symlink cases and the POSIX key-permissions case. Unknown skips fail. Linux also runs the actual extension UI harness. JUnit and native-smoke logs are uploaded, and smoke exit codes survive output capture.
- **Preserved byte-for-byte relative to `9977ae2`:** the entire extension (including the 0.5 durable conversation queue), starter vault, appearance state and UI artwork/catalog sources. Existing conversation-worker tests remain, with clean-build’s separate 200-item manual-outbox test added alongside them. No new Markdown document, dependency or branch relocation was introduced.

### Validation

- Full suite: **1,067 passed across 154 files, zero skips**, with real Chromium enabled. Includes original reader-to-vault integration, IndexedDB restart recovery and the new repairs. `check-ci-tests.cjs` accepted the generated full JUnit report; its own regressions reject missing/skipped browser suites, unexpected platform skips, malformed reports and inconsistent counters.
- TypeScript and Electron/web builds passed. Existing CSS `::highlight` optimizer and bundle-size warnings remain.
- All nine app browser suites passed, including the full appearance/layout inventory, graph, samples and reviewed memory flow. The extension harness passed its queue/privacy/discard checks and 8 looks × 2 surfaces × 4 screens.
- One UI navigation check initially exceeded its 7-second deadline while full-suite and browser runs competed for resources. The complete nine-suite UI run passed when rerun serially; no timeout was relaxed and no assertion removed.
- Browser dependencies were restored in ignored cache storage. Initial browser setup failed before launch because of module resolution/shared-library availability; those environment issues were fixed before the full browser-enabled run. No generated binary, screenshot or audit log is committed.
- Local logs: `.cache/integrate/{full-tests.log,full.xml,typecheck.log,build.log,build-web.log,app-ui.log,extension-ui.log}`. Cache files are temporary, not durable published evidence. Cross-platform CI for implementation commit `d3109c9bdd464e75023823956cc082eb9d75aaf4` is **successful**: [run 39203436593](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39203436593). Both Linux and Windows passed Chromium setup, typecheck, full tests, the explicit browser/skip gate, build and native Electron smoke. Linux also passed the extension UI harness and browser-preview build. JUnit/native-smoke evidence was uploaded. These are this implementation’s checks, not the older baseline’s green run. The follow-up receipt commit changes only this context file and skips redundant CI.
- CI reports a non-failing deprecation warning for existing GitHub Action major versions using a Node 20 action runtime; the app/test runtime is Node 22. Updating those actions is separate maintenance, not a failing application check.
- Native Windows target-laptop acceptance, signed-in provider layouts, native MV3 lifecycle and real model interpretation quality remain outstanding. Stages 2/3 remain pending. No installer or signed release is claimed by this integration.

## Latest owner decisions and cleanup (2026-10-19)

- Replies must be short and use plain, nontechnical language.
- Models will change frequently, including weaker models. Do not assume a capable model: capture, ordinary search, permissions and data integrity should work independently of AI quality. AI output remains an untrusted proposal. Switching models must not require rebuilding memory or treat an older interpretation as verified. Original sources and confirmed facts remain available when interpretation fails. This is a standing design constraint, not a claim that all future recall work is implemented.
- External engine installation belongs to Claude Code/Ollama/agy, not this app. Keep engines separately installed. Reduce repeated steps and explain the next action; do not promise one-click third-party authentication or reinstall functioning engines.
- Startup animation has an On/Off control in Settings → Appearance → Brain & motion. Default remains On. Off opens without the splash or its input blocking; explicit Replay still works. Reduced-motion behavior is unchanged. The preference is stored with appearance and applies to future launches; toggling On does not interrupt the current session.
- Removed the two unshipped predecessor app directories (169 tracked files, preserving their legal notice), duplicate `gitignore.txt`, obsolete master-ZIP scripts with stale folder names, the old prototype-only artifact checker and the unused screenshot pixel helper. Their history remains in Git at `9d61f36`.
- Retained the actual app, regression tests, CI/build tools, original artwork, extension, runtime vault content, installable skills and licenses. Retained the motion-asset generator and corrected its obsolete output path instead of deleting a useful source tool. README and this file remain the two project documentation files. Runtime Markdown is app content, not disposable documentation.

Validation for this cleanup/switch: 1,071 tests across 155 files passed with real Chromium and zero skips; TypeScript, Electron build and web build passed. The browser motion check exercised the real Settings switch, reload persistence, no startup flash/input blocking when Off, restored opening when On, manual replay and reduced motion. Existing default-value test expectations were updated for the new field, not weakened. Native/account acceptance remains separate.

## Intuitive navigation declutter (2026-10-19)

- Authorized scope: group and relocate controls, not remove features or implement the larger recall/review roadmap. Future recall belongs in existing search, grouped review in Memory inbox and richer profiles in People; add a screen only for a genuinely separate task.
- Settings now has eight destinations: Appearance; AI & connections; Memory & files; Voice & attachments; Privacy & access; Windows & shortcuts; Advanced tools; About & help. All 17 substantive pages remain. Contextual subnavigation remembers the last page per group during the Settings instance; search spans the groups and retained labels. Stable section IDs preserve existing links and Back behavior.
- Capture sources has one home in Vault. Settings search, the command palette and legacy `maps` links open that home rather than a duplicate Settings page. Legacy redirects cannot overwrite Appearance's remembered page.
- Appearance's optional Looks lab contains comparisons, quiz, shortlist, ratings, notes, saved mixes, additional design systems, structure comparisons and imports/exports. Presets, layouts, palettes, styles, typography, motion, original artwork and live preview remain.
- People shows profile content before administration. Manage person/Manage people reveals linking, merging, editing and identity history; New person reveals and focuses creation. Identity previews, explicit confirmation and undo are unchanged.
- Hooks, watches, skills, plugins and House rules are under Advanced tools. Second-pass AI review moved from Engine to House rules. Automatic/external review were already off by default and remain so; saved choices are not reset. Code was already outside primary navigation, under Projects/menu; no new removal is claimed.
- Validation: **1,074 tests across 155 files, zero skips**, including both required real-browser suites; strict JUnit gate passed. TypeScript and Electron/web builds passed. All nine UI suites passed in one final serial run after rebuilding the offline renderer and updating moved-control selectors. Checks cover all 17 pages, search/Back/draft retention, all eight layouts at minimum size, appearance inventory, identity preview/cancel/confirm/undo and Capture sources shortcuts. Cache receipts: `.cache/intuitive/{full.xml,tests.log,build.log,web.log,ui.log}`. Generated receipts are not committed. Native target-machine use, live provider/model quality and CI for this change are not claimed by these local results.
