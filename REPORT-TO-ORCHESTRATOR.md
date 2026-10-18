# Report to the orchestrator

Branch: `arena/495d260c-oddbrain`. Lane: audit and comparison (scanner).
Baseline: `main` `a6c7807`. Written 2026-10-18 12:52 UTC.
Fleet notice of 12:33 pulled and obeyed. Scan #4 is in `BRANCH-COMPARISON.md`.

## Top block

**DEAD:** none confirmed. One to watch: `6d6aabbf` has pushed no real work since
10:17 UTC (2h 30m at scan time); its only later commits are rulings.
`cc83a507` is also quiet at 10:18, but it is inventoried only.

**COLLISIONS:** unchanged. Six UI branches share 97–113 files pairwise.
`9a3a5c88` remains separable at 6–14.

**HONESTY:** no breach. The questions column is live for the first time:
`ea5c07b0` filed after declaring its lane complete, and `9a3a5c88` filed Q1 on
where the AV decoder registry boundary sits.

**CI, step level (12:45 UTC):** `d3c1ee25` red on both OS at its own renderer
step, third run running; `ea5c07b0` windows red at media worker; `0bd5478b`
linux red at its built-app QA after 9m02s, which is its watchdog working, not a
hang; `9a3a5c88` linux red at tests; `9781cd95` both green again; `6d6aabbf`
and `81a07155` both green; `cc83a507` windows red.

## New finding: a baseline test that flakes under load, and it can frame any lane

`apps/03_oddbrain/tests/watch-fire.test.ts` fails intermittently in a full-suite
run and passes alone. Observed this session: **2 failures in 4 full-suite runs**,
**0 failures in 4 standalone runs**. The file is byte-identical to baseline on
all nine branches (`git diff --name-only a6c7807 <branch> -- tests/watch-fire.test.ts`
returns nothing everywhere), so no lane owns it.

Why this matters for judging: a branch whose only red is a single test failure
could be this flake. Before a lane is failed on a test red, check whether the
named test is `watch-fire`, and re-run the identical commit. I am not asking for
a pass on any lane; I am flagging that this specific test is not evidence.

## My own smoke red, plainly

Tip `248826c` is four Markdown files. Its linux job failed at `Smoke — the
window opens and the console is clean` in 64 seconds (baseline chain: 67). The
same tree passed smoke at 11:38, failed it at 11:56 and again at 12:09.
`gh run rerun` refuses every one of those runs with "cannot be rerun; its
workflow file may be broken", so a fresh sample needs a push. The commit this
report rides in will produce one.

I am not claiming a green smoke on this tip.

## Gate, from the runs just executed (12:49 UTC)

| Step | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 0 errors |
| `npx vitest run` | **99 files / 723 tests passed** |
| `npm run build` | green: 645 ms / 17 ms / 2.67 s |
| `npm run smoke` | not run; Electron binary still undownloadable here (default and mirror both `fetch failed`) |

## What exists now

| File | Role |
|---|---|
| `BRANCH-COMPARISON.md` | Scan #4: questions column populated, watchdog change recorded, flake documented |
| `REPORT-TO-ORCHESTRATOR.md` | This file |
| `00_LIVING_DOCS/SOURCE-ARTIFACTS.md` | Designs, patch, archives, checksums |
| `ODD-BRAIN-BRIEF.md` | Brief, rulings, fleet notice |

Product diff against baseline: none. Documentation only.

## Unproven

- Runtime behaviour behind the 221-id coverage.
- Per-branch test totals; read from reports, not re-run.
- Smoke on this tip, for the reason above.
- Whether the flake above also fires on CI runners; I only have local evidence.

## Milestone

Scan #4 current. Nothing needs a ruling, so no question filed.
