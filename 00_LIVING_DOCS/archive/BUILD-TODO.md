# AI ASSistant — build todo

> **2026-10-16:** the mirror-the-workspace era ended — `CHANGELOG.md` +
> `TODO_NEXT.md` are the live plan now. This file remains the historical reference
> (the mockup + feature tables).
> **Mirror of the owner's live plan file.** The workspace copy
> (`/home/user/BUILD-TODO.md`) is edited during work; this copy is refreshed at
> every landing so a clone of this branch alone carries the full plan. If they
> ever differ, the newer commit wins. Companion docs in this folder:
> `TODOLIST.md` (the active checklist, light-shell frame), `COMMUNITY-STORE-PLAN.md`
> (packs/stores design) and `ARTIFACTS-SCREEN-PLAN.md` (step-1 decision record,
> superseded by what landed). Session-by-session reasoning:
> `../memory/sessions/` + `CHANGELOG.md`; machine-readable state:
> `../ai/STATE.json`. Archives on branches: `archive/workspace` (mockups + owner
> attachments + screenshots — raw fetch recipe inside), `archive/ai-assistant-app`
> (original app source).

> **Active checklist: `TODOLIST.md`** (2026-10-15 light-shell reframe) — the ORDER lives
> there; this file keeps the reference tables and the community-plan pointer.

`S` ≈ under an hour · `M` ≈ a day · `L` ≈ multi-day.
Order inside each section is roughly the order I'd build.

## Frontend verdict (answer first)

**Keep your own frontend as the main canvas: React + Vite, wrapped in Electron.**

Why:
1. Every app worth copying is React/TypeScript — OpenDesign (React/Next), Cherry (React),
   AnythingLLM (React), Jan/Atomic (React frontend). Their components drop into your app.
2. Taking OpenDesign's Next.js frontend means taking its Express daemon + SQLite backend too,
   and you'd throw away your vault API, streaming chat and inference profiles.
3. Cherry Studio is AGPL-3.0 — making its UI your base spreads copyleft across your whole app.
   OpenDesign is Apache-2.0, so copying *files* from it is safe. Copy from it, don't become it.
4. You already ship: streaming chat, model selector, vault API, settings, profile editor,
   4 GB inference profiles, 74 green tests. A rewrite loses all of it.

So: **yours = canvas · OpenDesign = component farm (Apache-2.0) · Cherry = pattern farm (ideas only) ·
Claude = the spec.**

## Done already

- [x] Rename to AI ASSistant, all Claude branding out of user-facing copy
- [x] Cheeky-brain logo (namespaced SVG defs)
- [x] Custom name / email / avatar, neutral defaults for a fresh clone
- [x] Local vault API + file index (60 files)
- [x] Streaming chat against Ollama, model list, model selector
- [x] 4 GB-safe inference profiles + VRAM advice note
- [x] Settings modal with Account + Performance sections
- [x] 68 unit + 6 UI tests green
- [x] Phase 0 — the new app opens: Electron 40 + Vite 6 + React 19 + Tailwind 4,
      zero console errors or warnings, proven by `npm run smoke`
- [x] Phase 1 — logic layer ported to TypeScript: 17 modules + 16 design systems in
      `src/shared/lib`, shapes written down in `src/shared/types.ts`, `npm test` 84/84
- [x] Browser preview — `npm run build:web` builds the renderer alone to `dist-web/`
      and `npm run preview:web` serves it; the renderer looks at itself in a browser,
      with empty-not-invented demo data. (The Vercel configs were removed: deploying
      fought the host more than it earned, and `dist-web/` is a plain static site
      any host can serve.)
- [x] Phase 2 — the chat shell: title bar, sidebar with search + list, transcript,
      composer. `useChat`/`useModels`/`usePersistentState`/`useDismiss` ported.
- [x] The local API, in the main process: loopback server, the origin/route/JSON
      guard, streaming proxy to Ollama. Proven with a real 101-record stream.
- [x] `proxy-policy.test.cjs` came back out of tests/pending and passes; added
      `tests/api-server.test.ts`. `npm test` 94/94.
