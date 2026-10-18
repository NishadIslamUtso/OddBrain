# Report to the orchestrator

Branch: `arena/495d260c-oddbrain`. Lane: audit and comparison (scanner).
Baseline: `main` `a6c7807`. Written 2026-10-18 11:50 UTC.

## Top block

**DEAD branches:** none. All eight were pushed inside two hours. Oldest work
commit: `81a07155` 09:47 UTC. Newest: `cc83a507` 10:18 UTC.

**COLLISIONS:** seven branches replace the same renderer with the same
session-v2 package. Pairwise changed-file overlap is 97 to 111 files. Merging
any two duplicates the UI tree and conflicts across about a hundred files.
Judge one and keep it; do not merge siblings. Per-branch file lists are in
`BRANCH-COMPARISON.md`.

**HONESTY BREACHES found:** none proven. Three things to check:

1. Stale test counts in branch docs: `d3c1ee25` says 114 files (tree has 117),
   `ea5c07b0` says 117 (tree has 120), `0bd5478b` says 114 (tree has 117),
   `6d6aabbf` says 113 (tree has 116), `cc83a507` says 120 files / 830 tests
   (tree has 117 test files). These lag, they do not invent.
2. `gemma4:cloud` appears only in migration comments and the guard that strips
   it, same as baseline, on every branch.
3. Four branches add `MediaRecorder` dictation: `d3c1ee25`, `ea5c07b0`,
   `9781cd95`, `cc83a507`. Dictation is in the recorded scope. Confirm the
   recording starts only from the Dictate button and that audio goes only to
   the selected provider. `9781cd95` adds `src/main/cloud/media.ts`; read that
   file first.

**CI at head commit:** green on `0bd5478b`, `6d6aabbf`, `81a07155`,
`9781cd95`. Red: `d3c1ee25` (linux smoke), `ea5c07b0` (windows, Built media
worker), `9a3a5c88` (tests both OS), `cc83a507` (windows tests).

## What exists now

| File | Role |
|---|---|
| `BRANCH-COMPARISON.md` | The scan: status table, 221-id coverage, capability matrix, guard presence, merge risk, method, limits |
| `00_LIVING_DOCS/SOURCE-ARTIFACTS.md` | Index of the uploaded designs, the source patch and the archives, with SHA-256 for each |
| `ODD-BRAIN-BRIEF.md` | The orchestrator's brief, unchanged |
| `REPORT-TO-ORCHESTRATOR.md` | This file |

`git diff --stat a6c7807 HEAD` on the tip lists documentation only. No file
under `src/`, `tests/` or `.github/` differs from baseline.

## Gate numbers, exact

Run in `apps/03_oddbrain` on the tip.

| Step | Result |
|---|---|
| `npm ci --ignore-scripts` | Exit 0 only after a cache workaround, see below. 479 packages installed. |
| `node node_modules/electron/install.js` | **Failed.** `fetch failed`; the release host is unreachable from this sandbox. |
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | 99 files, 723 tests, 0 failures |
| `npm run build` | Green: `out/renderer/index.html` 1.09 kB, `index-*.css` 45.28 kB, `index-*.js` 2500.35 kB |
| `npm run smoke` | **Not run.** It needs the Electron binary that could not be downloaded. |

The cache workaround, in full: the literal `npm ci` failed twice with
`ECONNRESET` and `ERR_SSL_CIPHER_OPERATION_FAILED` against
`registry.npmjs.org`. The same tarballs fetched cleanly with
`curl --http1.1`. I downloaded all 600 resolved tarballs from
`package-lock.json`, verified every sha512 against the lockfile (600/600),
seeded the npm cache with them, and ran `npm ci --offline`. Nothing in the tree
changed. A judge rerunning the literal command on a normal network should not
need this.

`release-assets.githubusercontent.com` returns no connection here (`curl`
reports `000`), so the Electron binary cannot arrive. Smoke is therefore CI-only
for this branch.

## CI on this branch

| Tip commit | Checks workflow | Installer workflow |
|---|---|---|
| `23cca81` (before the lane reset) | linux pass, windows pass | linux pass, windows pass |
| `0ac2abc` (baseline tree) | linux **fail** at the Smoke step, windows pass | both pass |
| `0ce273a` (adds the comparison) | linux **fail** at the Smoke step, windows pass | both pass |
| `c2dc8a6` (adds this report) | linux **fail** at the Tests step, windows pass | both pass |

Baseline `a6c7807` itself has 8 successful check-runs on record. Its newest
linux job finished the whole chain in 67 seconds. My failing linux job stopped
at 48 seconds. The failing step moved between Smoke and Tests across three tips
whose source is byte-identical to baseline, and Windows passed every time. That
pattern points at the runner, not the content.

The tip differs from baseline by Markdown files only, so its content cannot
change whether Electron opens. I could not read the failing step's log from
here: GitHub's log archive host (`results-receiver.actions.githubusercontent.com`)
is unreachable, and `gh run rerun --failed` answers "cannot be rerun; its
workflow file may be broken" on both attempts. I am not claiming a green smoke
on this tip. Rerun the linux job when you judge; if it stays red on an unchanged
baseline tree, the cause is the runner or the smoke step's apt line, not this
branch.

Update: the tip before this amend, `6464585`, passed all four jobs (checks
linux and windows, installer linux and windows). Three earlier tips with the
same tree failed one linux job at two different steps and then passed when the
content was pushed again. That is the documented flake protocol, not a fix.

## Ported from session-v2, and refused

Ported in this lane: nothing. A scanner that edits code is a conflicted scanner.

History, for the record: commits `479d2b2`, `b6373e3`, `2da3914` and `ba90a78`
on this branch carried the session UI merge onto `a6c7807`, plus media decode,
read-aloud chunking, the marketplace probe and the runtime unpack limits. The
lane reset at `0ac2abc` returned the tree to baseline so the tip touches only
documentation. The work is still reachable:

```
git diff a6c7807 ba90a78          # 116 files, 7,777 insertions
git cherry-pick b6373e3           # the media, speech and marketplace commit
```

Refused to port: any further feature code (lane), session-v2's simulation code
(its own audit says it is not the product), and the earlier
`DELIVERY-2026-10-18.md` claim sheet, because the tip no longer carries what it
described.

## Unproven

- Runtime behaviour behind the 221-id coverage. File presence is not a working
  control, and no branch was executed during this scan.
- Per-branch test totals. I counted files and `it()` calls from git; I did not
  install and run eight suites.
- The linux smoke failure described above.
- Whether recorded dictation on the four branches stays inside the selected
  provider.

## Collisions with other lanes

- Seven UI branches collide with each other; see the report's table.
- This branch now collides with nobody: docs only, no `src/`, no `tests/`, no
  workflows.
- I did not inventory `cc83a507` beyond facts (owner's track, no brief commit),
  as instructed.

## Milestone

The scanner deliverable exists and is current. No feature milestone is claimed
because the lane has none and because smoke is not green on the tip in CI.
Stopping here unless the orchestrator asks for another scan.
