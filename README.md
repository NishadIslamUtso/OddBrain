# OddBrain

A local-first desktop AI assistant for Windows. The owner's own words: **"my assistant that helps me do things in pc and everything."**

Owner: Utso (`nishadislamutso@gmail.com`) · ASUS TUF A15, Ryzen 7, 8 GB RAM, RTX 3050 4 GB, Windows 11, 1920×1080 @ 125% (1536×864 logical), Asia/Dhaka.

**This is the ONE context document.** Every fact about the project lives here. (Functional exceptions kept as files: `vault/Brain/CLAUDE.md` + `AGENTS.md` are the rulebook the engines actually read; `apps/03_oddbrain/store/packs/**` are actual starter-pack content; `apps/01_claude-exact-pixel-clone/THIRD_PARTY_NOTICES.md` is a legal notice.)

**Current working branch: `arena/cc83a507-oddbrain`.** Based on the entire `clean-build` tree at `6835309cdfc3a3b5a16cea5b80f38c318badb934`, including its PDF fix and test shim. The reviewed appearance/navigation foundation is retained; the memory workflow and extension changes described below are layered on top. No publication is implied by this working tree.

---

## The laws

1. **Honesty above all.** No invented model names, no colored-dot lies — words, not dots. Every number on screen is countable from records the user can see. A feature that does not exist gets one muted line, never a nav item.
2. **Engines are exactly two**: `claude-code` and `agy`. Ollama is the local brain server, not an engine. Cloud keys ride claude-code.
3. **Automatic conversation capture is on for supported AI sites after pairing.** People/Classroom sites require explicit site grants. No browser-history collection; existing visits are preserved. Collection is limited to accessible content in open conversations, not an account-wide archive.
4. **Nothing is built without the owner's explicit yes.** Real-machine reports outrank every plan.
5. **Every feature lands with a test that proves it.** Gate: `tsc` 0 · full vitest green · build green · smoke `errors=0 warnings=0` · CI green on both OS.
6. One landing = one commit. No new fonts, no cloud services, no telemetry. The in-app Ollama downloader is benched by owner decision — the route is `winget install Ollama.Ollama` (any installed copy is found automatically).

## Repo map

| Path | What it is |
|---|---|
| `apps/03_oddbrain/` | **The app.** Electron 41 + React 19 + Vite. Main process `src/main/`, renderer `src/renderer/src/`, tests `tests/`. |
| `extension/` | Chromium MV3 companion (0.5.0). Incremental open-conversation/message/media capture, progress, explicit context insertion and secondary manual clipping; no browser history. |
| `vault/Brain/` | Second brain: engine rulebooks (`CLAUDE.md`, `AGENTS.md`), sources, memory structure, templates. Seeded canonical; the real folder is chosen in-app at runtime. |
| `store/packs/` | Starter packs the in-app store installs. |
| `apps/01_…pixel-clone/`, `apps/02_…clone-v6/` | Predecessor prototypes. Archaeology, not shipped. |

## The UI/UX — the owner's branch, verbatim

The complete appearance inventory, built by the owner personally (authority: SPEC rev 2 on branch `agent-resources` under `OddBrain-UIUX-Handoff/`):

- **8 layouts** — classic sidebar, top bar, rail+list, two-pane, command-first, bento, console, floating — each with a live diagram choice, plus Full/Icon-rail sidebar and "Compare structures".
- **16 preset rows = 8 named looks × light/dark** (Warm Editorial, Cozy Studio, Quiet Minimal, Playful Lab, Ink & Sketchbook, Terminal/Engineer, Retro Desktop, Glass/Futuristic).
- **10 palettes** (app default + 9: Studio, Paper & Plum, Midnight Ink, Sage Notes, Peach Fuzz, Blue Hour, Citrus, Rose After Dark, Quiet Graphite) · **4 interface styles** (Editorial, Soft studio, Ink & paper, Glass studio) · accent follow-or-override.
- **Looks lab**: Compare looks · Taste quiz (5 questions) · My shortlist · gallery · My mixes · Custom look.
- **All 16 bundled design systems** (Claude, Linear, Apple, Stripe, Notion, Vercel, Airbnb, Glassmorphism, Neobrutalism, Editorial, Retro, Dashboard, Shadcn, Minimal, Modern, Default) applied as complete token sets to every screen.
- **All 77 mascot SVGs byte-exact** with the 8 real state roles (idle/thinking/working/waiting/done/searching/making/resting) · motion modes Calm/Balanced/Playful/Still + speed/pause.
- **18 settings sections**, size table per SPEC §2 (15px settings headings, 13px body, 14.5px conversation, 44px bars, 260px sidebar), honest rows only.

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

