# ODD-BRAIN-BRIEF — read this FIRST (orchestrator's custom instructions for YOUR branch)

**From:** the orchestrator (the main agent on Arena that the owner delegated judging to).
**Your branch:** `arena/9a3a5c88-oddbrain` — yours alone. Nobody else works here.
**Baseline:** main = v3 = `a6c7807` (CI 4/4 green, 99 test files / 723 tests). Rebasing on it is the only correct starting point.
**Owner's machine:** ASUS TUF A15, Ryzen 7, 8 GB RAM, 4 GB VRAM RTX 3050, Windows 11, 1920×1080 @ 125% (1536×864 logical). Windows PC only; min content 940×620; comfortable 1280×820 / 1440×900; clamp the window to the work area.

## THE MERGE LAW (the owner's order, verbatim intent)
You NEVER merge into main or v3. You NEVER push to any branch but your own. You never rebase main.
Merging happens ONLY when the orchestrator says so, after judging. Your branch tip IS your deliverable.

## LAWS (breaking any one = your branch is dead at judging)
1. **Honesty above all.** No invented model names (gemma4:cloud was a real bug the owner saw), no colored-dot lies — words, not dots. Every number on screen countable from records the user can see. A feature that does not exist gets one muted line, never a nav item, never a fake success.
2. Engines are EXACTLY `claude-code` + `agy`. Ollama is the local brain server, NOT an engine.
3. Extension capture-everything default stays ON. The in-app Ollama downloader stays benched (`winget install Ollama.Ollama` is the route); never reintroduce it.
4. Security walls must survive untouched: `shellSafeCommand`, keys stay in main, pairing consent, redirect pins, zip forged-declaration checks, permission approval cards.
5. Preserve main's newer fixes: engine binary overrides + "Point to the exe…", Ollama auto-start at boot, spawnImpl/pid-dir/PATH-shape fixes, design-systems loader, connectors doors.
6. No new fonts, no new cloud services, no microphone unless your lane says otherwise, no telemetry, no repo/README cleanup passes.
7. English only, blunt copy. No AI-slop phrasing (skills/no-ai-slop on `agent-resources` is the writing bar).
8. Every feature lands with a test that proves it. Numbers you print must be derived, never estimated.

## AUTHORITY DOCUMENTS (branch `agent-resources` — fetch that branch to read them; do not merge it)
- `OddBrain-UIUX-Handoff/OddBrain-UIUX-SPEC.md` — rev 2: behavior, retention, the exact size table (§2), acceptance.
- `OddBrain-UIUX-Handoff/OddBrain-UIUX-CHECKS.json` — the acceptance inventory (8 presets / 8 layouts / 9 palettes / 77 scenes / 18 settings).
- `workspace-notes/DECISIONS.json` — the owner's recorded scope answers. Obey verbatim.
- `reference/session-v2/` — real app code from the dead session (baseline `2f05dac`, STALE). REFERENCE MATERIAL ONLY: port piece by piece onto `a6c7807`, adapt to main's newer code, never bulk-apply, never port its simulation code.
- Main's `WHAT-EXISTS.md` — the honest state you must not regress.

## YOUR GATE (run exactly this, in this order, before you claim anything)
```
npm ci --ignore-scripts && node node_modules/electron/install.js
npx tsc --noEmit          # 0 errors
npx vitest run            # all green, count files/tests and print the numbers
npm run build
npm run smoke             # expect: SMOKE OK SCROLL OK errors=0 warnings=0
```
Then push your branch and make CI green on it.

## YOUR REPORT (due the moment your lane's milestone is real)
Commit `REPORT-TO-ORCHESTRATOR.md` at your branch root containing: what exists now (with file paths), the exact gate numbers (files/tests/errors), what you ported from session-v2 and what you refused to port and why, what is unproven, and any collision you see with other lanes. Never mark a milestone that the gate hasn't passed. Update the report every time you land more.

## SESSION HYGIENE (the last agent died of context bloat at "10/55 checks")
Commit early, commit often, push often. NEVER read the 1.7 MB HTML files whole — extract the sections/tokens you need. Keep replies short. Do not re-ingest the same docs twice.

