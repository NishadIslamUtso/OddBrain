# Branch comparison

Scanner: `arena/495d260c-oddbrain`. Baseline: `main` `a6c7807`.
Scan #3, 2026-10-18 12:25 UTC. Supersedes the 12:10 scan.

## CORRECTION — retract the stale-count finding

**My previous scan was wrong, and it was adopted as fleet law. Retract it.**

I counted "test files in the tree" as every `.test.ts` or `.test.js` file at any
depth. The runner is narrower: `apps/03_oddbrain/vitest.config.ts` sets

```
include: ['tests/*.test.{js,cjs,ts}']
```

and `tests/pending/` holds tests whose subject is not ported. They never run and
never count. Baseline proves the error: 102 test files exist at all depths, 99
run, and vitest reports **99 files / 723 tests**.

Recounted the way the runner counts, top-level only:

| Branch | Claimed (from its own run) | Top-level test files | Verdict |
|---|---|---|---|
| `d3c1ee25` | 114 files / 807 tests | 114 | matches |
| `ea5c07b0` | 117 / 807 | 118 | one test added after the count was written |
| `0bd5478b` | 114 / 808 | 115 | one added after |
| `6d6aabbf` | 113 / 815 | 113 | matches |
| `9a3a5c88` | 104 / 749 | 104 | matches |
| `81a07155` | 112 / 797 | 112 | matches |
| `9781cd95` | quotes baseline 99 / 723 | 117 | no own claim in its docs |
| `cc83a507` | no number stated | 117 | nothing to check |

**No branch's stated count contradicts its own run output.** The two off-by-one
cases are what adding a test after writing a number looks like, and cannot be
called dishonesty. The fleet law built on this finding should be withdrawn or
restated as: *print what the run printed, not what a file listing implies.*
That rule is sound on its own; the evidence I gave for it was not.

## Top block

**DEAD:** none. Every work branch pushed inside the last 30 minutes except
`cc83a507` (10:18 UTC, inventory only).

**COLLISIONS:** unchanged. Six UI branches overlap 97–113 files pairwise.
`9a3a5c88` remains separable at 6–14 shared files with any branch.

**CI STATE (step-level, from the check-runs and job APIs):**

| Branch | CI | Failing step |
|---|---|---|
| `d3c1ee25` | linux fail, windows fail | `Actual renderer checks` on both. Annotation: `Renderer server did not become ready` at `scripts/verify-renderer.cjs:29` |
| `ea5c07b0` | linux pass, windows fail | `Built media worker` |
| `0bd5478b` | windows pass, linux running long | started 12:18:17, still running at 12:25 (baseline linux chain: 67 s) |
| `6d6aabbf` | both pass | none |
| `9a3a5c88` | both pass | none |
| `81a07155` | both pass | none |
| `9781cd95` | linux pass, windows fail | `Tests` (was linux `Smoke` at the last scan; the failure moved) |
| `cc83a507` | linux pass, windows fail | `Tests` |

**On `d3c1ee25`'s renderer step, a reproduction that narrows it:** I ran its
`verify-renderer.cjs` against this sandbox's tree. The readiness wait passed and
the script proceeded into `check-ui.cjs`. I also confirmed that both Vite 6.4.4
and Vite 7.3.7 print `Local: http://localhost:<port>/` when started with
`--host 0.0.0.0`, so the `localhost:<port>` match in that script is not
version-sensitive. The failure is therefore environmental in that branch's CI
job, not the matcher itself: either Vite never starts (config/dependency load
after `npm ci --ignore-scripts`) or the port is held. The branch's own
`renderer-server.log` artifact would settle it; this sandbox cannot download
artifacts (the blob host is unreachable), so the branch must read its own log.

## Status at the scanned commit

| Branch | Tip | Ahead | Changed files | Lines | Brief commit | Questions filed | Last work commit (UTC) | Report file |
|---|---|---|---|---|---|---|---|---|
| `arena/d3c1ee25` | `5542bc0` | 9 | 154 | +9351 / −2577 | yes | no | 12:18 (ruling) | yes |
| `arena/ea5c07b0` | `38da620` | 8 | 144 | +8578 / −1486 | yes | no | 12:01 | yes |
| `arena/0bd5478b` | `d5dacaa` | 17 | 115 | +9062 / −1295 | yes | no | 12:18 (ruling) | no |
| `arena/6d6aabbf` | `445eb4d` | 8 | 105 | +7588 / −1187 | yes | no | 10:17 | no |
| `arena/9a3a5c88` | `04742ad` | 10 | 30 | +2730 / −142 | yes | no | 12:02 | yes |
| `arena/81a07155` | `8c2a049` | 8 | 202 | +8365 / −1676 | yes | no | 11:59 | yes |
| `arena/9781cd95` | `b6e4e1d` | 6 | 132 | +9787 / −1609 | yes | no | 12:18 (ruling) | yes |
| `arena/cc83a507` | `01b1237` | 1 | 146 | +8780 / −3789 | **no** | no | 10:18 | no |
| `arena/495d260c` (this) | `4143830` | 12 | 4 docs | +473 | yes | no | 12:09 | yes |

No branch has filed `QUESTIONS-TO-ORCHESTRATOR.md`. The column stays empty for
all nine.

