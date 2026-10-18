# ORCHESTRATION — OddBrain sub-agent fleet (owner's multi-agent plan)

Owner's model: several agents, each on its OWN branch of NishadIslamUtso/OddBrain.
I (main agent) write ONE prompt for all of them, dividing work per branch, then judge
each branch and tell the owner which agent to delete/replace. "Survival of the best ones."

Status: WAITING for the owner to say the branches exist + their names.

---

## 1. Ground truth (verified 2026-10-18)

- main = v3 = `a6c7807` (real-machine fixes: binary overrides, Ollama auto-start at boot,
  Point-to-the-exe IPC doors, spawnImpl fix, pid-dir fix, PATH-shape fix). CI 4/4 green.
  Artifact: OddBrain-Setup-a6c780768b77e50870bc297c928b7d84709a0697 (96.2 MB), run 39103557727.
- Gate at a6c7807: 99 test files / 723 tests, tsc 0, build green, smoke errors=0.
- `agent-resources` branch (8681034) = dead sub-agent's uploaded workspace. NO code branch was
  ever made by it; its own plan said "Do not push". Its session died at context limit during
  "Quality Check 10/55" (2026-10-18 ~13:23 Dhaka).

## 2. Assets left by the dead agent (on agent-resources)

- `reference/session-v2/` — **app-code package v2** ("corrected package v2"):
  - `OddBrain-App-UI.patch` (582 KB) + `files/apps/03_oddbrain/` full replacement/new source
  - `apply.mjs` + `PATCH-MANIFEST.json` (content checks, `_oddbrain-ui-backup-*`, rollback)
  - `checks/RESULTS.json`, `checks/RETENTION-AUDIT.json` (221 dispatcher action ids)
  - **Baseline: `2f05dac` — STALE. Apply tool REFUSES newer baselines.** Main moved 10
    landings past it (ff90e3e, 4fb6c15 honesty, 82490aa design systems, 06da1c1 cap/staging,
    ea5294c, 9b57fe9 connectors, 341efc5 media-fix, 7ad6b7c, 29e34e9 WHAT-EXISTS, a6c7807).
  - Claims: 18 settings sections, 8 looks / 8 layouts / 9 palettes / 4 styles, 77 SVGs
    byte-exact, real main-process auto-keep + second-pass reviewer (tool-free text transport),
    artifacts/memory/project controls, offline preview HTML. Compiled + regression-tested on
    Linux only. Honest boundary stated in its README.
- `OddBrain-UIUX-Handoff/` — SPEC rev2 (37 KB, authority doc), REFERENCE.html (1.69 MB,
  sha256 808d5f16…), CHECKS.json (inventory: 8 presets / 8 layouts / 9 palettes / 4 styles /
  77 scenes / 18 settings), HANDOFF brief, wordmark SVG.
