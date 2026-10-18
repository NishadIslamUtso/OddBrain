# Branch comparison

Scanner: `arena/495d260c-oddbrain`. Baseline: `main` `a6c7807`.
Scan #2, 2026-10-18 12:10 UTC. Supersedes the 11:35 scan.
Every number came from the commands under **Method**, run against
`origin/arena/<id>-oddbrain` at the commit in the table.

## Top block

**DEAD:** none. All eight work branches were pushed inside the last half hour.
`cc83a507` is the exception at 10:18 UTC, and it is inventoried only, so its
silence is not a dead flag.

**COLLISIONS:** unchanged in shape. Six of the seven UI branches still overlap
97 to 113 changed files pairwise. One lane is now separable: `9a3a5c88`
overlaps the others on 6 to 13 files, all of them shared plumbing
(`package.json`, `main/index.ts`, `App.tsx`, `ChatView.tsx`, `Composer.tsx`,
`shared/lib/attachments.ts`, `shared/types.ts`, and the brief). It can be
merged after a UI branch with a short conflict list, and it is the only lane
where that is true.

**HONESTY FLAGS:**

1. **Stale counts, still drifting.** Five branches state test totals below their
   own tree:
   - `d3c1ee25`: claims 114 files / 807 tests, tree has **117** test files.
   - `ea5c07b0`: claims 117 / 807, tree has **121**.
   - `0bd5478b`: claims 114 / 808, tree has **118**.
   - `6d6aabbf`: claims 113 / 815, tree has **116**.
   - `9a3a5c88`: claims 103 / 744, tree has **106**.
   `81a07155` and `9781cd95` still quote the baseline numbers (99 / 723) while
   carrying 115 and 118 test files. `cc83a507` states no number.
2. **Hang, not a fail:** `0bd5478b`'s linux job has been `in_progress` since
   11:56:37, nineteen minutes at this scan. Baseline's whole linux chain takes
   67 seconds. The step it added is the renderer check (Playwright install,
   Vite dev server, `npm run test:ui`); a hung lane there stalls the job. This
   needs a timeout on that step, not a rerun.
3. **New CI step failing on both OS:** `d3c1ee25` now fails at
   `Actual renderer checks (fixture limitations recorded)` on linux **and**
   windows. That is a different failure from the 11:35 scan (linux smoke only),
   so its new renderer gate has never passed.
4. No branch reintroduces `gemma4:cloud` as a default. It survives only in the
   migration guard that strips it, same as baseline.
5. Four branches add `MediaRecorder` dictation (`d3c1ee25`, `ea5c07b0`,
   `9781cd95`, `cc83a507`). In scope, but `9781cd95`'s `main/cloud/media.ts`
   path is the one to read before audio is trusted.
6. `9a3a5c88`'s own report declares **NOT COMPLETE** and states plainly that its
   pre-brief commit changed files outside its lane. That is honesty working.

## Status at the scanned commit

| Branch | Tip | Ahead | Changed files | Lines | Brief commit | Questions filed | CI (checks) | Last work commit (UTC) | Report file |
|---|---|---|---|---|---|---|---|---|---|
| `arena/d3c1ee25` | `6142f2d` | 8 | 154 | +9346 / −2577 | yes | no | linux **fail**, windows **fail** (renderer checks) | 11:46 | yes |
| `arena/ea5c07b0` | `c9b7a3b` | 7 | 144 | +8504 / −1486 | yes | no | linux pass, windows **fail** (media worker) | 11:46 | yes |
| `arena/0bd5478b` | `e64b3d7` | 14 | 115 | +9035 / −1295 | yes | no | windows pass, linux **hanging** 19 min (renderer checks) | 11:54 | no |
| `arena/6d6aabbf` | `445eb4d` | 8 | 105 | +7588 / −1187 | yes | no | linux pass, windows pass | 10:17 | no |
| `arena/9a3a5c88` | `0228186` | 8 | 28 | +2558 / −130 | yes | no | linux pass, windows pass | 11:52 | yes |
| `arena/81a07155` | `012214a` | 7 | 202 | +8358 / −1676 | yes | no | linux pass, windows pass | 11:41 | yes |
| `arena/9781cd95` | `3350a85` | 4 | 128 | +9163 / −1531 | yes | no | windows pass, linux **fail** (smoke) | 09:57 | no |
| `arena/cc83a507` | `01b1237` | 1 | 146 | +8780 / −3789 | **no** | no | linux pass, windows **fail** (tests) | 10:18 | no |
| `arena/495d260c` (this) | `59190ec` | 11 | 4 docs | +505 / −0 | yes | no | 4/4 pass | 11:43 | yes |

`9a3a5c88` went from both jobs red at the last scan to both green. The other
reds are unchanged or new.

## Dispatcher coverage (221 ids)

Each row's `nativeSources` from
`reference/session-v2/checks/RETENTION-AUDIT.json` must exist under
`apps/03_oddbrain/src/renderer/src/`.

| Branch | Ids answered | Beyond baseline | Test files in tree |
|---|---|---|---|
| baseline `a6c7807` | 99 / 221 | 0 | 102 |
| `d3c1ee25` | 221 / 221 | 122 | 117 |
| `ea5c07b0` | 221 / 221 | 122 | 121 |
| `0bd5478b` | 221 / 221 | 122 | 118 |
| `6d6aabbf` | 221 / 221 | 122 | 116 |
| `81a07155` | 221 / 221 | 122 | 115 |
| `9781cd95` | 221 / 221 | 122 | 118 |
| `cc83a507` | 221 / 221 | 122 | 117 |
| `9a3a5c88` | 99 / 221 | 0 | 106 |
| `495d260c` | 99 / 221 | 0 | 102 |