## Dispatcher coverage (221 ids)

Method unchanged: every `nativeSources` entry for a row must exist under
`apps/03_oddbrain/src/renderer/src/`.

| Branch | Ids answered | Beyond baseline |
|---|---|---|
| baseline `a6c7807` | 99 / 221 | 0 |
| `d3c1ee25` | 221 / 221 | 122 |
| `ea5c07b0` | 221 / 221 | 122 |
| `0bd5478b` | 221 / 221 | 122 |
| `6d6aabbf` | 221 / 221 | 122 |
| `81a07155` | 221 / 221 | 122 |
| `9781cd95` | 221 / 221 | 122 |
| `cc83a507` | 221 / 221 | 122 |
| `9a3a5c88` | 99 / 221 | 0 |
| `495d260c` | 99 / 221 | 0 |

Third run, identical result: the 122-id set is the same on all seven, so
coverage cannot rank them. The breakdown:

look-lab 24, chat-composer 15, menus-setup 14, context-tools 13, appearance 13,
navigation 12, layout-exploration 7, scene-gallery 6, rules-permissions 5,
exports 5, checkpoints 4, journal-review 2, clipboard 1, not-applicable-mobile 1.

## Capability matrix

File counts from `git grep -l` over `apps/03_oddbrain/src`.

| Capability | d3c1 | ea5c | 0bd5 | 6d6a | 9a3a | 81a0 | 9781 | cc83 |
|---|---|---|---|---|---|---|---|---|
| marketplace references (files) | 8 | 12 | 7 | 2 | 1 | 3 | 8 | 7 |
| dictation through `MediaRecorder` | 1 | 1 | – | – | – | – | 1 | 1 |
| runtime downloader limits | – | – | 1 | 2 | – | 1 | 1 | 1 |
| 77 scenes / loader | 3 | 3 | 3 | 3 | 2 | 3 | 3 | 3 |
| looks and layouts catalogs | 4 | 4 | 4 | 4 | – | 4 | 4 | 4 |

`ea5c07b0` moved furthest on marketplaces this hour (12 files), and its latest
commit is about proving marketplace lifecycle through reused approval cards.
`d3c1ee25` and `ea5c07b0` still lack the runtime unpack limits, so the 1.47 GB
Ollama archive stays broken there.

## Security walls

`extension/` untouched everywhere. `shellSafeCommand`, pairing token,
`redirect: 'manual'`, zip declaration checks and keys-in-main all present on all
nine branches, in the same file ranges as last scan. No guard call was removed.
Workflow edits remain additive. New this scan: `0bd5478b` added a built-QA
watchdog in its own tooling; that is lane tooling, not a product gate change.

## Merge risk

Top overlaps: `d3c1ee25`×`ea5c07b0` 113, `d3c1ee25`×`cc83a507` 112,
`ea5c07b0`×`cc83a507` 111, `d3c1ee25`×`9781cd95` 108,
`ea5c07b0`×`9781cd95` 108, `d3c1ee25`×`81a07155` 107.

`9a3a5c88` against everything: 6, 7, 11, 13, 13, 13, 14. It is still the only
lane that merges cleanly on top of a chosen UI branch, and the only one whose
report declares itself NOT COMPLETE.

## Per-branch notes

- `arena/d3c1ee25` — its own gate JSON is green on both OS (ruling #2 read it
  from the log); the red is its added renderer step, failing before any check
  runs. Widest media surface.
- `arena/ea5c07b0` — marketplace work moving fastest; windows red at its own
  media-worker step.
- `arena/0bd5478b` — second consecutive linux job that outlives the baseline
  chain by an order of magnitude. State unknown, not failed.
- `arena/6d6aabbf` — both green, no marketplace module, no dictation, no push in
  two hours.
- `arena/9a3a5c88` — both green, narrow, honest about being incomplete.
- `arena/81a07155` — both green, declares its lane complete per ruling.
- `arena/9781cd95` — windows moved from green to red on tests; linux recovered
  from its smoke failure. Flip-flopping CI on unchanged scope is worth watching.
- `arena/cc83a507` — owner's track. No brief, no report, windows red. Inventory
  only.

## Method

```
git rev-list --count a6c7807..origin/arena/<id>-oddbrain
git diff --name-status a6c7807 origin/arena/<id>-oddbrain
git ls-tree -r --name-only <ref>            # coverage
git ls-tree -r --name-only <ref> -- apps/03_oddbrain/tests \
  | grep -E '^apps/03_oddbrain/tests/[^/]+\.test\.(js|cjs|ts)$'   # the runner's own scope
gh api repos/NishadIslamUtso/OddBrain/commits/<sha>/check-runs
gh api repos/NishadIslamUtso/OddBrain/actions/runs/<run>/jobs
gh api repos/NishadIslamUtso/OddBrain/check-runs/<id>/annotations
```

Counts quoted from a branch's docs are compared against the top-level listing
that matches `vitest.config.ts`, never the all-depths listing.

## What these numbers do not prove

- File presence is not behaviour. No branch was executed.
- A branch's own test totals are reproduced from its report, not re-run here.
- CI is a snapshot at 12:25 UTC.
- Artifact logs (the evidence that would settle `d3c1ee25`) cannot be downloaded
  from this sandbox; the blob host is unreachable.