- `workspace-notes/` — WORK-PLAN.md, DECISIONS.json (owner's scope answers), baseline-tests.log.
- `uploads/` — OddBrain.html (inventory source, owner's copy sha 7e00e200… byte-equal),
  butt-brain-animations.html, index.html, index (1).html.
- `OddBrain-main` = submodule pointer to a6c7807 (NOT the files — agents must clone the repo).
- `skills/no-ai-slop` — writing skill for app copy.

## 3. Owner's standing scope (extracted from dead session Q&A — DECISIONS.json)

- Display: 1920×1080 @ 125% → 1536×864 logical; clamp window to work area.
- UI authority: "our session version" (the uploads), full replacement allowed, but PRESERVE
  main's working features + newer fixes; never bulk-overwrite main with old files.
- Include all planned features (engine marketplaces = owner's GO) + repair broken features.
- Voice/Jarvis: PARKED. In: read-aloud + dictation. No wake word, no continuous voice.
- Media: broad audio/video/image/document decode; explicitly chosen provider only; no silent
  switching; explain unreadable/encrypted/DRM/corrupt files honestly, never fake a read.
- Windows PC only; min content 940×620; comfortable 1280×820 + 1440×900.
- Keep the existing type scale (SPEC rev2 §2 table): settings heading 15px, body 13, convo 14.5,
  44px bars, sidebar 260 (200–420), radius 14 composer / 8 controls, motion 160/120/220ms.
- No new fonts, no new cloud services, no microphone, no telemetry, no repo/README cleanup.
- Sub-agents: NO push to main, NO merge, NO deploy. Their branch only.

## 4. Laws the fleet prompt must carry (from session memory)

- Honesty: no fake UI state (no invented models like `gemma4:cloud`, no colored-dot lies),
  words not dots; every number countable; features that don't exist get one muted line.
- Engines EXACTLY claude-code + agy; Ollama = local brain server, not an engine.
- Extension capture-everything default ON; downloader benched (winget route); download-cap law
  kept (never block a real official download).
- Security walls (origin smuggle, pairing consent, zip forged declarations, redirect pins,
  shellSafeCommand, keys-in-main) must survive — any regression = reject the branch.
- Strip collapsible + force-reveal on waiting-permission; thinking collapsed until opened.
- One landing = one commit per agent-landing on THEIR branch; tests prove every feature.
- npm ci FIRST (bare npx fetches wrong packages). Smoke probe `[data-find-scroll]`.

## 5. Proposed division (finalize when branch names arrive)

- Agent SHELL/{branch}: renderer shell — 8 layouts, nav, quiet-shell rules (SPEC §3), sizes
  §2 table, launch assembly, 77 SVGs namespaced, motion modes; Chat/Today/Artifacts screens.
- Agent LOOKS/{branch}: appearance system — 8 looks, 9 palettes, 4 styles, mix/compare/quiz/
  shortlist, design-system application to ALL screens, exports; settings Appearance pane.
- Agent CORE/{branch}: main-process — rebase session-v2's auto-keep, second-pass reviewer,
  memory pass, artifacts/trash, project/context controls onto a6c7807; media decode pipeline,
  read-aloud, dictation; engine marketplaces (owner's go) via official channels only.
- All three: baseline a6c7807, PR-based on their branch, tests+build+CI green, WHAT-EXISTS.md
  section in their branch describing what exists.

## 6. Judge checklist (grade each branch; report dead agents to owner)

1. Branch clones + `npm ci --ignore-scripts` + electron install.js; tsc 0; full vitest green.
2. Applies on TOP of a6c7807 (or honest rebase of session-v2 patch); apply-tool refusal honored.
3. Honesty audit: grep for invented defaults (gemma4, fake dots), countable numbers law.
4. Retention: 221 dispatcher ids still answered or honestly consolidated (audit file present).
5. Security walls intact (diff-audit against §4 list; shellSafeCommand untouched).
6. CI green on THEIR branch; installer artifact builds; smoke errors=0 warnings=0.
7. No scope creep: no fonts/cloud/mic/telemetry; voice parked; no push to main.
8. Session hygiene (cause of death #1): agents must NOT ingest the 1.7 MB HTMLs wholesale;
   extract tokens/sections; commit early and often on their branch.

## 7. Fleet prompt — fill branch names, then send as ONE message to every agent

(See §7-PROMPT below; placeholders: {BRANCH_SHELL}, {BRANCH_LOOKS}, {BRANCH_CORE}.)

---

## §7-PROMPT (final text — send to every agent once, with branch names filled)

You are one of several agents building OddBrain in parallel. Repo:
https://github.com/NishadIslamUtso/OddBrain (public). You work ONLY on your own branch —
never push main, never merge, never deploy. The orchestrator (main agent) will clone your
branch, run the gate, and judge; the owner deletes failing agents and replaces them.

Branches and slices:
- {BRANCH_SHELL} — renderer shell: the 8 layouts, nav, quiet-shell rules, exact size table,
  launch assembly, 77 mascot SVGs (byte-exact, namespaced per instance, 8 roles mapped to
  real states), motion modes; Chat / Today / Artifacts screens on the new shell.
- {BRANCH_LOOKS} — appearance: 8 looks, 9 palettes (+app default), 4 interface styles,
  mix / compare / quiz / verdict / notes / shortlist, full design-system application to ALL
  screens (css >100-char law), theme/pack exports; the Appearance + settings panes.
- {BRANCH_CORE} — main process: rebase the session-v2 package's auto-keep, second-pass
  reviewer, memory pass, artifacts/trash, project/context controls onto current main; add
  media decode (audio/video/image/document), read-aloud, dictation; engine marketplaces
  through official channels only (owner's go is recorded).

For everyone:
1. Baseline = current main `a6c7807`. Clone, cut your branch from it, `npm ci --ignore-scripts`
   then `node node_modules/electron/install.js`. Never take the old `2f05dac` tree wholesale —
   the session-v2 patch (branch `agent-resources`, `reference/session-v2/`) is REFERENCE
   MATERIAL to re-apply piece by piece onto main; its apply tool refuses newer baselines by
   design. Preserve main's newer fixes: engine binary overrides + Point-to-the-exe, Ollama
   auto-start at boot, spawnImpl/pid/PATH fixes, honesty contracts, design-systems loader,
   connectors doors, security walls (shellSafeCommand, keys-in-main, pairing consent, redirect
   pins, zip-declaration checks), extension capture-everything default.
2. Authority documents: `OddBrain-UIUX-Handoff/OddBrain-UIUX-SPEC.md` (rev 2 — behavior,
   retention, sizes, acceptance), `OddBrain-UIUX-REFERENCE.html` (visual direction),
   `workspace-notes/DECISIONS.json` (owner's scope answers). The owner's uploaded
   `OddBrain.html` is the inventory source. Where docs conflict with current main's real
   behavior, keep main's real behavior and say so in your branch report.
3. Laws: honesty above all — no invented model names, no colored-dot lies, words not dots,
   every number countable on screen, one muted line for what does not exist. Engines are
   exactly claude-code + agy; Ollama is the local brain server, not an engine. Voice/Jarvis
   parked; read-aloud + dictation in; no wake word. No new fonts, no new cloud services, no
   microphone, no telemetry. Windows PC only, min 940×620, comfortable 1280×820 / 1440×900,
   owner's display 1536×864 logical — clamp the window to the work area.
4. Proof: every feature lands with a test. `npx tsc --noEmit`, `npx vitest run`,
   `npm run build`, `npm run smoke` all green before you report. Commit early, commit often,
   push your branch. Finish with a BRANCH-REPORT.md: what exists, what is re-applied from
   session-v2, what you refused to port and why, exact gate numbers, what is unproven.
5. Session hygiene: do not read the 1.7 MB HTML files whole — extract the sections/tokens you
   need. Keep your context lean; dead agents before you died of context bloat at 10/55 checks.

The orchestrator will grade: clean apply on a6c7807, full gate green, CI green on your branch,
honesty audit, 221-action retention vs real features, security walls intact, no scope creep.

---

## 8. FLEET DEPLOYED (2026-10-18 ~10:45Z) — briefs pushed to all 8 branches

Owner kept `arena/cc83a507-oddbrain` (appearance) for himself — UNTOUCHED by me.
Lane assignment (brief = ODD-BRAIN-BRIEF.md at each branch root):

| Branch | Lane | Key deliverable |
|---|---|---|
| arena/d3c1ee25-oddbrain | VERIFY & INSTALL GATE | VERIFY-RESULTS.md, CI runs built app, honest unsigned-installer gate |
| arena/ea5c07b0-oddbrain | ENGINE MARKETPLACES | real claude-code marketplace probe; agy honest gap; permission cards |
| arena/0bd5478b-oddbrain | QA DRIVE | every screen + 18 sections driven in CI; FIXLIST.md; IPC repro of owner's 2 bugs |
| arena/6d6aabbf-oddbrain | DOCUMENT INTAKE | decode docs/text/pdf/office; named refusals; intake door + registry |
| arena/9a3a5c88-oddbrain | AV INTAKE | audio/video/image decode; capability gate; plugs into 6d6aabbf's registry |
| arena/81a07155-oddbrain | READ-ALOUD + DICTATION | OS TTS/STT only; wake word stays parked; off = really off (tested) |
| arena/495d260c-oddbrain | AUDIT (my scanner) | BRANCH-COMPARISON.md: 221-id retention, law breaches, collisions, dead branches |
| arena/9781cd95-oddbrain | CORE REBASE | session-v2 main-process (auto-keep, reviewer, memory, artifacts) onto a6c7807 |

Brief-commit tips: d3c1ee25=21d90617 ea5c07b0=b5f26d99 0bd5478b=22461034 6d6aabbf=68b408a4
9a3a5c88=f65d3524 81a07155=37e499f7 495d260c=23cca814 9781cd95=15492b78
Judge order when reports land: 9781cd95 (core) → 495d260c (scan) → 0bd5478b (findings) → rest.
NOTE: sandbox git rotted AGAIN this segment (creds file = host-only URL; build full URL with token manually).

## 9. FIRST VERDICT (2026-10-18) — arena/ea5c07b0 (marketplaces): PASS, grant issued
- Tip c1c7b6c verified INDEPENDENTLY on judge machine: tsc 0 · 117 files / 812+1skip (exact match) · build green · smoke SMOKE OK errors=0 (the part their sandbox couldn't run — electron download blocked there).
- Code audit: shellSafeCommand used; fail-closed bounded CLI parser; NO network fetch; NO fabricated catalog; agy = one muted line; mutations disabled until real approval cards; fixtures = real CLI 2.1.302 recordings.
- Report honesty: exemplary (claimed smoke NOT passed, no green claim, flagged own scope conflicts).
- CI tip: linux success; windows "Built media worker" failure = INHERITED from c1a9711 bulk commit (pre-assignment) — merge-time reconciliation (media worker likely superseded by lanes 9a3a5c88/6d6aabbf).
- AUTHORIZATION #1 pushed (tip baefbf66): 5 files (EnginePanel card-reuse, state/engine queue, main index IPC, shared contract, marketplaceArgs removal), 3 required tests (Allow runs / Deny refuses / no-card fail-closed), zero visual restyling (owner's branch owns looks).
- Merge-time note: marketplace delta = c1c7b6c..tip rel. to c1a9711; the c1a9711 bulk UI ancestry to be superseded by owner's cc83a507 — cherry-pick at merge.
- Sandbox quirk this segment: lightningcss gnu binary missing after npm ci --ignore-scripts → fix: `npm install --no-save lightningcss-linux-x64-gnu@1.32.0`.

## 10. SECOND VERDICT (2026-10-18) — arena/9a3a5c88 (AV intake): PASS, one-line CI fix ordered
- Their report a5b29ab honest (disclosed pre-brief out-of-lane ancestry c17cf31, claimed nothing unproven).
- Gate reproduced on judge machine: tsc 0 · 103/744 exact · build clean · SMOKE OK errors=0 (closed their electron-block).
- CI root cause FOUND by orchestrator from logs (their log download was EOF; mine worked): tinypool `RangeError: minThreads/maxThreads conflict` — their `maxWorkers: 1` vs vitest default minThreads scaling: CI 4 vCPU → min 2 > max 1 → crash pre-test ("no tests"); 2-vCPU sandboxes unaffected → "local pass, CI fail" mystery. Evidence run 39123693424 6_Tests.txt.
- RULING #1 pushed (5b06d6bf) + THE CHANNEL (8e4fb229): fix = `maxWorkers: 1` → `fileParallelism: false` (narrow auth, vitest.config.ts only); c17cf31 ancestry kept, out-of-lane files FROZEN (documents/pdfPages→6d6aabbf, dictation→81a07155, reconciled at merge); windows "Built media worker" step = inherited, don't chase, file as question.
- THE CHANNEL pushed to ALL 8 branches (tips: 0bd5478b=a171f0c9 495d260c=87beecbd 6d6aabbf=710b760b 81a07155=199cd64b 9781cd95=355bf3e9 9a3a5c88=8e4fb229 d3c1ee25=81978188 ea5c07b0=2807c217):
  QUESTIONS-TO-ORCHESTRATOR.md protocol (file question → push → STOP → "Filed for orchestrator"); rulings arrive as commits to their branch (fast-forward pull only).
- LESSON: CI log download via API works with my token even when agents' gh/EOF fails — always pull logs myself before believing "cause unproven".
- LAST-SEEN TIPS (for "next" sweeps): d3c1ee25=81978188 ea5c07b0=2807c217 0bd5478b=a171f0c9 6d6aabbf=710b760b 9a3a5c88=8e4fb229 81a07155=199cd64b 495d260c=87beecbd 9781cd95=355bf3e9 cc83a507=01b1237f (owner's, untouched)

## 11. SWEEP #2 (2026-10-18 ~12:1xZ) — fast protocol adopted (trust reports + CI + diffs; NO local gate reruns unless suspicious)
- CI at sweep: 9a3a5c88 GREEN (their fileParallelism fix landed) · 81a07155/9781cd95/6d6aabbf/495d260c green · 0bd5478b in-progress · d3c1ee25 red (their NEW renderer-server step, gate itself green both OS per own gate JSON 114/807; fix ordered) · ea5c07b0 red (inherited media-worker, ignore).
- VERDICTS: ea5c07b0 PASS (grant cash-in exact: 5 files + approval test) → phase 3 + then lane-complete report. 81a07155 PASS (voice lane complete → mark + stop). 495d260c PASS (best report; +2 columns next scan). 0bd5478b accepted (facts pre-fed: 9a RangeError ruled, media-worker inherited). 6d6aabbf nudged (+9a's frozen documents/pdfPages become theirs at merge). 9781cd95 KICKED (silent since brief; pre-brief out-of-lane files frozen incl. cloud/media.ts; report next sweep or replaced). 9a3a5c88 no action.
- NEW FLEET LAW (in all rulings): counts printed must come from the run output just executed — scanner caught stale counts (docs say 114, tree has 117 etc.).
- Scanner intel adopted: 7-branch renderer collision (~100-file conflicts) → merge = pick ONE UI branch (owner's cc83a507) + cherry-pick functional lanes. gemma4:cloud clean everywhere. MediaRecorder dictation in 4 branches' ancestry → at merge dictation = 81a07155's Windows-native impl wins.
- RULINGS PUSHED via per-branch shallow clones (/tmp/sw-*) — the rot-proof method; old repo-check clone abandoned for sweeps (rot regenerated mid-turn twice).

## 12. SWEEP #3 ("next") — all 8 answered the rulings; 3 rulings pushed
- 81a07155: voice lane marked COMPLETE per order, CI green. ✓ DONE (resting).
- 9a3a5c88: green CI evidence recorded, AV clarifications. ✓ working.
- ea5c07b0: phase-3 lifecycle proof through reused cards; linux SUCCESS, windows fails ONLY inherited media-worker. ✓ on track.
- 6d6aabbf: pulled ruling, quiet work. 495d260c: scan #2 delivered (added asked columns; found 0bd5478b hang + d3c1ee25 new failing step; separable-merge finding: 9a3a5c88 merges cleanest after UI pick).
- 9781cd95: ALIVE, best-shaped BLOCKED report (electron blocked, mirror retry failed, no smoke claim). RULING #3 pushed: GRANTED preload/bridge glue + houseRules/memory.ts date-label fix (2 files+test); CI failures with exact log evidence: windows = core-engine-switch race (len 2 vs 3 → deterministic await/quiescence), linux = SMOKE BLANK (renderer boots blank on CI — boot regression vs a6c7807, their glue suspected). Fix both.
- 0bd5478b: renderer-check step HUNG 19min (no timeout) → RULING #3: timeout-minutes 10 + bounded readiness. default-view finding accepted. Newer tip CI pending.
- d3c1ee25: "Actual renderer checks" fails BOTH OS → RULING #3: fix as lane tooling, don't disable; stale-count law reminder.
- VERDICT BOARD: ea5c07b0 ✓ on-track · 81a07155 ✓ done · 9a3a5c88 ✓ on-track · 6d6aabbf ✓ quiet-ok · 495d260c ✓ excellent · 0bd5478b ⚠ fix-hang · d3c1ee25 ⚠ fix-step · 9781cd95 ⚠ 2 CI fixes (best reporter).
- MERGE INTEL (scanner): 9a3a5c88 = separable lane (6-13 file overlap) → merges FIRST after owner's UI pick; other 6 UI-heavy branches = pick one, cherry-pick rest.

## 13. SWEEP #4 ("next" #2) — two verdicts pushed, one fix verified, one hang caught live
- 0bd5478b: watchdog commit f263eea judged LIVE: windows whole-job SUCCESS (7min); linux QA step blew past its own 8-min watchdog (12.7+ min, no fire, no output) → RULING #4 pushed: yaml timeout-minutes:12 + breadcrumbs to an always()-uploaded FILE (stdout buffering ate evidence twice) + per-phase deadlines. Windows green proves the QA chain itself sound.
- ea5c07b0: completed phase-3 lifecycle (38da620), filed question per channel, correctly resting. RULING #3 (acceptance) pushed: LANE COMPLETE, rest. linux success; windows red = inherited media-worker only (merge-time kill list).
- 9781cd95: responded to Ruling #3 fast — bd36e2c "smoke waits for painted window + deterministic engine-switch test on both platforms". CI in_progress at sweep end → verify next sweep.
- d3c1ee25: no movement since Ruling #3 (owner paste pending in that window, presumably).
- 6d6aabbf/9a3a5c88/495d260c/81a07155: unchanged (quiet/working/scanning/done-resting).
- VERDICT BOARD: ea5c07b0 ✓DONE(+rest) · 81a07155 ✓DONE · 9a3a5c88 ✓ · 495d260c ✓ · 6d6aabbf ✓quiet · 9781cd95 ⚠fixes-in (verify) · 0bd5478b ⚠linux-hang (ruling #4 in) · d3c1ee25 ⚠awaiting-obedience.
- MERGE PICTURE: done lanes = stores(ea5c07b0) + voice(81a07155); near-done = AV(9a3a5c88, separable, merges first); pending = core(9781cd95) + docs(6d6aabbf) + QA evidence(0bd5478b) + verify(d3c1ee25) + owner's UI(cc83a507).

## 14. SWEEP #5 ("next" #3) — retraction accepted, contract issued, core lane GREEN
- 9781cd95: CI SUCCESS both OS (smoke-paint + deterministic switch test) — VERIFIED. R#4: date-label fix cash + lane-complete report next.
- 9a3a5c88: filed Q1 (registry contract; correctly refused to invent one). R#4 issued: NO main-process registry (renderer APIs); contract at attachment boundary — door(6d6aabbf) owns dispatch+types.ts {id,kind,bytes-ref,decode-result|named-refusal}; AV lane owns decoders; integration = one seam (door calls decoder modules, prints their refusals verbatim); current boundary = approved fallback until door lands.
- 6d6aabbf: R#4 door-owner side + attachments.ts split proposal duty + documents/pdfPages handover stands; houseRules/memory.ts date bug stays 9781cd95's.
- 495d260c scan #3: RETRACTED its own stale-count finding WITH PROOF (runner counts top-level tests/*.test.* only; all branches' counts match their runs) → fleet law restated fleet-wide: "print what the run printed"; my R#3 accusation of d3c1ee25 WITHDRAWN (apology pushed to them).
- 0bd5478b: no new push yet (R#4 in their brief awaiting pickup). ea5c07b0: resting, tip = my acceptance. d3c1ee25: STILL no acknowledgment of any ruling — replacement warning issued in R#4.
- CI at sweep: 9781cd95 ✓ 9a3a5c88 ✓ 495d260c ✓✓ — every checked branch green.
- VERDICT BOARD: DONE ea5c07b0+81a07155 · GREEN/working 9a3a5c88+9781cd95+495d260c · pending-pickup 0bd5478b+6d6aabbf · ⚠LAST-WARNING d3c1ee25 · owner's cc83a507 untouched.
