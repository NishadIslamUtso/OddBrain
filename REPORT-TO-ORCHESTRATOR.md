# QA lane report

## Status

Incomplete. Rulings #3 and #4 received by fast-forward to d91dd68. The checks remain enabled. This landing bounds the Linux phases and adds direct-to-file evidence; it does not claim the built-app milestone passed.

## What exists

- `apps/03_oddbrain/scripts/check-ui-built.cjs`: built Electron driver for seven views, 18 settings sections, SPEC §2 measurements, fixture pick-binary persistence/detection and Ollama serve IPC ownership. Coverage implemented is not coverage proven: the full driver has not completed successfully.
- `apps/03_oddbrain/tests/ollama-serve-control.test.ts`: two real-process regression tests: Stop preserves an unrelated control process; missing/invalid PID records refuse to stop.
- `.github/workflows/checks.yml`: Linux renderer step now has a 10-minute outer deadline, 240-second Playwright install, 90-second server readiness, bounded curl and 240-second renderer checks. Built QA has the ordered 12-minute YAML deadline, 60-second apt update, 90-second apt install, 540-second external driver deadline. Both steps write phase files directly, preserve nonzero exit status and upload evidence with `if: always()`. Driver breadcrumbs also append synchronously to the phase file.
- `FIXLIST.md`: finding feed distinguishes harness defects, setup reliability and still-unproven app behavior.

## Gate evidence and limits

Prior local gate on this lane: TypeScript 0 errors; Vitest 115 files / 810 tests passed; build completed (offline renderer 510,176 bytes). The unit ownership regression is 2/2 within that total. These counts are prior results, not a fresh gate on this landing.

Electron download failed locally, including the requested mirror retry; no local smoke or built-driver pass is claimed. The earlier shell pipeline printed a misleading zero status after `tail`; absence of the binary and the fetch error establish failure, not success.

Run 39125100489: Windows standard gate succeeded. Linux Types, Tests, Build, renderer checks and Smoke succeeded; Built-app QA failed with an empty log. Run 39126660848: latest queried state had Windows success and Linux still incomplete. Ruling #4 records the Linux built-step overrun. Windows does not contain the built QA step, so its success cannot prove that driver is sound.

For this landing: JavaScript syntax and workflow YAML parsing checked; CI result pending. No all-green-tip claim.

## Scope and provenance

This QA landing ports no session-v2 app code. The driver follows the existing Electron automation launch pattern and uses temporary fixture binaries; it does not simulate production engine success. No stale application bulk was imported for this lane. Earlier pre-assignment session-v2 ports remain in branch ancestry; this report does not recertify them or imply they obey the later QA-only path restriction.

No application or visual-lane code changed after assignment. QA owns the harness fixes. No other-lane fixes attempted. The orchestrator's brief changes are received instructions, not QA-authored edits.

## Still owed

Successful built-driver run; read back its JSON/screenshots; compare actual §2 measurements; publish reproduced app findings; verify all seven views and 18 sections plus both actual IPC regressions. Until then, lane completion remains unproven.

## Channel handoff — owner standing order acknowledged

Pulled this branch with `--ff-only`; already current at 086e352. Re-read THE CHANNEL and latest ruling (#4). The requested Linux deadline/file-evidence changes are committed in 086e352; that implementation milestone is filed, not a successful QA execution milestone.

Live check: run 39127701506 for 086e352 is still `in_progress`. Linux was in Renderer checks; Windows was in Types. No conclusion or new test counts are claimed. Full built-screen/section/IPC evidence remains pending. No additional tests executed during this handoff. Await orchestrator continuation via branch commits; no application changes or out-of-lane work performed.