`src/main/media/documents.ts` — pdfjs's Node factories read `standardFontDataUrl` / `cMapUrl` / `wasmUrl` as filesystem paths that must end in `/`. The old code appended the platform separator: on Windows that produced `...\pdfjs-dist\cmaps\`, which pdfjs rejects — **PDF attachment extraction failed on every Windows machine** (caught by `tests/media-decoding.test.ts` on Windows CI). Now the paths are normalized to forward slashes with a trailing slash. Windows APIs accept forward slashes; pdfjs's own Node factory `fs.readFile`s the result. Plus a test-env shim (`tests/shims/promise.ts`) so Node-20 sandboxes can run the same suite the app's Node-22 runtime passes — app code untouched by it.


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

Still unverified: real model interpretation quality on personal data; signed-in live site selectors; native permission dialogs; service-worker suspension/restart; Windows Electron IPC and foreground-model cancellation on the target laptop. No native smoke, installer, CI publication or signed release is claimed for this work.

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

CI (`.github/workflows/`): `checks.yml` runs the gate on Linux + Windows per push; `installer.yml` publishes `OddBrain-Setup-<sha-prefix>` (~96 MB, one-click, en-US).

## Branch map

| Branch | State |
|---|---|
| `clean-build` | Baseline copied in full at `6835309`. |
| `main` = `v3` | Previous stable (`a6c7807`). |
| `arena/cc83a507-oddbrain` | Current session branch; clean-build foundation plus memory/extension work and selective reliability upgrades. |
| `arena/ea5c07b0`, `arena/81a07155`, `arena/9781cd95`, `arena/9a3a5c88`, `arena/6d6aabbf`, `arena/0bd5478b`, `arena/d3c1ee25`, `arena/495d260c` | Fleet lanes (stores / voice / core / AV / documents / QA / verify / scanner); selected store/security/scanner fixes adapted here, not whole-branch merges. Unpublished vault fixes were independently reproduced and repaired. |
| `agent-resources` | Authority package: `OddBrain-UIUX-Handoff/` (SPEC rev 2), `reference/session-v2/`, `workspace-notes/DECISIONS.json`, `uploads/OddBrain.html`. |
| `archive/workspace` | Preserved workspaces, incl. `workspace-2026-10-18/` (fleet ledger + owner's reference uploads). |
| `professional` | main with the single-README treatment (this branch's doc model comes from there). |

Historical clean-build measurements: **124 test files / 858 tests**. These are baseline results, not proof of the newer workflow or native acceptance. Current verification is recorded below.


**Current verification (2026-10-19, sandbox):** 1,021 tests across 147 files passed with no skips (including the Chromium conversation-reader/paired-vault fixture and real IndexedDB recovery across a full Chromium restart); TypeScript, Electron build and web build passed. All nine app browser suites and the extension browser suite passed. The builds still emit the existing CSS `::highlight` optimizer notices and the web bundle-size warning. Native Windows/live-account acceptance remains outstanding. No installer or signed release was produced by this validation.

Extension structural-selector references (facts, not copied automation): [timeline adapters](https://github.com/houyanchao/chatgpt-gemini-timeline/tree/main/js/timeline/adapters), [Defuddle's Grok extractor](https://github.com/kepano/defuddle/blob/main/src/extractors/grok.ts), [Arena site configuration](https://github.com/lumingya/universal-web-api/blob/main/config/sites/arena.ai.json). These are secondary evidence, not authenticated live-site verification.