The 122-id expansion is the **identical set** on all seven full branches, same
as the last scan. The breakdown:

look-lab 24, chat-composer 15, menus-setup 14, context-tools 13, appearance 13,
navigation 12, layout-exploration 7, scene-gallery 6, rules-permissions 5,
exports 5, checkpoints 4, journal-review 2, clipboard 1, not-applicable-mobile 1.

Two runs, identical result. Coverage still cannot rank the seven; it only
separates them from the two narrow lanes.

This is a file-presence test. It proves the mapped source file exists on the
branch, not that the control works.

## Capability matrix

`git grep` hit counts over `apps/03_oddbrain/src`. A dash means absent.

| Capability | d3c1 | ea5c | 0bd5 | 6d6a | 9a3a | 81a0 | 9781 | cc83 |
|---|---|---|---|---|---|---|---|---|
| engine overrides / Point to the exe | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 |
| Ollama auto-start at boot | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| design-systems loader | 21 | 21 | 20 | 20 | 20 | 21 | 22 | 21 |
| connectors doors | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 |
| quick window | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| exports | 4 | 4 | 4 | 4 | 3 | 4 | 4 | 4 |
| 77 scenes / loader | 3 | 3 | 3 | 3 | 2 | 3 | 3 | 3 |
| looks and layouts catalogs | 4 | 4 | 4 | 4 | – | 4 | 4 | 4 |
| runtime downloader limit fix | – | – | 1 | 2 | – | 1 | 1 | 1 |
| marketplace modules (files) | 3 | 3 | 2 | 0 | 0 | 1 | 3 | 2 |
| dictation through MediaRecorder | yes | yes | – | – | – | – | yes | yes |

`d3c1ee25` and `ea5c07b0` still carry pack-sized unpack limits, so the 1.47 GB
Ollama archive stays broken there. Unchanged from the last scan.

## Security walls

`extension/` is untouched on every branch, so capture-everything stays on.

| Guard | Branches with it |
|---|---|
| `shellSafeCommand` | all (7 to 9 files) |
| pairing token | all (11 or 12 files) |
| `redirect: 'manual'` pin | all (1 file) |
| zip forged-declaration checks | all (22 to 30 hits) |
| keys stay in main | all (8 or 9 files) |

No branch deletes a guard call. Workflow edits remain additive: `d3c1ee25`
adds native media and packaged-worker steps, `ea5c07b0` switches the install
step to `npm ci` and adds a media-worker job, `0bd5478b` adds the renderer
checks. The last of those is the step that hangs; the guard is sound, the
timeout is missing.

## Merge risk

Shared changed files, pairwise:

| Pair | Shared |
|---|---|
| d3c1ee25 x ea5c07b0 | 113 |
| d3c1ee25 x cc83a507 | 112 |
| ea5c07b0 x cc83a507 | 111 |
| d3c1ee25 x 81a07155 | 107 |
| d3c1ee25 x 9781cd95 | 107 |
| ea5c07b0 x 9781cd95 | 107 |
| 9781cd95 x cc83a507 | 106 |
| 81a07155 x 9781cd95 | 104 |
| ea5c07b0 x 81a07155 | 104 |
| 0bd5478b x 9781cd95 | 101 |
| **9a3a5c88 x any** | **6 to 13** |

The seven UI branches are siblings. `9a3a5c88` is a separate, complementary
lane and the only one that merges cleanly on top of a chosen UI branch.

## Per-branch notes

- `arena/d3c1ee25` — widest media work, isolated worker, marketplace module.
  Its new renderer-check step fails on both OS, so its CI has never been green
  since the step landed.
- `arena/ea5c07b0` — media plus speech; windows red at its own new
  "Built media worker" step. A branch whose added gate fails on the owner's OS
  cannot claim the gate.
- `arena/0bd5478b` — fourteen commits, renderer checks in CI, marketplace
  module, main-process dictation, runtime limits. Windows green. Linux hung, so
  its state is **unknown**, not failed.
- `arena/6d6aabbf` — compact shell, runtime limits, no marketplace module, no
  dictation. Both jobs green, seven hours since its last work commit relative to
  the other lanes.
- `arena/9a3a5c88` — media and documents only. Narrow diff, both jobs green,
  report says NOT COMPLETE and names its own out-of-lane edits. Lowest merge
  risk in the fleet.
- `arena/81a07155` — most files touched (202, fixtures and assets included).
  Both jobs green. One marketplace component, no marketplace main process.
- `arena/9781cd95` — marketplace module, runtime zip module, selected-model
  vision check, cloud media path. Linux red on smoke; windows green.
- `arena/cc83a507` — owner's visual track. No brief commit, windows tests red.
  Inventory only, per the ruling.

## Method

```
git rev-list --count a6c7807..origin/arena/<id>-oddbrain
git diff --name-status a6c7807 origin/arena/<id>-oddbrain
git diff --shortstat a6c7807 origin/arena/<id>-oddbrain
git ls-tree -r --name-only <ref>
git grep -lE <pattern> <ref> -- apps/03_oddbrain/src
gh api repos/NishadIslamUtso/OddBrain/commits/<sha>/check-runs
gh api repos/NishadIslamUtso/OddBrain/actions/runs/<run>/jobs
```

Test-file counts are `git ls-tree` listings. Claimed numbers are read from each
branch's changed Markdown. The job state of `0bd5478b` was read at 12:15 UTC,
nineteen minutes after the job started.

## What these numbers do not prove

- File presence is not behaviour. No branch was executed here.
- Test counts are file counts, not vitest's reported totals. Baseline: 102 files
  on disk, 99 run, 723 reported.
- CI is a snapshot. A branch that pushes while you read this has moved.
- Law flags are source-pattern scans. They find evidence to check; they do not
  convict.
