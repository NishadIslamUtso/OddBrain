# Branch comparison

Scanner: `arena/495d260c-oddbrain`. Baseline: `main` `a6c7807`.
Scanned: 2026-10-18 11:35 UTC. Every number below comes from a command listed
under **Method**, run against `origin/arena/<id>-oddbrain` at the commit shown.

## Top block

**DEAD:** none. Every branch was pushed within two hours of this scan. The
oldest work commit is `81a07155` at 09:47 UTC; the newest is `cc83a507` at
10:18 UTC. Nothing qualifies as dead yet.

**COLLISIONS:** severe, and structural. Seven branches replace the same
renderer with the same session-v2 package. Pairwise overlap of changed files is
97 to 111 files out of 105 to 197. Any two of them merged would duplicate the
whole UI tree and conflict across roughly a hundred files. Pick one UI branch
after judging; do not merge siblings.

**HONESTY FLAGS (needs a check, not a verdict):**

1. Four branches state test counts that lag their own tree by three files:
   `d3c1ee25` says 114 files, tree has 117; `ea5c07b0` says 117, tree has 120;
   `0bd5478b` says 114, tree has 117; `6d6aabbf` says 113, tree has 116.
   `cc83a507` says 120 files / 830 tests, tree has 117 test files. Stale numbers
   rather than invented ones, but the honesty bar asks for countable claims.
2. No branch reintroduces `gemma4:cloud` as a default. The string survives only
   in migration comments and the migration guard that strips it, same as
   baseline.
3. No branch adds a status dot class in the engine pickers that my scan can see.
   Appearance quality is out of scope here; the owner judges `cc83a507` himself.
4. Four branches add microphone dictation through `MediaRecorder`
   (`d3c1ee25`, `ea5c07b0`, `9781cd95`, `cc83a507`). Dictation is inside the
   recorded scope (`DECISIONS.json` voice: read aloud and dictation). Confirm on
   each that recording starts only from the Dictate button and that recorded
   audio goes only to the selected provider. `9781cd95` adds
   `src/main/cloud/media.ts`, which is the one to read line by line.
5. `9a3a5c88` and `cc83a507` have failing CI (details below). A branch cannot
   claim a milestone while its gate is red.

## Status at the scanned commit

| Branch | Ahead of baseline | Changed files | Lines | CI checks | Last work commit (UTC) | Report file |
|---|---|---|---|---|---|---|
| `arena/d3c1ee25` | 3 | 144 | +8860 / −2467 | linux **fail** (smoke), windows pass | 10:31 | no |
| `arena/ea5c07b0` | 2 | 136 | +8041 / −1453 | linux pass, windows **fail** (media worker) | 09:48 | no |
| `arena/0bd5478b` | 10 | 113 | +8615 / −1295 | linux pass, windows pass | 10:23 | no |
| `arena/6d6aabbf` | 6 | 105 | +7558 / −1187 | linux pass, windows pass | 10:17 | no |
| `arena/9a3a5c88` | 2 | 27 | +2459 / −130 | linux **fail**, windows **fail** (tests) | 09:53 | no |
| `arena/81a07155` | 3 | 197 | +7742 / −1623 | linux pass, windows pass | 09:47 | no |
| `arena/9781cd95` | 2 | 128 | +9131 / −1531 | linux pass, windows pass | 09:57 | no |
| `arena/cc83a507` | 1 | 146 | +8780 / −3789 | linux pass, windows **fail** (tests) | 10:18 | no |
| `arena/495d260c` (this branch) | 3 | 2 product files, 0 | docs only | see report | 11:26 | yes |

`cc83a507` carries no orchestrator brief commit. It is inventoried here only,
per the lane instruction.

## Dispatcher coverage (the 221 ids)

Measured by checking each row's `nativeSources` from
`reference/session-v2/checks/RETENTION-AUDIT.json` for existence under
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

The 122-id expansion is the identical set on all seven full branches. That is
expected if they are all ports of the same session-v2 package, and it means
dispatch coverage cannot separate them. The breakdown:

look-lab 24, chat-composer 15, menus-setup 14, context-tools 13, appearance 13,
navigation 12, layout-exploration 7, scene-gallery 6, rules-permissions 5,
exports 5, checkpoints 4, journal-review 2, clipboard 1, not-applicable-mobile 1.

`9a3a5c88` is a media and document lane only. It answers no new dispatcher id
and leaves the appearance system untouched by design.

