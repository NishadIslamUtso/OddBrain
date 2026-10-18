# Verify & install gate — progress / blockers

**NOT A COMPLETED MILESTONE.** Updated 2026-10-18. Branch: `arena/d3c1ee25-oddbrain`; baseline `a6c7807`; brief received at `21d9061`. Do not accept this report as a passed gate or installed-Windows sign-off.

## What exists in this lane

- `.github/workflows/checks.yml`: both OS jobs run the exact ordered clean-install/types/unit/build/`npm run smoke` gate on every push and PR; all six existing renderer checks; real decoder workers; Linux built Electron automation under Xvfb. Failures are blocking and receipts upload even on failure.
- `scripts/verify-gate.cjs` / `verify-contracts.cjs`: checked commit, command exits, derived Vitest totals, strict `SMOKE OK SCROLL OK … errors=0 warnings=0` validation. This closes the verifier loophole where an app can print `SCROLL FAILED` and still exit 0; it does **not** change the out-of-lane app smoke source.
- `scripts/verify-renderer.cjs` / `verify-browser-setup.cjs`: start the existing Vite web renderer, wait for that server's readiness, run the six existing `apps/03_oddbrain/scripts/check-ui*.cjs` scripts unchanged, capture their evidence, close the server. Chromium software rendering is a test-host choice, not a shipped UI setting.
- `scripts/verify-electron.cjs`: new Linux-only built Electron harness with an actual local CLI process and local HTTP reviewer **fixtures**. It targets Send/Allow/Deny, original-byte keep copies, independent auto-keep/review controls, tool-free reviewer requests, and filesystem-backed artifact Trash/restore. It is not live authentication or production inference. Execution still pending.
- `.github/workflows/installer.yml` / `scripts/verify-package.cjs`: manual installer run repeats the exact gate, builds without publishing, requires actual Authenticode `NotSigned`, hashes installer bytes, strictly probes the unpacked production executable's smoke output and runs packaged decoder workers. **Unsigned / unknown publisher** is explicit in gate and summary. The original installer triggers remain unchanged; no session-branch auto-installer trigger was added and no dispatch was retried.
- `tests/verification-gate.test.cjs`: **10 passing verifier tests**, including skipped/broken/failed/missing/duplicated smoke verdicts, errors, warnings, derived unit counts and unsigned copy.
- `VERIFY-RESULTS.md`: required Linux CI × Windows artifact matrix, disposition of all seven baseline §4 gaps, explicit physical-owner limits and archived-source comparison.

## Exact current evidence

Local fresh `npm ci --ignore-scripts`: 485 packages, npm audit 0 vulnerabilities. Electron install then failed: `TypeError: fetch failed` (sandbox release-asset download restriction). Subsequent diagnostics: typecheck **exit 0**, unit **114 files / 807 tests passed**, build **exit 0**, smoke **exit 1** because Electron is absent. Therefore the **mandatory complete local gate did not pass**, and no local smoke errors/warnings counts are invented. Separate verifier suite: **10 passed / 0 failed**; do not combine that count with application tests.

New CI: initial verification commit `1339965` was rejected during workflow validation (no jobs); the invalid job-level `runner.temp` reference was removed. Helpers now use the runtime `RUNNER_TEMP` environment variable. Corrected CI: **pending**. Last pre-lane brief-tip run [39122931670](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39122931670) passed Windows and failed Linux Smoke. Downloading its detailed log hit a blocked Actions results host; no cause is claimed. Older green runs do not validate this patch.

Windows artifact: **pending manual workflow start** on this branch. Prior API dispatch returned 403; the owner chose manual start, not a new installer push trigger. That permission decision is preserved. No installer or installed acceptance is claimed.

## Stale-session comparison: ported / refused

No session-v2 **production implementation** was ported in this lane. Its `checks/RESULTS.json` was used only to compare coverage and preserve limitations: renderer geometry is not installed-Windows proof; a deterministic CLI/model fixture is not a signed-in turn; microphone/player fixtures are not real-device acceptance. No simulated services were installed into the app. The root verification harness labels its fixtures explicitly.

Refused: replacing the app with the large HTML design simulation; importing stale counts as new results; bulk-applying session-v2 patches over newer baseline fixes; unbenching the Ollama downloader; claiming agy catalog/authentication from Claude fixtures; unsigned-warning suppression; changing the owner's visual lane; adding microphone/cloud/model activity to prove a mascot. No new product font, cloud service, telemetry or README cleanup.

Authority-path mismatch: at resource tip `d1e3402`, rev-2 SPEC/CHECKS are under `archive/previous-deliverables/`, not the brief's `OddBrain-UIUX-Handoff/` path. Archived copies were read as identified; no whole large HTML file was ingested.

## Collisions / unchanged inheritance

The branch already contained historical broad app/UI/media changes from `e5cec77` plus docs commit `6223dd3`, before the new brief `21d9061`. Relative to `a6c7807`, that inherited range changes **144 files, 8,860 insertions and 2,467 deletions**. Those are not new lane changes and are not represented as lane-compliant production edits. The visual owner is `arena/cc83a507`; this historical overlap requires orchestrator judgment. No app/UI file was edited after receiving this brief, and no branch/history reset or other-branch change was made to conceal the collision.

The restored sandbox initially exposed the earlier integration as uncommitted files on old HEAD. Those files were preserved in a named stash before the own-branch fast-forward to the brief. That stash was not applied over the synchronized checkout. New changes are restricted to the allowed workflows, root scripts/tests and reports/checklist.

## What is unproven / next acceptance boundary

See the seven-gap table in `VERIFY-RESULTS.md`. First install, TUF A15 Win11 125% presentation, startup, warm boot, global hotkey, native dialogs, real sign-ins, Ollama boot auto-start, actual selected agy.exe, real extension capture and physical media remain **owner-only**. CI fixtures never close those items.

Next machine evidence needed: green new branch-tip checks and a manually started installer run on the same branch. A blocked local download, pending workflow, historical green run or uploaded artifact is not permission to label this milestone complete. Only this branch is authorized for pushes; no main/v3/release action was taken.
