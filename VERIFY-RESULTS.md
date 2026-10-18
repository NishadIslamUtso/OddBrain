# Verification and install gate

Status: **IN PROGRESS — not an accepted milestone.** Updated 2026-10-18.
Baseline: `a6c7807`. Verification work starts on top of brief commit `21d9061`; inherited application changes are disclosed in `REPORT-TO-ORCHESTRATOR.md`.

## Evidence matrix

“Configured” is not “passed”. A Windows CI development launch is not a Windows installer artifact, and neither is an installed TUF A15 check.

| Check | Linux CI | Windows artifact |
|---|---|---|
| Unit suite | New ordered gate pending CI. Fresh local diagnostic: **114 files / 807 tests passed**, not a completed install gate. | No current installer run. Windows checks will run the same ordered gate; the manual installer workflow separately repeats it before packaging. |
| Renderer checks | All six existing `apps/03_oddbrain/scripts/check-ui*.cjs` checks are wired through `scripts/verify-renderer.cjs`; current execution pending. Uses the actual React renderer and explicit browser/service fixtures. | The same six checks run in Windows CI, **not against the installed artifact**. Their results must not be described as installer acceptance. |
| Electron automation | `scripts/verify-electron.cjs` launches the **built Electron app under Xvfb** with isolated test profile, real IPC/filesystem, local CLI and local HTTP reviewer fixtures. Current run pending. Exact `npm run smoke` is a separate strict scroll/console gate. | Manual installer workflow will launch `dist/win-unpacked/OddBrain.exe --smoke --disable-gpu` and the actual packaged decoder worker. No current run. The Linux POSIX CLI automation fixture does not establish Windows live-engine behavior. |
| Installer build | Not a Windows packaging runner; no Linux installer requested. | **Pending manual run** of `installer` on `arena/d3c1ee25-oddbrain`. `scripts/verify-package.cjs` builds without publishing, hashes actual bytes, requires Authenticode `NotSigned`, checks packaged smoke and packaged media. No certificate; **unsigned / unknown publisher**. |

### Current local evidence

Commands ran from `apps/03_oddbrain`, in the requested order; after the failed install, later commands were **diagnostics only**, not a passed gate:

1. `npm ci --ignore-scripts`: succeeded, 485 packages installed, npm audit reported 0 vulnerabilities.
2. `node node_modules/electron/install.js`: **failed**, `TypeError: fetch failed` while downloading the binary. The sandbox blocks the release-asset download host. No retry or substitute binary is being presented as a clean install.
3. `npx tsc --noEmit`: exit 0.
4. `npx vitest run`: **114 files, 807 tests passed**.
5. `npm run build`: exit 0.
6. `npm run smoke`: exit 1, Electron binary unavailable. No `SMOKE OK` claim.
7. `node --test tests/verification-gate.test.cjs`: **10 tests passed, 0 failed**. These test the verifier itself, not the application; do not add them to the 807 application tests.

Local logs: `/home/user/verification-lane/{install,types,unit,build,smoke}.log`. All new CJS scripts also pass `node --check`; `git diff --check` is clean. Local diagnostics predate any CI results below.

### CI receipts and commands

- Before these verification edits, brief tip `21d9061` had [run 39122931670](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39122931670): Windows passed; Linux failed at Smoke. Log download was blocked at the Actions results host; the cause is **not diagnosed** and is not declared a flake.
- New CI result: **pending**. Initial patch `1339965` / run `39124288845` failed workflow validation before jobs; corrected job environment handling uses runtime `RUNNER_TEMP`, not an unavailable job-level expression. A historical green run is not evidence for the new verifier.
- `scripts/verify-gate.cjs` runs the brief's exact clean-install → Electron install → typecheck → Vitest → build → **`npm run smoke`** sequence, stopping at the first failed command. JSON records the checked commit, actual exit codes, derived test totals and the exact smoke verdict. No retries, warning suppression, signing bypass or forged success.
- Smoke accepts exactly one `SMOKE OK SCROLL OK … errors=0 warnings=0` verdict. A zero app exit with `SCROLL FAILED`, `SCROLL skipped`, absent or repeated verdicts still fails the wrapper.
- CI uploads JSON/logs/screenshots, including failure receipts. Temporary app profiles, generated pairing material and vault state are excluded from artifact uploads. Artifact names include the source SHA.
- Installer workflow triggers remain **unchanged**: manual dispatch, existing main/v3 pushes and existing version tags. No session-branch installer push trigger, dispatch retry, publication or release was added. Starting the manual run needs the owner's existing GitHub workflow permission.