- [x] Favicon — the preview's only console error, now gone (checked with a
      headless browser, not by eye).

## 1. Chat shell

- [ ] Topic list: rename, pin, search (Cherry) — S
- [ ] Branch tree inside a topic (Cherry TopicBranchPanel) — M
- [ ] Split Chats: one prompt, several models side by side (Msty) — M
- [ ] Compare view with vote/winner + leaderboard (Open WebUI arena) — M
- [ ] Regenerate / edit-and-resend / delete a turn — S
- [ ] Prompt library with variables (BoltAI) — S
- [ ] Slash commands (/… menu) (Claude plugins) — M
- [ ] Inline charts in replies (your branch abc0197f) — S
- [ ] Staged styling sidebar (your branch 01199af1) — S
- [ ] Mermaid diagrams + code highlighting (Cherry) — S
- [ ] Attachments: PDF / docx / xlsx / images into context — M
- [ ] Web search tool — M
- [ ] Translate selection (Cherry) — S
- [ ] Voice: speech-to-text + read-aloud (Cherry) — M
- [ ] Image generation from chat (Cherry / OpenDesign) — M

## 2. Artifacts & creation engine

- [ ] Sandboxed iframe preview pane — M
- [ ] Live artifacts: agent writes a manifest, iframe re-renders with no reload — L
- [ ] Tweaks panel for live parameters — M
- [ ] Export HTML (single file, assets inlined) — S
- [ ] Export PDF — S
- [ ] Export PPTX — M
- [ ] Export ZIP — S
- [ ] Export Markdown — S
- [ ] Deck mode: 15 templates + 36 themes (copy from OpenDesign, check license headers) — M
- [ ] 93 image prompt templates as a gallery — S
- [ ] HyperFrames: HTML + CSS + GSAP → MP4 (headless Chrome + FFmpeg) — L
- [ ] Device frames: iPhone / Pixel / desktop — S
- [ ] 5 visual-direction picker before generating — S
- [ ] Discovery question form before generating — S
- [ ] Todo/progress list shown while the agent works — S
- [ ] Edit artifact in place: highlight → type instruction (Claude June 2026) — M

## 3. Design systems, skills, plugins

> **The shape of this is decided — see `/home/user/COMMUNITY-STORE-PLAN.md`.** A pack is a folder with a
> `manifest.json` (skills, prompts, agents, themes, connectors, capture recipes); a store is an index file at
> a URL, not a service; installing shows its permissions in plain words first. It lands after Projects (04)
> and Vault (05): pack format + "Install from file/folder" first, then the index client, then publish/export
> and a first-party starter pack, then connectors with the agents/Code step, then the community index.

- [ ] DESIGN.md 9-section schema + picker — M
- [ ] Ship a starter design-system pack — S
- [ ] Extract a design system from a URL or screenshot — L
- [ ] Build a design system by reading a repo — L
- [ ] tokens.css + components + manifest per system — M
- [ ] Skills as plain folders (SKILL.md) + loader — M
- [ ] Ship a starter skill pack — S
- [ ] 13 scenario plugins (od-*) equivalents — M
- [ ] Plugin registry / marketplace UI — M
- [ ] "Refresh this repo to my brand" flow — L
- [ ] Figma / Pencil → React / Next / Vue migration — L

## 4. Agents, MCP, code

- [ ] Local MCP server exposing vault + artifacts — M
- [ ] One-line MCP install for external agents — M
- [ ] Agent runtime adapters (launch CLIs, structured stream) — L
- [ ] BYOK proxy with SSRF guard (OpenDesign) — M
- [ ] Real code-agent runner behind the "Code agents" nav item — L
- [ ] Monaco editor + WebContainer (run code in-browser, no server) — L
- [ ] Mode switcher: Chat / Code / Vault / Settings — S

## 5. Projects, memory, automation

- [ ] Projects: instructions + context + isolated history — M
- [ ] Project knowledge from a local folder / URLs — M
- [ ] Chat memory: cross-session summaries + edit UI — M
- [ ] File-system memory (/memory folder, auto-memory) — M
- [ ] Memory consolidation ("dreaming") — L
- [ ] Import memory from other AI apps — S
- [ ] Scheduled tasks: daily / weekly / monthly — M
- [ ] Search across all chats — S

