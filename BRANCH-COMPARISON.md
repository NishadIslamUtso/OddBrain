# Branch comparison

Scanner: `arena/495d260c-oddbrain`. Baseline: `main` `a6c7807`.
Scan #4, 2026-10-18 12:45 UTC. Supersedes scan #3 (12:25).

Counting rule, settled after scan #3's retraction: the runner's scope is
`tests/*.test.{js,cjs,ts}` only (`vitest.config.ts`). Compare a branch's printed
count to that listing; never to an all-depth file count. `tests/pending/` never
runs.

## Top block

**DEAD:** none confirmed, one to watch.
`6d6aabbf` has not pushed real work since 10:17 UTC (2h 28m). Its only later
commits are orchestrator rulings. `cc83a507` is at 10:18 UTC (2h 27m) and is
inventoried only, so its silence is expected. Everything else pushed within the
last 20 minutes.

**COLLISIONS:** unchanged. Six UI branches share 97–113 files pairwise.
`9a3a5c88` remains separable at 6–14 shared files with any branch.

**HONESTY:** no breach. Two branches filed questions this hour, which is the
channel working:
- `ea5c07b0` filed `QUESTIONS-TO-ORCHESTRATOR.md`, awaiting a ruling after
  declaring its marketplace lane complete.
- `9a3a5c88` filed Q1, asking where the AV decoder registry boundary sits.

**The fleet notice of 12:33 accepted the scan #3 retraction.** Nothing further
is owed on that finding.

**CI, step level:**

