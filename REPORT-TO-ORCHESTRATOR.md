# Report to the orchestrator

Branch: `arena/495d260c-oddbrain`. Lane: audit and comparison (scanner).
Baseline: `main` `a6c7807`. Written 2026-10-18 12:30 UTC.
Scan #3 in `BRANCH-COMPARISON.md`.

## Correction first: my stale-count finding was wrong

You adopted it as fleet law, and ruling #3 repeats it on other branches. Please
read this before it costs a lane.

I counted test files at any depth. The runner counts only
`tests/*.test.{js,cjs,ts}`; `tests/pending/` never runs. Baseline shows the
mistake: 102 files on disk at all depths, 99 run, vitest prints **99 files /
723 tests**.

Recounted correctly:

| Branch | Its claim | Top-level files | Verdict |
|---|---|---|---|
| `d3c1ee25` | 114 / 807 | 114 | matches |
| `ea5c07b0` | 117 / 807 | 118 | one test added after the count |
| `0bd5478b` | 114 / 808 | 115 | one added after |
| `6d6aabbf` | 113 / 815 | 113 | matches |
| `9a3a5c88` | 104 / 749 | 104 | matches |
| `81a07155` | 112 / 797 | 112 | matches |

**No branch's number contradicts its own run.** The ruling's "your notice says
114/807 while the tree carries 117 files" compares a run output to a file
listing that includes three unrun files. The rule "print what the run printed"
is still right; the evidence I gave for it was not.

## Top block

**DEAD:** none. All work branches pushed within 30 minutes of the scan.
`cc83a507` at 10:18 UTC, inventory only.

**COLLISIONS:** unchanged. Six UI branches share 97–113 files pairwise.
`9a3a5c88` stays separable at 6–14.

**HONESTY:** no breach found. The one flag I raised is retracted above.

**CI, step level:** `d3c1ee25` fails its own `Actual renderer checks` on both OS
(`Renderer server did not become ready`, `verify-renderer.cjs:29`);
`ea5c07b0` fails windows at `Built media worker`; `9781cd95` moved from linux
smoke red to windows tests red; `cc83a507` windows tests red; `0bd5478b`'s linux
job has run 8+ minutes against a 67-second baseline chain.

**New evidence on the renderer step:** I ran `d3c1ee25`'s `verify-renderer.cjs`
against a local tree. The readiness wait passed and the script entered
`check-ui.cjs`. Vite 6.4.4 and Vite 7.3.7 both print
`Local: http://localhost:<port>/` under `--host 0.0.0.0`, so the matcher is not
version-sensitive. The failure is environmental in that job; its own
`renderer-server.log` artifact would name it, and I cannot download artifacts
from this sandbox.

## Gate, from the run just executed (12:25 UTC)

| Step | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 0 errors |
| `npx vitest run` | **99 files / 723 tests passed** |
| `npm run build` | green: 720 ms / 21 ms / 2.85 s |
| `npm run smoke` | not run. Electron install failed twice this session, default host and the mirror tip. |

No flake this run; the suite was clean on the first attempt.

## CI on this branch

`4143830` carries 4/4 successful jobs. The tip is unchanged since the last
report; nothing new was pushed before this one.

## What exists now

| File | Role |
|---|---|
| `BRANCH-COMPARISON.md` | Scan #3, with the correction at the top and the runner-scoped counting rule in Method |
| `REPORT-TO-ORCHESTRATOR.md` | This file |
| `00_LIVING_DOCS/SOURCE-ARTIFACTS.md` | Designs, patch, archives, checksums |
| `ODD-BRAIN-BRIEF.md` | Brief and rulings |

Product diff against baseline: none. Documentation only.

## Unproven

- Runtime behaviour behind the 221-id coverage; no branch was executed.
- Per-branch test totals; they are read from reports, not re-run.
- `0bd5478b`'s linux job, still running at scan time.
- Smoke here, for the download reason above.

## Question for the ruling

None that blocks the scan. The correction above is the thing that needs your
action; it is a retraction of my own finding, not a request.

## Milestone

Scan #3 is current, the two columns are maintained, and the correction is
committed with the evidence. Stopping here.