## 6. Cowork lanes

- [ ] Multi-lane parallel tasks — L
- [ ] Checkpoints + resume — M
- [ ] Sub-agents in separate contexts — L
- [ ] Approval gates before destructive actions — M
- [ ] Sandboxed VM/container for file operations — L

## 7. Local models & hardware

- [x] Surface the VRAM fit estimator inside Settings — done: it is the numbers line
      and the fit row in Settings > Performance (see the full-window entry below)
- [ ] Model catalog + download manager (LM Studio) — L
- [ ] Keep-alive / residency control (Ollama) — S
- [ ] Structured output / JSON-schema mode — M
- [ ] CPU / Vulkan fallback guidance — S
- [ ] KV-cache tuning presets (Atomic TurboQuant idea) — M
- [ ] Local OpenAI-compatible API on a fixed port (Jan :1337) — M

## 8. Knowledge & storage

- [ ] Workspaces: isolated document containers (AnythingLLM) — M
- [ ] Knowledge Stacks: files + web pages + YouTube as one source (Msty) — M
- [ ] Chat vs Query modes (AnythingLLM) — S
- [ ] Built-in vector DB + CPU-only embedder — L
- [ ] Bring-your-own vector DB (Pinecone / Qdrant / Weaviate / Chroma) — L
- [ ] RAG with no server at all (GPT4All LocalDocs style) — M

## 9. Sharing & multi-user (only if you ever ship a web build)

- [ ] Live share links for artifacts (Claude / OpenDesign) — M
- [ ] Comments & feedback on artifacts (OpenDesign) — M
- [ ] Accounts, roles, admin panel (Open WebUI / AnythingLLM) — L
- [ ] Embeddable chat widget for websites (AnythingLLM) — L
- [ ] Pipelines / Functions plugin API (Open WebUI) — L
- [ ] Model arena + public leaderboard (Open WebUI) — M

## 10. OS-level & open-source polish

- [ ] Global hotkey: select text anywhere → rewrite in place (BoltAI) — L
- [ ] Mobile companion + dispatch tasks to desktop (Claude / Jan) — L
- [ ] Zero-telemetry guarantee, written down — S
- [ ] i18n (OpenDesign ships 14 languages) — M
- [ ] Themes / dark mode — S
- [ ] First-run onboarding for a fresh clone — S
- [ ] Rename `apps/01_claude-exact-pixel-clone` → `apps/01_ai-assistant`
      (breaks preview-server paths — do it carefully, in one commit) — S

## 11. Cloud providers (added — was missing)

- [x] Provider registry: Anthropic, OpenAI, Gemini, OpenRouter, Groq, DeepSeek, xAI Grok, custom baseURL
      (Together/Mistral/LM Studio/vLLM all reach the custom row) — done 2026-10-14
- [x] Anthropic Messages API adapter (not OpenAI-shaped) — done 2026-10-14
- [x] OpenAI-compatible adapter shared by the rest — done 2026-10-14
- [x] Keys in the OS keychain via Electron safeStorage (DPAPI on Windows); held for the run and said out
      loud when a machine has no keychain — done 2026-10-14
- [x] Per-provider: add key, test, fetch model list — done 2026-10-14 (`pick default` still open: the
      composer starts on the localStorage model)
- [x] Local vs Cloud badge on every reply — done 2026-10-14 (audit log still open: it comes with the first
      capability that acts, when there is something to audit)
- [ ] Settings > Agent access: agent rows x capability columns (Vault / Files / Shell / Web / MCP) — M
- [~] Three-state switches: off / on done 2026-10-14 for every capability that exists; **ask me next time**
      arrives with the first capability that acts on its own (Files / Shell / Web / MCP) — M
- [ ] One confirmation per provider per capability, remembered forever after — S
- [ ] Prompt-injection guard: tag untrusted content, confirm before it drives an outbound tool — L
- [ ] Token + cost meter per turn, running monthly total, optional hard cap — M
- [ ] Failover is cloud → local only, never cloud → different cloud — S
- [ ] Link to each provider's current data-use page instead of hardcoding claims — S