| Branch | linux | windows | Failing step / note |
|---|---|---|---|
| `d3c1ee25` | fail | fail | `Actual renderer checks` on both, third run in a row |
| `ea5c07b0` | pass | fail | `Built media worker` |
| `0bd5478b` | fail | pass | `Built-app QA — every screen, every section, real IPC` after 9m02s. **No longer a hang**: its watchdog fired and the job failed loudly, which is what it was built to do |
| `6d6aabbf` | pass | pass | — |
| `9a3a5c88` | fail | pass | `Tests` (was both green at scan #3) |
| `81a07155` | pass | pass | — |
| `9781cd95` | pass | pass | recovered from windows tests red |
| `cc83a507` | pass | fail | `Tests`, unchanged since 10:18 |
| `495d260c` (this) | fail | pass | `Smoke` step on a docs-only diff; same intermittent as earlier tips. Details below |

**`0bd5478b` changed shape this half hour, and for the better.** Last scan I
reported its linux job "hanging" for 19+ minutes. This run it finished in
9m02s, failing at its own built-app QA step with evidence uploaded. A watchdog
that turns a silent hang into a named failure is the right fix, and it is now
doing that.

## Status at the scanned commit

| Branch | Tip | Ahead | Changed files | Lines | Brief commit | Questions filed | Top-level test files | Last work commit (UTC) | Report file |
|---|---|---|---|---|---|---|---|---|---|
| `arena/d3c1ee25` | `722ce61` | 10 | 154 | +9364 / −2577 | yes | no | 114 | 11:46 | yes |
| `arena/ea5c07b0` | `9b6031c` | 12 | 145 | +8603 / −1486 | yes | **yes** | 118 | 12:27 | yes |
| `arena/0bd5478b` | `541c462` | 21 | 117 | +9139 / −1295 | yes | no | 115 | 12:33 | yes |
| `arena/6d6aabbf` | `4a40d7e` | 9 | 105 | +7604 / −1187 | yes | no | 113 | 10:17 | no |
| `arena/9a3a5c88` | `4a459e3` | 12 | 31 | +2758 / −142 | yes | **yes** | 104 | 12:22 | yes |
| `arena/81a07155` | `9aef056` | 9 | 202 | +8371 / −1676 | yes | no | 112 | 11:59 | yes |
| `arena/9781cd95` | `d99dad7` | 9 | 133 | +9863 / −1615 | yes | no | 117 | 12:31 | yes |
| `arena/cc83a507` | `01b1237` | 1 | 146 | +8780 / −3789 | **no** | no | 117 | 10:18 | no |
| `arena/495d260c` (this) | `248826c` | 14 | 4 docs | +457 | yes | no | 99 | 12:26 | yes |

## Dispatcher coverage (221 ids)

Unchanged from scans #2 and #3. Every `nativeSources` entry for a row must
exist under `apps/03_oddbrain/src/renderer/src/`.

| Branch | Ids answered | Beyond baseline |
|---|---|---|
| baseline `a6c7807` | 99 / 221 | 0 |
| `d3c1ee25`, `ea5c07b0`, `0bd5478b`, `6d6aabbf`, `81a07155`, `9781cd95`, `cc83a507` | 221 / 221 | 122 each |
| `9a3a5c88`, `495d260c` | 99 / 221 | 0 |

The 122-id set is identical on all seven, three scans running. Breakdown:
look-lab 24, chat-composer 15, menus-setup 14, context-tools 13, appearance 13,
navigation 12, layout-exploration 7, scene-gallery 6, rules-permissions 5,
exports 5, checkpoints 4, journal-review 2, clipboard 1, not-applicable-mobile 1.

Coverage separates the seven from the narrow lanes. It cannot rank the seven.

## Capability matrix

| Capability | d3c1 | ea5c | 0bd5 | 6d6a | 9a3a | 81a0 | 9781 | cc83 |
|---|---|---|---|---|---|---|---|---|
| marketplace references (files) | 8 | 12 | 7 | 2 | 1 | 3 | 8 | 7 |
| dictation through `MediaRecorder` | 1 | 1 | – | – | – | – | 1 | 1 |
| runtime downloader limits | – | – | 1 | 2 | – | 1 | 1 | 1 |

`d3c1ee25` and `ea5c07b0` still carry pack-sized unpack limits, so the 1.47 GB
Ollama archive stays broken there. Unchanged across four scans.

## Security walls

`extension/` untouched on all nine. `shellSafeCommand`, pairing token,
`redirect: 'manual'`, zip declaration checks and keys-in-main all present, in
the same file ranges as scans #1–3. No guard call removed. Workflow edits remain
additive; `0bd5478b`'s new QA watchdog is lane tooling and now reports failure
instead of hanging.

## Merge risk

Top overlaps: `d3c1ee25`×`ea5c07b0` 113, `d3c1ee25`×`cc83a507` 112,
`ea5c07b0`×`cc83a507` 111, `d3c1ee25`×`9781cd95` 108,
`ea5c07b0`×`9781cd95` 108.

`9a3a5c88` against everything: 6, 8, 11, 13, 13, 14, 14. Still the only lane
that merges cleanly on top of a chosen UI branch.

## Per-branch notes

- `arena/d3c1ee25` — its renderer step has failed every run since it landed.
  Its own gate JSON is green on both OS per ruling #2, so the step, not the app,
  is the problem. Third consecutive red; this needs the branch's own
  `renderer-server.log`, which names the cause.
- `arena/ea5c07b0` — declared its marketplace lane complete and filed a
  question. Windows red at its own media-worker step remains.
- `arena/0bd5478b` — most active branch (21 commits ahead). QA watchdog now
  turns hangs into named failures with evidence. Its built-app QA fails, so its
  own gate does not pass.
- `arena/6d6aabbf` — both green, no marketplace module, no dictation, quiet for
  2.5 hours. Watch for staleness.
- `arena/9a3a5c88` — filed its registry question and went linux red at `Tests`
  in the same hour. Narrow lane, honest report.
- `arena/81a07155` — both green, declares its lane complete.
- `arena/9781cd95` — both green again, the only branch to fully recover from a
  red across scans.
- `arena/cc83a507` — owner's track, no brief or report, windows red. Inventory
  only.

## The `495d260c` smoke failure, plainly

My tip `248826c` is four Markdown files. Its linux job failed at step 9,
`Smoke — the window opens and the console is clean`, and finished in 64
seconds (baseline: 67). The same tree failed smoke at 11:56 and 12:09, then
passed at 11:38 on identical source. `gh run rerun` refuses all three with
"cannot be rerun; its workflow file may be broken", so the only way to get a
fresh sample is another push.

I am not claiming a green smoke on this tip. What I can say is that the diff
contains no executable line, and that three runs of one tree produced two
different step failures and one pass.

## Method

```
git rev-list --count a6c7807..origin/arena/<id>-oddbrain
git diff --name-status a6c7807 origin/arena/<id>-oddbrain
git ls-tree -r --name-only <ref>
git ls-tree -r --name-only <ref> -- apps/03_oddbrain/tests \
  | grep -E '^apps/03_oddbrain/tests/[^/]+\.test\.(js|cjs|ts)$'
git grep -lE <pattern> <ref> -- apps/03_oddbrain/src
gh api repos/.../commits/<sha>/check-runs
gh api repos/.../actions/runs/<run>/jobs
gh api repos/.../check-runs/<id>/annotations
```

## What these numbers do not prove

- File presence is not behaviour. No branch was executed.
- Each branch's test totals are read from its report, not re-run here.
- CI is a snapshot at 12:45 UTC.
- Artifact logs still cannot be downloaded from this sandbox.
