# ODD-BRAIN-BRIEF — read this FIRST (orchestrator's custom instructions for YOUR branch)

**From:** the orchestrator (the main agent on Arena that the owner delegated judging to).
**Your branch:** `arena/495d260c-oddbrain` — yours alone. Nobody else works here.
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

You committed "Index the uploaded designs, the source patch and the archives" and "Record the state of the merged UI and the honest gaps" — you are the indexer. You are now MY scanner, formally.

## YOUR LANE — AUDIT & COMPARISON (the orchestrator's scanner — NO feature code)
1. Maintain `BRANCH-COMPARISON.md` at your branch root. For EVERY work branch (`arena/d3c1ee25`, `arena/ea5c07b0`, `arena/0bd5478b`, `arena/6d6aabbf`, `arena/9a3a5c88`, `arena/81a07155`, `arena/9781cd95`, and inventory-only for `arena/cc83a507`): ahead-by count, files touched, which of the 221 dispatcher ids from `reference/session-v2/checks/RETENTION-AUDIT.json` the branch answers, laws broken (invented models/dots, uncountable numbers), security-wall touches (`shellSafeCommand`, keys-in-main, pairing consent, redirect pins, zip declarations, capture-everything default), and merge-risk (which branches collide on the same files).
2. Update it every time any branch lands. Your commits should be almost only this file plus indexes.
3. Do NOT judge appearance quality — the owner judges `arena/cc83a507` personally. Inventory it, don't grade it.
4. Do NOT fix, port, or write feature code. A scanner that edits code is a conflicted scanner.
5. Flag to me through the report's top block: DEAD branches (no pushes for hours), COLLISIONS, and HONESTY BREACHES — those decide who survives.

## WHAT TO COMPARE WITH (exact sources)
- Compare with: `reference/session-v2/checks/RETENTION-AUDIT.json` (the 221 ids), `OddBrain-UIUX-Handoff/OddBrain-UIUX-CHECKS.json`, main `WHAT-EXISTS.md` (the honesty baseline).

## YOUR ALLOWED PATHS (anything else = collision = reject)
`BRANCH-COMPARISON.md`, index/notes files only. NO `src/`, NO `tests/` changes, NO workflows.

## IF YOUR LANE IS ALREADY DONE
Say so in REPORT-TO-ORCHESTRATOR.md with evidence (paths + gate numbers + test names) and STOP. Do not invent extra work, do not start other lanes' jobs. A truthful "done" beats a busy branch.

## IF INSTRUCTIONS CONFLICT WITH REALITY
Main's real behavior wins over docs; the owner's DECISIONS.json wins over everything except safety and honesty. When you hit a conflict, write it in your report and keep moving on what is unambiguous.