This is a file-presence test. It proves the native source the audit maps each
action to exists on the branch. It does not prove the control works at runtime.

## Capability matrix

File-presence counts from `git grep` over `apps/03_oddbrain/src`. A dash means
the pattern is absent.

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

`d3c1ee25` and `ea5c07b0` still carry the old pack-sized unpack limits, so the
1.47 GB Ollama archive stays broken there. `0bd5478b`, `6d6aabbf`, `81a07155`,
`9781cd95` and `cc83a507` carry the runtime limits.

## Security walls

All nine branches were checked; `extension/` is untouched on every one, so the
capture-everything default is intact.

| Guard | Branches with it |
|---|---|
| `shellSafeCommand` | all (7 to 9 files each) |
| pairing token | all (11 or 12 files) |
| `redirect: 'manual'` pin | all (1 file) |
| zip forged-declaration checks | all (22 to 30 hits) |
| keys stay in main | all (8 or 9 files) |
| pipeline | `0bd5478b` pipes CI output itself, which is new code in a workflow |

No branch deletes a guard call in the added-versus-removed scan. Three branches
change workflows, and all three changes add checks: `d3c1ee25` adds native media
checks to the installer workflow, `ea5c07b0` switches the install step from
`npm install` to `npm ci` and adds a media-worker job, `0bd5478b` adds the
renderer checks to CI.

## Merge risk

Shared changed files, pairwise, for the seven full UI branches:

| Pair | Shared files |
|---|---|
| d3c1ee25 x cc83a507 | 111 |
| d3c1ee25 x ea5c07b0 | 110 |
| ea5c07b0 x cc83a507 | 111 |
| ea5c07b0 x 9781cd95 | 107 |
| 81a07155 x 9781cd95 | 104 |
| 6d6aabbf x cc83a507 | 97 |

The rest sit between 97 and 107. This is not a mergeable set; it is eight
parallel answers to one brief.

## Per-branch notes

- `arena/d3c1ee25` — broadest media work: isolated media worker, local pipeline,
  provider path, runtime archive, marketplace module. Adds 26 test files. CI red
  on the linux smoke step only, which under the flake protocol should be re-run
  before it is judged.
- `arena/ea5c07b0` — media plus speech, media-worker test job, marketplace
  module. Windows red at the new "Built media worker" step, so the added gate
  fails on the OS the owner runs. Still carries the old unpack limits.
- `arena/0bd5478b` — ten commits, renderer checks added to CI, marketplace
  module, main-process dictation, runtime limit fix. Both checks green. Claimed
  test counts are three files stale.
- `arena/6d6aabbf` — compact shell port with the runtime limit fix, no
  marketplace module, no dictation. Both checks green.
- `arena/9a3a5c88` — media and document lane only: 27 files, 3 new source files,
  no appearance work, both CI jobs red on tests. The narrowest diff and the
  easiest to merge, but it does not answer the UI brief.
- `arena/81a07155` — largest diff by files (197) because of test fixtures and
  assets. Both checks green. One marketplace component, no marketplace main
  process.
- `arena/9781cd95` — marketplace module, runtime zip module, selected-model
  vision check, cloud media path (`main/cloud/media.ts`). Both checks green.
  The module to read closely before trusting audio handling.
- `arena/cc83a507` — the owner's personal visual track. Full UI, marketplace,
  media pipeline, MediaRecorder dictation. Windows tests red. No brief commit.
  Inventory only here.

## Method

```
git rev-list --count a6c7807..origin/arena/<id>-oddbrain
git diff --name-status a6c7807 origin/arena/<id>-oddbrain
git diff --shortstat a6c7807 origin/arena/<id>-oddbrain
git ls-tree -r --name-only <ref>                 # coverage + test files
git grep -lE <pattern> <ref> -- apps/03_oddbrain/src
gh api repos/NishadIslamUtso/OddBrain/commits/<sha>/check-runs
```

CI job failure steps were read from
`repos/.../actions/runs/<run>/jobs` for the failing run of each head commit.

## What these numbers do not prove

- File presence is not behaviour. No branch was executed during this scan.
- Test counts are file counts plus `it()` call counts, not vitest's reported
  totals. Those differ (baseline: 102 files on disk, 99 run by vitest, 699
  `it()` calls, 723 reported tests).
- CI results are at the scanned commit. A branch that pushes again moves them.
- Law and honesty flags are source-pattern scans. They find evidence to check;
  they do not clear or convict a branch on their own.