## 12. Browser capture (extension)

**Non-negotiable, per your instruction: no warnings, no popups, no errors. Ever.**
Nothing that interrupts what you are doing, and nothing that scares a new user:
- [ ] Zero console errors or extension warnings in normal use — verify in the UI test, fail the build if one appears
- [ ] No browser banner, no "extension wants access" toast, no permission dialog after install
- [ ] No page-level UI unless you clicked the toolbar icon
- [ ] No failed network request noise — queue offline silently and retry
- [ ] If capture fails, log it quietly (wasnt-accessible) and move on. Never a dialog.


- [ ] Event log: append-only SQLite, gzipped text on disk, all indexes rebuildable — M
- [ ] Async enrichment queue: entities, claims, summary, embeddings — resumable, idle-only — L
- [ ] Browsing Maps: auto-cluster visited pages, AI summary per cluster, graph + list views — L
- [ ] Capsule builder: versioning, merge, split, drag-drop inject with preview — M
- [ ] MCP server exposing vault memory to any agent — M
- [ ] Search that accepts a description, not just keywords — M
- [ ] Capture whole readable page (Readability) using the blacklist check inside the content script — M
- [ ] Shadow-DOM root for the inline widget so page CSS can never warp it — S
- [ ] Never auto-open UI: popup + toolbar icon + on-click inline only — S
- [ ] Per-site capture-scope editor (full text / metadata only / never) — M
- [ ] Retention + storage size control for captured pages — S

## Waiting for its code (do not let these rot)

- [ ] `apps/03_ai-assistant/tests/pending/` — 7 test files whose subject is not
      ported yet (props/wiring/composer need the rest of the renderer components;
      vault-api, blacklist-parity, vault-capture, server-zip need the vault service
      in the main process). Each has its reason in the README there. Move each one
      back into `tests/` when its code lands, and make it pass.
      (proxy-policy already went back.)

## The next step (agreed order)

- [x] Artifacts: sandboxed preview panel, redrawing drafts, the right-hand rail,
      and a ZIP export proven by opening the file. `tests/artifact-view.test.ts`.
      (Pushed to main up to the chat shell; the artifacts step is on
      `arena/3c06e1bf-ai-assistant-v3`, one commit ahead.)
- [x] Comment mode on an artifact: click Comment, click the element in the
      preview, say what should change, and only that element comes back. Versions
      are append-only, so a bad answer costs one click. Two inherited indexing bugs
      fixed (the pick outline, and full documents being wrapped inside the preview
      body) — both now covered by tests/preview-picking.test.ts.
- [x] **The vault service in the main process.** `src/main/vault/*`: the service,
      its disk rules (no path escapes, no symlinks out, sources written once), the
      nine routes answered in-process, and the client-side payload builder. No
      companion server and no port 8765 any more.
      Its four parked tests came out of `tests/pending` and pass — rewritten for
      the service rather than copied, with the three differences written down in
      `tests/pending/README.md`. `npm test` 179/179; typecheck 0.
      Proven end to end, not by reading: a message typed into the real desktop app
      lands as a Markdown source under `02 Sources/Conversations/AI ASSistant/`,
      with the activity log entry and a clean console — see
      `shot-tools/check-vault-capture.cjs` and `screenshots/50-vault-capture.png`.
      The title bar now shows the mockup's second indicator (Ollama · Vault), and a
      capture that fails says so in one line instead of silently not happening.
- [x] **Settings opens, and the vault folder is yours to choose.** The row at the
      bottom of the sidebar opens it; Escape or a click outside closes it. It shows
      the folder in use, how many files are on disk, and — when something is wrong
      — the exact reason, and takes a new folder from the picker or a pasted path.
      The folder has to exist: nothing is created for you, and no empty replacement
      vault is ever made in place of the one you asked for. Moving it takes effect
      in the running app — no restart — and the vault left behind keeps exactly
      what it had. Resolution order is now `settings.vaultPath`, then
      `AI_ASSISTANT_VAULT`, `AI_BRAIN_VAULT`, `AI_BRAIN_PATH`, the checkout's
      `vault/AI-Brain`, then `<userData>/vault`. `npm test` 185/185 (6 new in
      `tests/settings.test.ts`); the browser check opens Settings in the web
      preview and finds no console noise; the capture check moves the vault from
      inside the real app and watches the next conversation land in the new folder
      with the old one untouched — `screenshots/52-settings-desktop.png`.
