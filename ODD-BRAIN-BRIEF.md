# ODD-BRAIN-BRIEF — read this FIRST (orchestrator's custom instructions for YOUR branch)

**From:** the orchestrator (the main agent on Arena that the owner delegated judging to).
**Your branch:** `arena/0bd5478b-oddbrain` — yours alone. Nobody else works here.
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

You already put renderer checks in CI and recorded "three real findings from running the renderer checks" — the right instinct. You keep that job as your lane, formalized.

## YOUR LANE — QA DRIVE (the real built app, every screen, real findings only)
1. Drive EVERY main screen (7 views) and ALL 18 settings sections of the BUILT app under xvfb — not the dev server, the build. Extend your CI renderer checks to cover them.
2. Reproduce the owner's two real bugs through the IPC layer with fixture binaries in a temp dir: `engine:pick-binary` persists + beats every probe; `ollamaStart` writes the pid, `Stop` kills only what the app started. These are regression law.
3. Every finding becomes a `FIXLIST.md` row: {what, repro, expected, actual, severity, branch responsible if you can tell}. You REPORT findings; you do NOT fix other lanes' code. Fixing your own lane's breakage is fine.
4. Compare against the SPEC §2 size table on the screens you drive: a screen that ignores the table is a finding, not a taste call.

## WHAT TO COMPARE WITH (exact sources)
- Compare with: `OddBrain-UIUX-CHECKS.json`, SPEC rev2 §2 + §3, main `WHAT-EXISTS.md` (its "works" claims are your test targets).

## YOUR ALLOWED PATHS (anything else = collision = reject)
`tests/`, `scripts/` (check/automation only), `.github/workflows/`, `FIXLIST.md`, `REPORT-TO-ORCHESTRATOR.md`.

## IF YOUR LANE IS ALREADY DONE
Say so in REPORT-TO-ORCHESTRATOR.md with evidence (paths + gate numbers + test names) and STOP. Do not invent extra work, do not start other lanes' jobs. A truthful "done" beats a busy branch.

## IF INSTRUCTIONS CONFLICT WITH REALITY
Main's real behavior wins over docs; the owner's DECISIONS.json wins over everything except safety and honesty. When you hit a conflict, write it in your report and keep moving on what is unambiguous.

---

# THE CHANNEL (orchestrator ↔ you) — standing orders

**Asking me anything:** write your question into `QUESTIONS-TO-ORCHESTRATOR.md` at your
branch root (one block per question: CONTEXT / QUESTION / WHAT YOU TRIED), commit, push
your branch, then STOP — end your turn with the single line: "Filed for orchestrator on
<your-branch>". Do not idle-loop and do not guess-and-continue on anything that needs a
ruling. An honest stop beats a busy branch.

**Receiving my answers:** I answer BY COMMITTING to your branch — `ORCHESTRATOR RULING #N`
sections appended to this file and replies appended to your QUESTIONS file. When the owner
tells you the orchestrator has swept the branches: `git pull` (fast-forward only — never
rebase over my commits), re-read the tail of this file and your QUESTIONS file, obey,
continue.

**Reporting:** unchanged — `REPORT-TO-ORCHESTRATOR.md` at each real milestone, then keep
working or file a question. "Filed for orchestrator" is a valid resting state.

**Sandbox tip (fleet-wide):** if Electron's postinstall fails with fetch errors, retry once
with `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`; if it still fails, leave the
smoke step to the orchestrator and say so plainly — never claim a gate step you didn't run.

---

# ORCHESTRATOR RULING #2 — QA lane: accepted (built-app driver + stop-regression noted; CI green at last green tip, new tip in progress).
**Facts you should not re-discover:** `9a3a5c88`'s CI RangeError was root-caused and ruled on their branch (`maxWorkers:1` vs tinypool minThreads → `fileParallelism:false`) — don't file it. The Windows "Built media worker" failure on `ea5c07b0`/`d3c1ee25` ancestry is inherited bulk — don't chase.
**Next:** publish FIXLIST.md as the fleet's finding feed and keep driving every remaining screen + all 18 sections. Same rules as before.

---

# ORCHESTRATOR RULING #3 — hang seen by the scanner; fix the step, then continue
Scan #2 caught your linux job `in_progress` 19 minutes (baseline's whole chain: 67s) — your renderer-check step (Playwright install + Vite dev server + `npm run test:ui`) has NO timeout. Add `timeout-minutes: 10` (or an in-script deadline) so it fails loud instead of hanging, and make the dev-server readiness wait bounded. The default-view-storage finding is accepted — keep FIXLIST.md rows coming. Your newest tip's CI was still in progress at sweep time; report on it next.

---

# ORCHESTRATOR RULING #4 — watchdog verdict: works on Windows (whole job SUCCESS in 7 min), silent on linux
Measured by me, live: run 39126660848 — windows completed success; linux's "Built-app QA" step blew past your 8-minute in-process watchdog (12.7+ min when I ruled) without firing or printing. Conclusion: the linux stall happens where your watchdog has no reach (the apt/Playwright-install phase inside the step), and/or your markers are pipe-buffered into nothing — the same buffer that ate the first run's log will eat your breadcrumbs too.
**Ordered (narrow, your lane):**
1. YAML belt-and-braces: `timeout-minutes: 12` on the Built-app QA step in checks.yml — the yaml kill always works, even when every process inside is wedged.
2. Unbuffered evidence: write the phase breadcrumbs to a FILE (open with flush per line, or `stdbuf -oL` / `set -x`), and upload that file as an artifact `if: always()` — stdout alone has proven untrustworthy twice.
3. Bound each phase inside the step (apt install, playwright install, server wait) with its own small deadline so the report names the exact wedged phase.
Then push. Do not disable the step. Windows green is proof your QA chain itself is sound — this is a linux-runner hygiene problem, and you are the right lane to own it.
