# DECISIONS_LOG.md — All Decisions With Dates

**Last Updated:** 2026-10-15 (late) Asia/Dhaka

## 2026-10-15 Decisions (engine era)

- **Engine = the real CLI on the raw stream, not the Agent SDK** — sandbox
  could not install the SDK (blind coding); the CLI was owner-verified; fully
  testable; mods door stays open. SDK = documented fallback. (Owner's "go".)
- **Permission policy = `--permission-mode manual` + `--permission-prompt-tool
  stdio`** — proven required by reviewers running the real v2.1.300 binary;
  every tool use now raises an app card. App-switches→flags mapping = open.
- **Working folder = the vault, app-decided** — the renderer never picks it.
- **A ✅ now requires a real run** — reviewers' rule, adopted: source+tests
  alone are marked 🔨 until proven live.
- **Console-clean means warnings fail too**, enforced by smoke + CI.
**Rule:** Log every decision with date, what, why, who requested, alternatives considered.

## 2026-10-14 Decisions

### [2026-10-14 evening] An unsigned Windows installer — and saying so out loud
- **What:** the app now packages with electron-builder + NSIS: an **assisted** install (you choose the folder,
  it is not one-click), **per-user** (`perMachine: false`, so no admin prompt), desktop + Start-menu shortcuts,
  `deleteAppDataOnUninstall: false` (the vault and settings outlive an uninstall), `compression: maximum`,
  `electronLanguages: [en-US]` (the other 54 Chromium locales were 46 MB unpacked for text nobody sees), and an
  icon rendered from the app's own `BrainMark.tsx` — no new mark drawn. **No code signing.**
- **Why:** the owner's first open item is running this on his own Windows machine, and
  `npm install && npm run dev` is not something a person installs. The standing rule "don't call a third-party
  installer safe without verification" applies to our own installer too: the release notes state, before the
  warning appears, that SmartScreen will say *unknown publisher* and what that does and does not mean.
- **Alternatives:** buy a code-signing certificate (rejected for now — money plus identity verification, and
  it changes no code); one-click NSIS (rejected: no folder choice, less to explain); MSI (rejected: NSIS is
  electron-builder's well-trodden path); ship a ZIP of `win-unpacked` (rejected: an uninstaller and shortcuts
  are part of being an app).
- **Note:** electron-builder 26 removed `win.publisherName` from its schema, and with no certificate there is
  no signing block at all — so the config carries no half-configured signing that could only ever fail.

### [2026-10-14 night] Settings is a full window, not a modal
- **What:** Settings became a full-window surface with a section rail, one section at a time, a search and a
  per-section Reset. `SettingsView.tsx` replaced `SettingsDialog.tsx`.
- **Why:** the owner asked for it in his own words — "i want to choose the other one you showed me … the one
  with full screen settings. like window's settings ig".
- **Alternatives:** keep the centred dialog (rejected: not what he pointed at); a separate OS window
  (rejected for now: it would work differently in the browser preview, and no part of the app needs two windows yet).

### [2026-10-14 night] Memory is measured against the profile the owner chose
- **What:** `fitCheck()` compares the model plus its context against the budget of the **selected** profile.
  CPU-only and Custom claim nothing and are never warned about. A preset that cannot hold the loaded model
  gets one sentence with real numbers and a one-click fix; the context snaps to a recognisable size.
- **Why:** the owner's complaint — "why does it warn after deliberately asking how much vram one has, if the
  context take 4.3 then why mannage it according to the device". The profile IS the answer to the question
  Settings asked, so answering it must not produce a warning about a smaller card.
- **Alternatives:** no memory maths at all (rejected: a machine that appears to hang is worse than a
  sentence); a hardcoded 4 GB (rejected: that was the bug); silent auto-adjustment of a person's own Custom
  numbers (rejected: it would change what they typed without telling them).

### [2026-10-14] No Vercel deployment files, ever
- **What:** the four deployment files were deleted and must not be re-added.
- **Why:** the owner — "Leave vercel delete all vercel files. It isn't helping like i thought."
- **Not included:** the Vercel *design theme* and the `vercel.json` written into an exported site ZIP, which
  are different things entirely.

### [2026-10-14] The vault API lives inside the app
- **What:** vault reads and writes run in the Electron main process (`src/main/vault/`) instead of a server on
  a loopback port. Resolution order: settings → env → the checkout's vault → the app's own data folder.
- **Why:** one process, no port to defend, no origin rules to get wrong, and the extension is not ready to be
  wired yet. The old clone's Express server (`apps/01`, port 8765) stays only as reference.
- **Consequence (a real gap):** the extension cannot POST to the app until a loopback port exists for it.

## 2026-10-10 Decisions

### [2026-10-10 19:20] Create Master Github Repo as AI Memory
- **What:** Create AI-ASSistant-Github-Repo with .ai/ + 00_LIVING_DOCS/ structure optimized for AI handover, not human aesthetics, single zip with all work + living requirements
- **Why:** User requested "give me one zip file with all we did so far. also that zip file will have the requirement list which will be updated by you every time something changes. basically the repo will also work as a memory and a handover file for other AI/agents/sessions too, i will be one seeing it, s n need to make it lok like human made, make the structure that suits you and ais best for the purpose i'm making it"
- **Who:** Utso
- **Structure:** .ai/ (AGENT_INSTRUCTIONS, CONTEXT.json, STATE.json, INDEX.json), 00_LIVING_DOCS/ (REQUIREMENTS_LIVING, HANDOVER_LIVING, ARCHITECTURE_LIVING, DECISIONS_LOG, CHANGELOG, TODO_NEXT), apps/01_claude-exact-pixel-clone + 02_electron-claude-clone-v6, extension/, vault/AI-Brain/, spec/screenshots/, archive_zips/, docs/originals/, memory/sessions/
- **Alternative:** Normal human GitHub repo with README + src — rejected because user explicitly said make structure that suits AIs best, not human-made look

### [2026-10-10 13:19] Build Exact Pixel-Perfect Claude Clone From 6 Screenshots
- **What:** Build AI-ASSistant-Claude-Exact from screenshots 191547-191707, exact layout: Sidebar 260px #202020 Search +New Projects Artifacts Customize Oct8 Older, Center #1a1a1a Evening Utso greeting with orange asterisk, composer #242424 How can I help you today?, Project Sonnet 5.5 Medium Manual, Free plan Upgrade, NU Utso Free, context menu, Settings modal spec, etc.
- **Why:** User posted 6 screenshots and said "come on man, is this to hard to make?" Previous clones were not exact pixel match, user frustrated. Screenshots are now authoritative spec.
- **Who:** Utso
- **Tech:** Vite 5 + React 18 + Tailwind, direct Ollama 11434/api/chat qwen2.5:3b streaming (use existing model, no download), vault API 8765, start-app.bat handling already-running Ollama, @rollup/rollup-win32-x64-msvc fix
- **Alternative:** Continue with Electron clone — rejected because user showed exact desktop and wants exact

### [2026-10-10 12:00] Default Capture = Check Everything + Wasn't Accessible Log + Never-Check Blacklist
- **What:** Extension default = check everything by default across all sites + all AIs after one-time permission; if inaccessible, log "wasn't accessible - reason" in 09 Activity & Undo + 01 Inbox/Processing Errors, no popup/ask; explicit collect only when user instructs (right-click "Collect this page now" or paste URL to force). Never-check blacklist: user can paste URL/domain/pattern into Privacy & Access / Source Scope excluded_patterns to never check any data from that URL ever again; editable, revocable; default allow, explicit deny.
- **Why:** User said "by default check everything, if unaccessible, just say wasn't accessible, no need to ask unless i give instructions to collect something (like a option where i put in a url and it won't check any data from that url ever again)"
- **Who:** Utso
- **Storage:** 00 System/Privacy & Access.md + 00 System/Connectors scope files + chrome.storage.sync excluded_patterns

### [2026-10-10 12:00] Extension UX = Capsule Hub + Quillbot
- **What:** Extension provides contexts like Capsule Hub by Tilantra (capture once as reusable Capsule with goals/constraints/background/decisions/attachments, library, drag-drop inject into any AI chat box, version/branch/rollback, transfer attachments, prompt enhancer "Cook This Prompt") and Quillbot (works in background ready when needed, works in any text field across web, highlight text or open toolbar for instant suggestions, real-time suggestions as you type, inline dropdown, no tab switching), local-only no external account required.
- **Why:** User said "Extension should provide contexts like Capsule Hub by Tilantra or Quillbot test suggestions"
- **Who:** Utso
- **Reference:** Mozilla Add-ons Capsule Hub description + Chrome Web Store Quillbot description fetched

### [2026-10-10 11:00] Use qwen2.5:3b Directly, No Download, Bat Handles Existing Ollama
- **What:** Use already downloaded qwen2.5:3b directly, no download, bat commands work on Windows TUF A15 8GB RAM 4GB VRAM, app is driver of vault (127.0.0.1:8765), dark default, uses Ollama at 11434 handling already-running, no native build tools
- **Why:** User hardware 8GB RAM 4GB VRAM, slow downloads concern, already has Ollama + qwen2.5:3b, wants bat that works
- **Who:** Utso
- **Implementation:** start-app.bat checks if Ollama running (netstat 11434), if not starts ollama serve, installs @rollup/rollup-win32-x64-msvc optional dep, starts vault API + Vite

### [2026-10-10 10:00] Fix Tic Tac Toe Loop for qwen2.5:3b
- **What:** Override systemPrompt for qwen2.5:3b to simple assistant, only create artifacts when explicitly asked, clear localStorage chat_history that contains looped artifact context
- **Why:** systemPrompt for isOpenSourceModel includes Flappy Bird game example as correct format, small model qwen2.5:3b interprets as must create game for every reply. Seen in user screenshots: Artifacts (2) HTML Application, all replies same Tic Tac Toe
- **Who:** Bug observed from user screenshots + previous sessions
- **Fix:** In Center.jsx use simple prompt, in Electron clone ModelService.js check model name qwen2.5:3b and use different systemPrompt

### [2026-10-10 09:00] Obsidian Vault as Canonical Memory, Not SQLite
- **What:** AI ASSistant connects to real Obsidian vault AI-Brain/ as canonical memory store, .brain/index.sqlite only rebuildable index, not source of truth. Don't build competing Obsidian clone or treat export-only folder as integration.
- **Why:** User decided "AI ASSistant will connect to the real Obsidian app/vault. Obsidian is the canonical memory store. Do not build a competing Obsidian clone"
- **Who:** Utso, from earlier sessions consolidated in Master Plan
- **Alternative:** SQLite as primary (SecondBrain.Windows/Services/LocalStore.cs at %LOCALAPPDATA%\SecondBrain\brain.sqlite3) — rejected, conflicts with new decision, must migrate

### [2026-10-10 08:00] App Name AI ASSistant Preserve Casing Double S
- **What:** Exact name AI ASSistant, preserve unusual casing double S
- **Why:** User explicitly requested name
- **Who:** Utso

### [2026-10-10 07:00] Claude Exact Layout Not Loosely Inspired
- **What:** Copy Claude's chat layout exactly, with features and behavior, not merely custom screen described as "Claude-inspired". Treat exact Claude-like layout and feature parity as first-class requirement. Create feature inventory before implementation.
- **Why:** User specifically wants exact copy, frustrated with loose approximations
- **Who:** Utso
- **Implementation:** Use 6 screenshots as pixel spec, measure colors #202020 sidebar #1a1a1a main #242424 composer, layout 260px sidebar, centered transcript max-w-4xl, etc.

### Earlier Decisions (From Master Plan Consolidation)

### [2026-10-09] Driver / Vault / Extension Roles
- **What:** App is driver, Vault organizes and keeps memory, Extension takes data and suggests contexts/prompts/files to give to new AI session. App will be like Claude where user can chat, command, do everything Claude app can do, it will use vault as its memory and organize memory in way decided. It will ask user things too.
- **Why:** User clarification "Meh, it can all the access. It is a local ai after all. It is no problem. The app will be the driver of vault, and the browser extension, vault will organize and keep the memory, extension will take data and suggest contexts/prompts/files to give to the new ai session."
- **Who:** Utso

### [2026-10-09] Full Cognitive Ability Even If Context Window Small, Use Obsidian as Brain
- **What:** Don't sacrifice cognitive architecture to get bigger context window. Keep model smart, externalize memory to Obsidian. Vault can be huge, but each AI still receives selected bundle, not entire archive.
- **Why:** User said "Normally local AIs cognitive architecture has to be sacrificed to get better context window. What I want is full cognitive ability even if context window is small, and use obsidian as brain to give permanent and working memory."
- **Who:** Utso
- **Key Insight:** Like person recalling right parts of long history, not loading whole archive into context

### [2026-10-08] Local-First, No External Upload Without Approval
- **What:** Local AI default, Ollama separately installed not bundled, keep chat and memory data on user's computer by default, no cloud models or external transfer unless user explicitly asks or approves, if sensitive context ever sent externally preview exact text and destination and require approval for that send
- **Why:** Privacy preference, user willing to grant broad laptop/browser access but wants explicit visible revocable control
- **Who:** Utso

### [2026-10-08] Model-Aware Capabilities
- **What:** Different models have different capabilities, app should expose every option supported by currently selected model, hide or clearly disable unsupported options, and update available controls when model changes. Don't assume every model can use tools, browse, process images/files.
- **Why:** User said "some models can do things other models can't, app should have all options so if i change model it should be able to do it"
- **Who:** Utso

### Template for New Decisions

### [YYYY-MM-DD HH:MM] Title
- **What:** ...
- **Why:** ...
- **Who:** ...
- **Alternative:** ... (if any, why rejected)
- **Implementation:** ...