- [x] **Settings > Appearance** — accent and conversation width, both rewriting the
      theme tokens rather than painting over them (the stylesheet said this was the
      point of tokens; this is the feature it was for). The default is byte-for-byte
      what the app already looked like: `#7c5cff` and 760px, asserted against
      `globals.css` so the two cannot drift. Applied before the first paint by
      `main.tsx`, so a chosen accent never flashes the default. Kept in window
      storage, which means it works in the browser preview too.
- [x] **Settings > Performance** — the profile table from `inference.ts`, surfaced:
      4 GB (default) / 6 GB / 8 GB / CPU-only / Custom, with real ranges on the
      custom fields and typed values clamped when the field loses focus. It says
      what is actually running — the model Ollama reported, its size on disk — and it
      measured the loaded model against a hardcoded 4 GB. That measurement was wrong
      — it charged 0.5 MB per context token, three times too much, and ignored the
      profile the person had chosen — and was replaced the same day: see the
      full-window entry below. Left alone, the request to Ollama is unchanged (the
      4 GB profile), so this cannot break a working setup.
      `npm test` 199/199 (14 new across `tests/appearance.test.ts` and
      `tests/performance.test.ts`); `check-web.cjs` now clicks the swatches, the
      width pills and a profile in the preview and reloads to prove the accent
      survives; `check-vault-capture.cjs` does the same in the desktop app and
      screenshots it — `screenshots/54-settings-performance-desktop.png`.
- [x] **Settings as the full window, and memory that stops nagging** — the owner's
      four corrections in one commit. Settings is now a full-window surface with a
      rail (`System` under *This computer*; `Appearance`, `Performance`, `Vault` under
      *This app*), a search box that finds a setting by name and opens its section,
      and a per-section Reset; `SettingsDialog.tsx` was replaced by `SettingsView.tsx`.
      The Performance warning no longer compares everything to a hardcoded 4 GB: the
      profile a person picks IS the answer to "how much video memory is there", so
      `fitCheck()` measures against that profile's own budget and stays silent when it
      fits — choosing 6 GB can no longer produce a warning about a 4 GB card. The
      estimate was three times too pessimistic and made the app's own default warn at
      itself; it is now 0.08 MB/token, documented as a deliberate over-estimate.
      CPU-only and Custom claim no card and are never warned about; when a preset
      really cannot hold the loaded model, one sentence names the numbers and one
      button fixes it (`fitToProfile()`, context snapping to a recognisable size, or
      CPU-only when nothing fits). Every written-out description under an option is
      gone. `npm test` 208/208 (9 new in `tests/inference-fit.test.ts`); browser check
      28/28 with 0 console problems; desktop check green including `noFalseWarning`
      and `optionsLineFollows`; `screenshots/54-settings-performance-desktop.png` shows
      6 GB selected with no warning. Branch `4731756` → `main` `a52f2bf`.
- [x] **Every stale document brought to the current state** — `README.md`,
      `BRANCH_TESTING.md`, `TESTING_CHECKLIST.md`, `.ai/*` (and the `ai/` mirror),
      `00_LIVING_DOCS/*`, `extension/README.md` + `EXTENSION_SPEC.md` (which now say
      plainly that the extension cannot reach the app yet), the session log, and this
      file. `apps/01` is labelled history everywhere, and the vault API is described as
      in-process instead of a port 8765 that no longer exists.
- [ ] **Settings > Agent access** — the last section. It waits for something real to
      grant: cloud providers, the extension, and the shell/MCP tools. A permission
      matrix over capabilities that do not exist yet would be a mock, and mocks are
      forbidden here.