## All seven baseline WHAT-EXISTS §4 gaps

The baseline is `git show a6c7807:WHAT-EXISTS.md`, not a rewritten claim that every gap is closed. Application test paths in this table are relative to `apps/03_oddbrain/`.

| # | Disposition and evidence / CI limit |
|---|---|
| 1 — Ollama downloader / installed-copy boot | **Downloader remains benched.** No attempt to increase archive limits or ship a downloader. Existing `tests/ollama-found.test.ts` tests installed-copy lookup, spawn and honest missing-binary copy. CI does not prove the owner's installed Ollama, login/startup environment or warm boot; owner must check the winget-installed copy. |
| 2 — Store phases 2–3 / live marketplaces | Existing `tests/engine-marketplace.test.ts` and renderer media checks exercise command binding and approval/follow-up behavior with **fixtures**. Inherited marketplace implementation is not a fresh authenticated live probe. CI has no owner's Claude Code or agy sign-in; official marketplace operation and any agy catalog remain unproven. Never infer agy catalog support from the Claude fixture. |
| 3 — agy signed-in turn / executable selection | Existing `tests/engine-agy.test.ts`, `engine-detect-paths.test.ts` and `staged-engines.test.ts` cover wire/probe/owner-pointed precedence. CI has neither the owner's actual `agy.exe` nor their sign-in. Owner must select that exe and drive a real turn; mock executables do not close the gap. |
| 4 — full owner acceptance chain | Built Electron automation is intended to test actual Send → Allow/Deny, original-byte checkpoint inspection, independent auto-keep/review controls and artifact Trash restore, using local fixtures. It **does not** prove a real authenticated turn, checkpoint Restore through native dialogs, installed always-loaded behavior, global hotkey, startup or actual extension capture on TUF A15. Those stay owner-only. |
| 5 — fixed-sleep CI flakes | Preserve `tests/engine-media.test.ts`; no out-of-lane test/source edits. New wrappers wait for a listening Vite server and native observable completion, not blind readiness sleeps. They do not silently rerun a failure. Existing app/check scripts retain their timings; one new green run would not prove all flakes eliminated. Record a failure before any identical-commit rerun. The pre-lane Linux smoke failure is still undiagnosed. |
| 6 — unsigned installer | `verify-package.cjs` requires the actual file's Authenticode status to be `NotSigned`, prints **UNSIGNED / unknown publisher**, emits an actual SHA-256 and tests packaged execution. `tests/verification-gate.test.cjs` checks blunt unsigned copy. **Not yet executed on a Windows artifact.** CI cannot demonstrate the owner's actual SmartScreen / UAC interaction or supply a certificate. Never disable those warnings. |
| 7 — the two real-machine bugs | Keep `tests/ollama-found.test.ts` and `staged-engines.test.ts` (owner-pointed binary wins) and their existing boot/probe fixes. Unit proof is not owner-machine confirmation. Actual Ollama boot auto-start, actual selected `agy.exe`, path with spaces, persistence after reopening and “Use automatic detection” need the owner's installed Windows copy. |

## Acceptance comparison and hard limits

Authority read from `agent-resources` at `d1e3402282ba922571bc81de3ea20dec760cbc67`: `workspace-notes/DECISIONS.json`, archived rev-2 `archive/previous-deliverables/OddBrain-UIUX-{SPEC.md,CHECKS.json}`, and `reference/session-v2/checks/RESULTS.json`. The brief's `OddBrain-UIUX-Handoff/` source paths are absent at that resource tip; their archived copies are identified rather than silently relabeled as current files.

The acceptance inventory is **8 presets / 8 layouts / 9 source palettes / 4 styles / 77 scenes / 18 Settings destinations**. These are source inventory sizes, not new executed-test counts. The existing six renderer scripts cover geometry, state retention, motion, offline export, turn controls and media/store integration; their runtime JSON is the evidence, not the inventory total. Archived session-v2 measurements (including 96 files / 718 tests) are **historical only**, on stale baseline `2f05dac`, and are not credited to this branch.

**Owner-only, still open:** first install on the ASUS TUF A15; Windows 11 at 125% / 1536×864 logical; real OS startup and warm boot; global hotkey and Quick window outside the app; native file/folder dialogs; real provider sign-ins and key save/clear; Ollama boot auto-start; choosing and launching the real `agy.exe`; real extension pairing/capture; physical microphone, recording, playback and real transcription quality. CI fixtures establish none of these. Minimum window/geometry automation cannot replace physical acceptance.
