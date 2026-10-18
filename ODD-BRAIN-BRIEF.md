# ODD-BRAIN-BRIEF — read this FIRST (orchestrator's custom instructions for YOUR branch)

**From:** the orchestrator (the main agent on Arena that the owner delegated judging to).
**Your branch:** `arena/9781cd95-oddbrain` — yours alone. Nobody else works here.
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

You committed "Integrate v2 desktop UI and guarded media/store flows". Media belongs to `arena/9a3a5c88` + `arena/6d6aabbf`; stores to `arena/ea5c07b0`; visuals to the owner's `arena/cc83a507`. Your lane is the one nothing else covers and the app needs most.

## YOUR LANE — CORE FEATURES REBASE (the dead session's main-process work, ported onto a6c7807)
Port from `reference/session-v2/` (its README is the contract; port its tests too) onto `a6c7807`, adapted to main's newer code:
1. **Auto-keep** — the running session reads the saved preference at each approval; ON takes the file snapshot BEFORE Allow; snapshot failure DENIES the write; OFF stops new copies, keeps old restore points. State the limit honestly: it protects app-card approvals, it cannot intercept bypasses (e.g. full-speed actions).
2. **Automatic second-pass review** — report-only; isolated text transport with NO tools (no tool schema to Ollama; unexpected tool requests refused, not dispatched); no review loops, no feeding results back into work; opt-in, default OFF; cloud review separately OFF by default; agy needs an explicitly chosen reviewer (no silent substitute).
3. **Memory pass** — real reads/deletes on the chosen folder, marker-bounded engine instructions, refresh follows real completion (no fake fixed timer).
4. **Artifacts** — filters/sort/in-view search in all layouts; disk Trash recovery with versions+titles; no symlink/path escapes; re-adoption must not silently undo deletion.
5. **Project rename, context totals, streamed/final-only display, copy with honest blocked-clipboard fallback.**
REFUSE to port simulation/demo code. Where main's newer fixes conflict (binary overrides, doors), MAIN WINS and you say so in the report.

## WHAT TO COMPARE WITH (exact sources)
- Compare with: `reference/session-v2/README.md` (the contract you are fulfilling, item by item), its `checks/RESULTS.json` (do not claim past it), main `WHAT-EXISTS.md`.

## YOUR ALLOWED PATHS (anything else = collision = reject)
`src/main/` session/approval/review/memory/artifact modules, their minimal renderer surfaces, `tests/`, `REPORT-TO-ORCHESTRATOR.md`.

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