- [ ] **The extension's side of the vault**: when `extension/` is ported, allowing
      `chrome-extension://<32 hex>` origins for the vault routes is a change to
      `src/main/api/guard.ts` (the old companion API allowed it; this app is
      strictly same-origin until the extension exists).
- [ ] Attachments: the `+` button, images, and the vision bridge — its hook is
      ported, its model choice belongs in Settings.

## Start here (next, in order)

**2026-10-14 late evening — step 1 landed, step 2 is next: Artifacts is done, Today (07) is the next screen.
Before the next screen: the app icon was fixed for real (it had been rendering without the brain — the body
is painted through a `<use>` reference and the icon renderer left it unresolved). He then supplied his own
artwork: it now ships verbatim as `resources/icon.svg` (transparent — the interim tile is gone) plus the
favicon, with the renderer syncing component↔file and installer `0.1.2`. The
community/stores/plugins question is answered in `/home/user/COMMUNITY-STORE-PLAN.md` and scheduled in §3.**

**Purge done (his order, verified twice):** no standalone file of the previous mark remains — the ghost
render, the tiled sheet and the stale web bundle are gone; the extension icons, favicon and all three icon
resources carry his artwork only (signature scan: 3/3 SVGs identical, 0 differ). Left on purpose: the
claude-logo files in the archived clone apps, the mockups, his bug-report screenshot, and git history
(rewrite on request). The installer is **reproducible, not persistent** — snapshots drop the 88 MB file and
NSIS rebuilds hash differently; `npm run dist:win` (Windows) or the audits here hold any rebuild to his
artwork. **After any workspace restore: re-sweep for resurrected files and re-add origin first.**

**2026-10-14 evening — the owner's verdict, and it is correct: "this is a plain chatbot."**
The approved mockups have eight screens. The app has two of them: **Chat** (01) and **Settings** (02).
Everything else on the sidebar in mockup 01 — Code, Projects, Artifacts, Vault, Today — is a screen that
does not exist yet, and the first-run screen (08) does not either. The last rounds went into foundations
(vault writes, permissions, cloud providers, the installer) which the screens will need, but from the
owner's chair that reads as foundations with nothing on top. So: **screens first, and each one ships whole.**

**The rule stays:** a nav item appears only when its screen actually works. No placeholder pages, ever.

> **Workspace pruned (2026-10-15): 809 MB → 44 MB.** Dependencies are gone by design — run `npm install` in
> `apps/03_ai-assistant` (and in `shot-tools` for the checkers) before anything is tested or built. Mockups,
> The mockups, uploads and screenshots now live on branch `archive/workspace` (raw-fetch recipe in the
> session log), and the original app source on `archive/ai-assistant-app` — both verified on origin. The two
> empty placeholder repos from the first attempt (`AI-ASSistant-App` / `AI-ASSistant-workspace`) can be
> deleted by the owner, or granted to the token if he prefers them. Note: the main repository is public, so
> the archive branches are public too.
>
> **replica-skill adopted, partly (cloned at `refs/replica-skill`, MIT, 448 KB).** Of its eleven skills the
> one that earns its place is `replica-diff/imgdiff.py`: every future screen landing diffs a screenshot of the
> built screen against its mockup (layout parity, colour ignored) — evidence alongside the checkers, aimed
> straight at the "design exactly as per mockup" rule. Its recon/architect/backend/brand/launch/deploy skills
> do not apply: there is no stranger's app to reverse-engineer here, and no SaaS to launch.