## HOW YOU WILL BE JUDGED (pass/fail, no vibes)
1. Gate green on your tip; CI green on your branch; smoke errors=0.
2. Lane deliverables exist and are proven by tests — judged against the lane's "compare with" below.
3. Honesty audit clean (no invented state, countable numbers).
4. You touched ONLY your lane's paths (list below). Anything else = collision = reject.
5. REPORT-TO-ORCHESTRATOR.md present, truthful, current.
6. Merge law respected. One whisper about merging and you're out.

---

# YOUR ASSIGNMENT

You committed "Add safe media and audio attachments" — that is your lane. Here are its hard edges and its neighbor.

## YOUR LANE — AUDIO / VIDEO / IMAGE INTAKE
1. Decode audio, video and images for attachments and previews. No microphone anywhere (DECISIONS.json — voice is parked except the dictation lane, which is not yours).
2. Provider capability gate: if the chosen model cannot take this media, the composer says so BEFORE send; it never silently switches providers. If local extraction can't produce useful content, the app explains the limit — never a false "read successfully".
3. This is an 8 GB RAM / 4 GB VRAM machine: decode work must respect the Performance pane's inference-size honesty; show real sizes, never invented ones.
4. `arena/6d6aabbf` owns the intake door and document decoders; you plug AV decoders into their registry. If the registry isn't there yet, build behind your own module boundary and name the integration point in your report — do not build a second door.

## WHAT TO COMPARE WITH (exact sources)
- Compare with: `workspace-notes/DECISIONS.json` `media` block verbatim (your contract), SPEC rev2 §2 (sizes) and §3 (status shown in words, no dots).

## YOUR ALLOWED PATHS (anything else = collision = reject)
`src/main/` media/decode modules (AV), composer AV attachment logic (functional only), `tests/`, `REPORT-TO-ORCHESTRATOR.md`.

## IF YOUR LANE IS ALREADY DONE
Say so in REPORT-TO-ORCHESTRATOR.md with evidence (paths + gate numbers + test names) and STOP. Do not invent extra work, do not start other lanes' jobs. A truthful "done" beats a busy branch.

## IF INSTRUCTIONS CONFLICT WITH REALITY
Main's real behavior wins over docs; the owner's DECISIONS.json wins over everything except safety and honesty. When you hit a conflict, write it in your report and keep moving on what is unambiguous.

---

# ORCHESTRATOR RULING #1 — CI root cause found by me; your branch is healthier than CI says

I pulled your tip `a5b29ab`, downloaded the CI logs you couldn't, and reproduced your whole
gate on my machine: tsc 0 · 103 files / 744 passed (exact match with your numbers) · build
clean · **SMOKE OK SCROLL OK errors=0 warnings=0** — the smoke your sandbox could not run is
CLOSED on my machine.

**Why CI fails at Tests on BOTH operating systems while your local run passes:**
vitest crashes before running a single test — `RangeError: options.minThreads and
options.maxThreads must not conflict` (tinypool). Your config's `maxWorkers: 1` caps the
pool at 1 thread while vitest's default `minThreads` scales with CPU count: CI runners have
4 vCPUs → min 2 > max 1 → crash; your sandbox (2 vCPUs) → min 1 ≤ max 1 → runs fine.
Evidence: run 39123693424, step 6_Tests.txt, "Unhandled Error … Test Files no tests".

**AUTHORIZED (narrow):** in `apps/03_oddbrain/vitest.config.ts` replace `maxWorkers: 1`
with `fileParallelism: false` — vitest's supported serial knob, no thread math. Keep the
comment above it, updated. Touch NOTHING else in that file.

**Verdicts on your report:**
1. Pre-brief commit `c17cf31` ancestry: KEPT — you disclosed it correctly. From now on NEW
   edits only in your lane's AV paths. The out-of-lane files c17cf31 already touched
   (documents.ts, pdfPages.ts, Composer's dictation line, windowBounds.ts, state/engine.ts,
   ollama.ts, providers.ts, shared/types.ts) are FROZEN for you — no further edits; I
   reconcile them at merge (documents/pdfPages → the document-intake lane; dictation → the
   voice lane). List them in your next report under "frozen, awaiting merge".
2. Intake registry: correct call. Keep decoders behind your own module boundary, name the
   integration point, build no second door. Cross-lane coordination goes through me.
3. CI: apply the one-line fix and push — Linux should go green. If a Windows
   "Built media worker" step fails after that, that step is inherited bulk ancestry from
   before the lane assignment: do NOT chase it, file it as one question line instead.
Then continue your lane: per-model capability honesty, 8 GB/4 GB sizing honesty, AV only.
