# TODO — next

**Same day, later: the OddBrain Motion Kit 3.0.1 landed (his "apply all of them") — 615 tests, g69–g71. His agy sign-in + the TUF A15 acceptance run remain his; his UI/UX redo owns all look-and-feel axes (structures/palettes/sizes deliberately untouched).**
**Evening: renamed OddBrain; the claudereverse shortlist TAKEN (PATH resolution, quick window, Ctrl+F, pop-out+PDF, fuses) — 621 tests, g72–g74. The 0.9.0 exe predates the rename (same features, old label). His gates unchanged: agy sign-in, TUF A15 run, his UI/UX redo.**
**2026-10-17: the judges' fix batch + the real agy adapter LANDED (604 tests; g66–g68). Remaining: HIS agy sign-in → the TUF A15 acceptance run on the 0.9.0 exe (the one open gate); his UI/UX redo after. Everything below is the pre-verdict queue, kept for history.**

**Last Updated:** 2026-10-15 (late night) Asia/Dhaka — rewritten after the
engine-spine session (Engine bay, house rules, throttle, freedom matrix,
memory guards). Where this and TODOLIST.md disagree on ORDER, this file wins.

## What changed this session (already DONE, for the record)

- [x] **v0.3.0 shipped:** the engine is the spine — EngineBay (engine
  selection system, brains FROM the engine's door, workplace folder picker),
  composer defers in engine mode, truthful alive tracking.
- [x] **House rules compiler** (`shared/lib/houseRules.ts`): one rulebook →
  CLAUDE.md (Claude Code) / AGENTS.md (agy); includes his standing
  instructions (ask when unsure, do nothing unnecessary) and memory
  discipline (answer from the conversation first, never sweep).
- [x] **The throttle:** Ask me (`manual`) / Auto-edits (`acceptEdits`) /
  Full speed (`bypassPermissions`) — the engine's own official modes, the
  app adds none of its own.
- [x] **Freedom matrix + five boundaries + memory problem** documented in
  ARCHITECTURE-ENGINE.md; both engine repos verified (agy has NO custom
  endpoint — Ollama brains can never plug into it; fake
  `gemini-antigravity-cli` repos = scams, warned).
- 315/315 tests, tsc clean, pushed (main = v3).

## NOW — his four messages answered and made real (2026-10-16, after Mods P3)

1. **Models ↔ engines, verified:** sends are engine-only; a Models key now rides the ENGINE (provider brains join the engine's picker; the engine is launched at the provider with the key in its env; the app never calls the provider itself).
2. **Monthly self-organization, now real:** the first boot or vault choice of a month writes `06 Review/Monthly Audits/<YYYY-MM>.md` from the vault's own numbers; write-once; no scheduler.
3. **Marketplace dissolved (his order):** modal + sidebar button + account-menu entry deleted; Connectors (engines + extension) and Plugins (packs) are the homes.
4. **3D first-class (his order, the Claude-OS view):** Brain in the nav + Ctrl+7 + "Open the 3D brain" in Settings › Vault; same graph engine, full height, live counts.

5. **The community store, for real (his question):** the repo grows `store/`, shipped as `resources/store`; Plugins offers "Add the community store" one-press; URL indexes that list files now download-and-verify-install; provenance badges are truthful (store · checksum verified / shipped / unverified). **The store is furnished (his follow-up): FOUR real packs — Prompt starters (the app's own 8 prompts), Looks (the 5 real accents), starter pack, Anthropic skills curated four (Apache-2.0 only, license text rides along; docx/pdf/pptx/xlsx excluded — source-available, no repack). `store/rebuild.mjs` recomputes digests; the shipped-store test pins index↔folder agreement. Agents/connectors stay refused in plain words until their runtimes. Receipts g37–g38 (Prompt starters installed live, verified).

6. **Code inside Projects (his "you choose", option 1 taken):** Code off the global nav, a Code button on every project card that opens Code scoped to the project's folder (Show-all returns everything; the menu keeps View > Code). Receipts g39–g41.
7. **DONE (his ask, 2026-10-16): the engine shows its thinking + the working word** — thinking events from the real wire, folded like the chat brain's, open while live; 24 gerunds turn over while the engine works. Receipts g42–g44 (scripted-brain wire run: spawn/parser/store/panel all shipped code).
8b. **DONE (his go, 2026-10-16): media + plan + checkpoints + loop guard** — pictures (real wire, proven), video-as-frames, dictation + Listen, Plan first (native flag), checkpoints (app-side keep/restore, proven), repetition guard. Receipts g46–g50; 475 tests. Engine downloads (8) still design-pending.
8-done. **BUILT (his go, 2026-10-16): engine downloads** — official-endpoint-only (URL gate in code), app-owned engines folder, staged+recorded, installer a separate Windows-only permission, ollama zip unpacked headless-ready, agy honestly a page link. 9 tests, 484 total; g51 real download from claude.ai.
15-done. **BUILT (his three answers via ask_user, 2026-10-16): auto memory** — Settings › Memory: the pass order shown on its face, sent as one normal turn through the one send path; the engine appends `06 Review/Memory/engine-notes.md` in its own workspace through its own Write/Edit tools (permission cards gate every line); the pane lists what exists (content, clip note) and Remove takes exactly one file after confirm; paths validated (memory folder only, no escapes, markdown only); empty vault said honestly; g63 empty/remembered/removed. **Audit addendum (his "did you leave anything?"): auto-keep made REAL** — the rulebook's "What you keep" section deploys to every engine's own rules file, so the engine may append during NORMAL work, not only on the pass button (g64, the engine quotes its own rules); memory doors re-rooted to the engine's actual working folder (workspace || vault) so pane and engine can never disagree. 8 more tests, 589 total. **Installer 0.9.0 built (the acceptance build): sha256 267a7530…, 0.8.0 deleted first.**

14-done. **BUILT (his "all of them in one go", 2026-10-16): the finale five** — copy/edit on the card; extended thinking (engine's own MAX_THINKING_TOKENS via the chip); context totals on the header (turns/tokens/$ this window); the work line (busy sends park, drain in order, sequencers hold); conversation-restore v2 = the turn journal (engine-journal.json, cap 60, "Earlier sessions" on cold load) + cold-window init fix. 7 tests, 581 total; g60–g62.
13-done. **BUILT (his go via "next", 2026-10-16): watch mode + adversary reviewer** — Watch a folder (working folder only, quiet-debounce, gap, tail-chase cooldown, deletions don't fire, runs through the one path; g58) and Review (report-only self-check, CLEAN-only-strict, verdict on the card, same-brain labeled; g59). 9 tests, 574 total.
12-done. **BUILT (his go via "next", 2026-10-16): split** — composer Split button: engine writes 2–6 steps (or SOLE), owner reads them, app runs them in order as normal turns through the one send path; failed step halts, retry resumes, checklist keeps each answer. Finished-block-wins parsing + the wire-chunk regression test (37-cut chop; "44" here was wrong until 2026-10-17). 43 tests, 565 total; g57.
11-done. **BUILT (his go via "next", 2026-10-16): repo map + hooks** — composer map button (bounded honest tree of the WORKING folder, add-to-message or copy; no window-picked paths) and Settings › Hooks (owner's commands at turn-done/turn-error/permission, hand-added only — packs refuse by format, run-once tries first, failures reported in the story, never fatal). 11 tests, 522 total; g55 + g56 (hook line on the card, live).
10-done. **BUILT (his go via "next", 2026-10-16): compaction** — engine card Compact button: engine writes the brief (own words, shown in full) → session ended AND resume id forgotten (socket.fresh) → brief saved to userData/handoffs + armed as the seed; the next send rides with it, exactly once. Any refusal leaves the conversation untouched. 8 tests, 511 total; g54, receipt + sessions cycle disk-verified.
9-done. **BUILT (his go via "next", 2026-10-16): recipes** — saved work orders as plain markdown under userData/recipes: composer Recipes button → pick → fill → "What will be sent" preview → run as a normal work order (engine cards still gate everything; a recipe approves nothing); Settings Recipes pane (create/edit/rename-without-orphans/remove, starters in one press); unknown frontmatter refused by name, undeclared tokens refused, path tricks slugged away, broken files listed. 12 tests, 503 total; g53 + echo run, 4 files disk-verified.
8.5-done. **BUILT (his go via "next", 2026-10-16): brain battles** — composer Battle button → second-brain chooser → sequential sides on the real engine → blind A/B card → Left/Right/tie pick → reveal + private local ledger (`battle-ledger.json`, cap 500, no Elo); composer brain always restored; bump counter (honest turn signals); ghost checkpoints (restore deletes what the engine made). Fixed a real wire bug the battle exposed (identical consecutive answers double-rendered). 7 tests, 491 total; g52 blind + reveal, ledger on disk.
8. **HIS DECISION, design pending his go (2026-10-16): in-app engine downloads** — the fixed trio downloadable inside the app into app-controlled locations; headless Ollama functions (NO desktop app); logins redirect to terminal/browser; home = Engine or Models page (his wish). Plus the cross-engine rule: engine features built into the app work no matter the engine; the store stays OURS, never Claude's/Google's. Word list (197) + slop sweep SHIPPED same day.

Receipts g27–g64. Version 0.9.0 (acceptance build). The OFFERED list is BUILT; auto memory BUILT. Next: TUF A15 acceptance on the 0.9.0 exe (his run) — the only gate left.

**For judges/reviewers (his order, 2026-10-16):** start at `JUDGE-BRIEF.md` in
this folder; the receipts are shipped in-repo at `receipts/` here (g27–g64);
`.ai/STATE.json` and the README carry the same truth machine-readably.

## NOW — the acceptance round-trip (everything hangs on this)

- [ ] **His run on the TUF A15** with the v0.8.0 installer (BUILT 2026-10-16 — AI-ASSistant-Setup-0.8.0.exe, 88,129,252 B, sha256 aa10fb3d…75a8c):
- [ ] **His run on the TUF A15:** install → Engine on → pick a brain in the
  bay (cloud badge = leaves machine; local = offline) → pick a folder →
  set the throttle → give real work → approve via the card → see artifacts
  land. This is the ✅ the judges demanded (6.2/6.5 tick on 👍).
- [ ] On any defect: same-day fix, rebuild, he retries.

## TRACK A — the spine (engine parity — HIS #1 RULING: LANDED 2026-10-15, five landings, 343 tests)

- [x] **Per-engine model routing** (landing 2): `engine:models` asks the
  CHOSEN engine's own source; agy's answer is honest in both states.
- [x] **Pull-models + delete in the bay** (landing 3): real progress bar,
  names validated, claude-code only (no fake downloads for cloud engines).
- [x] **agy Windows check is now self-serve** (landing 2): `engine:detect`
  runs each engine's `--version` on HIS machine; the bay shows "not
  installed" with the fix (scam repos named) or lights agy up by itself.
  REMAINING: the agy ADAPTER (`main/engine/agy.ts`) once agy exists on his
  machine — the check tells us which input mode it offers.
- [x] **Session resume across app restarts** (landing 1): session id per
  workspace persisted; fresh launches continue the old conversation via
  `--resume`; a living engine is never resumed from file (tested).
- [x] **Skills: one vault → every engine** (landing 4): doors + exact-format
  deploys (CC `SKILL.md` frontmatter; agy filename-as-slash-command); his 11
  CC skills import cleanly (scanner tested). REMAINING: the Skills pane UI
  (nav item lands with its screen, per the standing rule).
- [x] **MCP: one list → every engine** (landing 4): `.mcp.json` +
  `.agents/mcp_config.json` written from one canonical list; remote-field
  translation confirmed at the agy check.
- [x] **File diffs on approval cards** (landing 1): before/after preview,
  clipped to a decision size.
- [x] **Usage display** (landing 1): tokens/time/cost from the engine's own
  result sentence, on the work card.
- [ ] **Plugin packs (level 2)** — still honestly blocked on agy's formats.
- [ ] **Per-hunk accept/reject on approval cards** (from the landscape study:
  Nimbalyst/Claudette) — upgrade the before/after card to accept part of an
  edit; lands with Code 06.
- [ ] **Needs-you notification** (Claudette): tray/title pulse when a
  permission card waits — after the card-queue defect fix.
- [ ] **Session board** (Nimbalyst): the resumable sessions get a kanban in
  Projects 04 / Code 06, with session-to-file links feeding the context pane.
- [ ] **Extension → engine, via SKILLS not MCP** (upgraded after studying
  capsule-hub-skills 2026-10-16): ship vault skills (save/search/read) that
  teach Claude Code/agy to call the LOCAL vault HTTP API — their paid cloud
  flow, ours local and free, and no tool schemas riding every turn (their
  own design note, verified). Captured/annotated pages become queryable by
  the engine, not just saved.
- [ ] **Accessibility-tree capture** (Prophet): the better capture default if
  we go beyond text, replacing screenshots.
- [x] **House-rules edit screen** (landing 5): Settings → House rules — five
  fields, save-and-deliver; every send deploys the rules + brain footnote to
  each engine's own global file as a marker-bounded block (his words in
  those files are never touched — tested).
- [ ] **"About the owner" block — ON HIS WORD** (offered 2026-10-15): ten
  lines max, he writes/edits it, rides every engine's context. Not built
  until he says so.
- [ ] **Per-turn context pane** — tool/file activity is already on the card;
  the full pane (exactly which memory/skills loaded) lands with Code 06.

## TRACK B — the face (the six designed screens; mockups are authority)

- [x] **Today 07** — LANDED: the landing screen counts real records only
  (chats, artifacts, the vault's reading record), worth-doing-next comes
  from those records and never invents a task, honest empty/missing states,
  third nav section (the muted "being built" line shrank accordingly).
- [x] **Projects 04** — LANDED v0.5.0
- [x] **Vault 05** — LANDED v0.5.0
- [x] **Code 06** — LANDED v0.5.0 (workspace, throttle quick-set, real resumable threads)
- [x] **First-run 08** — LANDED v0.5.0 (name, brain from the engine's door, vault folder; all skippable)
- [x] **Appearance 09** — verified built (tokens, sidebar/rail remembered)
- [x] Sidebar + composer rebuilt to his correction (2026-10-16): EngineBay out of the sidebar, one scroll, collapse = chats only, engine-is-the-only-path, engine+models chips with the three modes in the engine box, marketplace. Still carried: undo card, session insights, prompt-library + regenerate wiring.

## TRACK C — open defects (judge list) — **COMPLETE 2026-10-16: all nine resolved, each pinned by test (v0.5.1)**

- [x] free-gate: empty `baseUrl` still passes machine env through — FIXED: `sanitizeEnvironment` strips ANTHROPIC_* from the inherited env on every launch; the chosen brain is applied on top, none borrowed
- [x] cloud/local badge classification — FIXED: one function (`isCloudModelName`) classifies for every list; the composer's trigger badges the chosen brain too, and the list speaks the one canonical word ("cloud")
- [x] stdin EPIPE guard — FIXED: guarded `writeLine` + stdin error swallow; a dead pipe is "not delivered", never a crash
- [x] deliberate kill is quiet — FIXED: `deliberate` flag; a stop's close carries no error card, a real crash still says why
- [x] Windows stop = `taskkill /pid <pid> /T /F` — FIXED: tree-kill through the shell's pid (pinned by test); plain signal elsewhere
- [x] parser scan-offset — FIXED: `scanned` offset; a chunk-chopped line is rescanned only in its new tail (linear, pinned at every split point)
- [x] `engine:read` history hydrate-or-drop — FIXED: a window opened mid-turn replays the remembered events; replayed-as-live then reconciled (a dead engine's leftover question is dropped, a cut-off run closes as "engine stopped", empty history shows nothing)
- [x] token streaming — FIXED: `--include-partial-messages`; `stream_event` text deltas become `delta` events, the renderer grows one line instead of stacking words, the finished message is shown once, and deltas never crowd the remembered history
- [x] >1 pending card queue — FIXED: `permissions` queue in arrival order; the first is answered first, the rest counted ("+N more waiting"); nothing lost under the card being looked at
- [x] ~~settings.permissions → engine flags~~ RESOLVED BY DECISION
  (2026-10-15): the app imposes no rules of its own — owner-favor, documented
  in ARCHITECTURE-ENGINE.md.

## TRACK D — hygiene (continuous) — core landed 2026-10-16; installer REBUILT at v0.6.0 the same day (his "yes"), recipe preserved in RELEASE-WINDOWS.md

- [ ] **Landscape sweep — STANDING DUTY (his correction, 2026-10-16):** every
  working session includes a proactive scan of the four spaces (CC GUIs,
  capture extensions, skills indexes, Ollama tools); anything genuinely new
  goes into RESEARCH-LANDSCAPE.md with the five-question rubric. He found
  two repos before I found any — that never happens again.
- [x] **Caveman-style token hint** — LANDED: `isSmallLocalBrain` (size tags ≤14b, phi/tiny families) adds a two-sentence bare-facts hint to the quirk table, riding the deployed rules. Researched: the caveman skill claims 65% output cuts but its own rule block costs ~1,160 input tokens — ours is two sentences, only for the brains that need it.
- [x] **Handoff button** — LANDED: a finished turn becomes one vault document (`handoffs/<date>-<task>.md`) shaped after the three handoff repos studied 2026-10-16 — instructions to the receiving assistant, the task, the real tool calls as evidence, the resumable session id — also copied to the clipboard. Built from the turn in memory; nothing parsed post-hoc, nothing invented.
- [x] **Obsidian export** — LANDED as Vault > "Export copy": a timestamped snapshot of every markdown file, structure intact, into the app's exports folder. Researched the export tools first — they all produce a folder of markdown, which the vault already is, so nothing is converted.
- [x] **Skills sourcing** — LANDED: Settings > Skills lists a curated catalog (verified live against anthropics/skills' real folder list: docx/pptx/xlsx/pdf, mcp-builder, skill-creator, webapp-testing, frontend-design, web-artifacts-builder, doc-coauthoring, internal-comms); one click fetches the raw SKILL.md (catalog names only — the door fetches nothing else) and deploys to both engines through Track A's deploy. The Skills pane UI debt is hereby settled by this section.

- [ ] Real-CLI harness (settle `-p/--print` and `initialize` disputes) — honestly blocked: no claude binary in the build sandbox; runs on his TUF A15 (the detect door self-serves).
- [x] JUDGE-BRIEF.md refresh — done 2026-10-16 (v0.6.0 section).
- [x] `/home/user/` doc mirrors re-sync — done 2026-10-16 (stamped).
- [ ] RELEASE-WINDOWS.md stays current per installer build

**Standing rules (his, 2026-10-16, after the merge-spam):**

- **Work in the v3 branch only.** `main` is frozen — it moves only when HE
  says merge. No heal-merges, no "Merge remote main" chains, one landing =
  one commit, never two merges for one landing.
- **Verify before pushing:** full suite + tsc clean, `git status` empty,
  diff vs remote checked line-by-line, THEN push once, THEN `ls-remote`
  confirms the exact sha landed. No push without that chain.

**Standing rules:** ✅ only after a real turn with the real engine on his
machine; every item individually checkable; docs in sync each landing; no
quiet descope — "everything, done correctly."


## LOCKED QUEUE (his order, 2026-10-16: "lock these for now") — do not re-derive; he reopens it

**A. Research takings, in order (AMENDED 2026-10-16, his "everything you said, yes"):** 1. needs-you pulse (Claudette: title-bar/tray when a permission card waits) → 2. **Browser control (APPROVED): Settings › Skills "Browser control" switch → writes MCP entry (chrome-devtools/playwright MCP) into the engine's mcp.json via the existing door; every action rides the permission cards; extension never-collect list unchanged** → 3. per-hunk accept/reject diff cards (Nimbalyst/Claudette; shares the card work with A.2) → 4. extension focusin tracking (sweep #5, capsule-inject) → 4. session kanban + session↔file links (Nimbalyst, Projects/Code) → 5. engine-queries-browser (onUI: engine reads marked-up page via the capture door) → 6. a11y-tree capture (Prophet) — SHIPPED `3a0417a` → 7. picker drill-down + provider grouping (when engines >2) → 8. **Mods plugin / Community Store — PROMOTED from parking (his ask, 2026-10-16): COMMUNITY-STORE-PLAN.md is the design. Phase 1 first: pack folder + manifest.json + permissions shown in plain words before install + Install-from-file + Extensions list in Settings (skills/prompt packs/agents/themes only). Then index client (a URL to index.json + checksums — no server, no accounts) — SHIPPED (Mods P2, folder+URL indexes, sha-256 pinned, tamper-refused; receipts s23–s25) — then export-as-pack + starter pack — SHIPPED (Mods P3: Export as pack with real-skill listing + starter pack through the normal install path; receipts s26–s28). MODS COMPLETE. Previewer SDK folds into the pack system's `contributes`.**

**B. Approved-screenshot debts — DONE (2026-10-16, his "as many as you can"):** Connectors pane ✓, "Get API keys" menu entry ✓ (+ Settings initialSection), Move to group rename ✓, Narrow/Medium/Wide ✓, Anthropic Serif ✓, Today quick actions + Current Snapshot ✓. Judged OUT: "Open in new window" (not in any approved mockup — dropped), Voice (no mockup, nothing in src — nothing to match). Receipts: shots s17–s22.

**C. Extension locked state:** v0.1.2, ships in installer (`resources/extension`, extraResources), one-time load-unpacked, posts 127.0.0.1:8765 (door opened by the app), queue≤200/activity≤100 when offline, never-collect list untouched, popup Capsules/Never-Check/Activity. Future = A.3, A.5, A.6 only (+ native-messaging-host evaluation parked; port stays until it breaks).

**D. v1.0 path (unchanged):** finish B (his picks) → installer rebuild LAST (one exe, delete the old first) → TUF A15 acceptance run = the real gate.