The mockups, as the standard to hit:
| Mockup | Screen | State |
|---|---|---|
| 01-chat | Chat + artifacts rail + sidebar groups | built (missing: the six-item nav, composer chips) |
| 02-settings | Full-window Settings | built |
| 03-artifacts | Artifacts library (grid of creations) | **built** — the library on disk (`index.json` + version files, `.trash/`, damaged-index rebuild), the screen with real thumbnails, Open/Export/rename/duplicate/remove, and "Save v1 again" appending instead of truncating |
| 04-projects | Projects: chats / instructions / context / memory | **built** — strict storage doors, per-project instruction + folder, chats link by id (pipe existed), Work-here points the engine via the app's door, honest empty states |
| 05-vault | Vault: file tree, search, file preview, reindex, add-to-composer; capsules only for real files | **built** — /files /file /grep vault routes (escape-refusing, capped), grouped tree, name filter + content search, preview pane, add-to-composer as quoted context, Open folder door |
| 06-code | Code workspace | **built** — the engine's workspace on screen: folder (choose/clear/open), throttle quick-set, the real resumable threads per folder with forget |
| 07-today | Today: stats, worth-doing-next, recent sources, quick actions | **built** — stats from real records, worth-doing-next from records only, conversations/made/read-today lists, honest empty & missing states |
| 08-first-run | First run: name, brain, folder | **built** — three real skippable choices: name into the one profile, brain from the engine's own door, vault folder via the real picker; remembered (welcomed flag), never shown twice |

Order (each step = one landing: built, verified, merged, reported):
1. ~~**Artifacts, made real**~~ — **DONE** (`55...`/`9555499` + rail fix `5da2fa9`, merged `1e7dce2`/`1f97e3a`).
   Artifacts persist to disk with versions, the **Artifacts** screen lists them (03), the nav entry appeared,
   and the owner's two reports (the logo, the sidebar collapse) are fixed. 269 tests + 22-assertion desktop
   check green. Note for this screen later: the conversation's own artifacts rail stays on the chat view.
2. **Today** (07) — the landing screen: conversations today, vault notes touched, artifacts made today,
   worth-doing-next from the vault's open loops, recent sources (the Browsing Maps data), quick actions.
3. **Vault screen** (05) — the tree the vault really has, search, file preview, reindex, add-to-composer;
   capsules only for files that are real.
4. **Projects** (04) — projects with chats, instructions, context and memory; the biggest one, and the one
   that makes it feel like an assistant rather than a chat window.
5. **Code** (06) — read the mockup when this step starts.
6. **First-run** (08) and **composer chips** (project · model · effort · local/online) — the small ones,
   last because they decorate the rest.

Then, after the screens: the older queue below (the extension itself, preview/export chain, topic list and
branch tree), unchanged.

0. **The owner's own Windows test** [x] DONE 2026-10-14 — the app installed and ran on the TUF A15;
   Ollama was started; first conversation answered. Standing item: keep reporting anything that looks wrong
1. [x] **A loopback port for the extension**
2. **Port the extension itself** — it is a starter: load it in a browser, wire the collector, the context
   suggester and the popup against the live contract, and prove a real page capture end to end
3. [x] **Settings > Agent access**
4. [x] **Browsing Maps**
5. [x] **A Windows installer**


0. **The owner's own Windows test** — nothing else matters until the app has run on the TUF A15. The
   installer is in hand now (`AI-ASSistant-Setup-0.1.0.exe`), so this is a double-click, not a build
1. [x] **A loopback port for the extension** — done 2026-10-14: 127.0.0.1:8765, capture side only,
   `chrome-extension://` origins only, named in Settings > System
2. **Port the extension itself** — it is a starter: load it in a browser, wire the collector, the context
   suggester and the popup against the live contract, and prove a real page capture end to end
3. [x] **Settings > Agent access** — done 2026-10-14: Local model, Browser captures, Keeping conversations
   and one switch per keyed provider, each enforced in the main process (off / ask / on comes with the first
   capability that needs an ask — Files/Shell/Web/MCP); every reply labelled local or online
4. [x] **Browsing Maps** — done 2026-10-15: the timeline of what the vault holds, with site grouping,
   kind filters, search and a time window; a visit stays a visit
5. [x] **A Windows installer** — done 2026-10-14: `AI-ASSistant-Setup-0.1.0.exe` (NSIS, assisted,
   per-user, unsigned → SmartScreen "unknown publisher"), built from `electron-builder.yml`; payload listed
   and the same config's Linux bundle boots clean. Installing it on the TUF A15 is step 0, the owner's own test
6. Sandboxed preview + export chain (HTML → PDF → ZIP) — biggest visible win
7. Topic list + branch tree — makes the chat feel finished
8. Projects + chat memory — the thing that makes it feel like an assistant
