# QA findings

Only reproduced observations belong here. A blocked run is not proof of an app defect.

| ID | What / repro | Expected | Actual / evidence | Severity | Responsible / status |
|---|---|---|---|---|---|
| QA-001 | Built driver: launch fresh profile, visit default Chat, assert stored view equals `chat`. | Driver respects the initial default without requiring a state change. | Run 39123828400: `null !== 'chat'`. App writes on change; this was a harness error, not an app defect. | QA blocker | QA lane; fixed in 9c0cf16. Other view switches remain strict. |
| QA-002 | Linux built-app QA, run 39125100489. | Driver completes or emits diagnostic evidence before timeout. | Step failed with empty log; prior Types, Tests, Build, renderer checks and Smoke succeeded. Exact stalled phase was not established. | QA blocker | QA lane; file breadcrumbs and phase deadlines added following rulings #3/#4; rerun pending. |
| QA-003 | Linux renderer workflow readiness and dependency setup. | Every network/setup/readiness phase has a finite deadline. | Workflow had a 20-minute outer limit, but Playwright installation had no phase deadline; curl readiness could exceed its nominal retry window because requests lacked timeouts. Source inspection, plus ruling #3 scanner observation. | QA reliability | QA lane; 10-minute outer limit, 240-second install, 90-second readiness with bounded curl added; rerun pending. |

## Not yet established

All seven built views, all 18 settings sections, both fixture IPC regressions, and SPEC §2 measurements have not completed in a single successful built-driver run. No visual mismatch is claimed without that evidence. Windows standard-gate success does not prove this Linux-only driver passed.

## Findings from run 39127781435 (541c462)

Evidence: commit comment on 541c462, `built-app QA, in its own words`, containing the phase file and report JSON. These supersede the earlier lack of diagnostics.

| ID | What / repro | Expected | Actual / evidence | Severity | Responsible / status |
|---|---|---|---|---|---|
| QA-004 | Launch built app with driver; Settings → Agent access. | Pairing controls render without a boundary. | Console: `[boundary] Agent access: Cannot read properties of undefined (reading 'get')`; stack points to `AgentAccessCard`. Source reads `bridge.extensionPair.get()` in `SettingsView.tsx`. Root cause beyond this missing object is not yet proven. | High: settings feature unavailable | Application bridge/settings owner; exact fleet branch unknown. Report only; no application edit. |
| QA-005 | Same run: driver checks `.ob-render-error` while visiting settings. | Boundary detection rejects the actual fallback; report cannot say all sections rendered cleanly. | All section `renderErrors` values are zero despite QA-004. `ErrorBoundary.tsx` renders `role="alert"` with `This page could not render`, not `.ob-render-error`. Report incorrectly sets `ok: true`. | High: false-positive QA | QA lane; selector and console-boundary failure policy need correction. |
| QA-006 | Finish built driver, write report, close app. | Driver exits within shutdown deadline, leaving no owned child processes. | Phase file reaches `report written; closing app` at 12:35:51; external deadline exits 124 at 12:44:43. Setup completed within seconds. Evidence locates the stall after report write, not apt installation. Exact live handle/call still unproven. | QA blocker | QA lane; bounded shutdown/owned-fixture cleanup needed. |
| QA-007 | Fixture `ollama` is prepended to PATH before app launch; later serve test checks port 11434. | Exercise actual serve start/stop ownership, distinguish boot-owned fixture from unrelated server. | Port already responds and driver skips. App has boot auto-start, so the skip does not establish an unrelated server. Ownership not checked. | QA coverage blocker | QA lane; inspect isolated profile's PID and establish fixture ownership before any stop. Never kill by port. |
| QA-008 | Read SPEC §2 report values `composerRadius=0px`, `settingsPadding=0px`. | Measure panel surface and actual padded settings body/header. | Driver measures textarea radius and settings outer container. Source has textarea radius 0, `.ob-composer-surface` radius variable, and `.ob-settings-body` horizontal padding 28px. These values cannot establish a visual defect. | Medium: misleading evidence | QA lane; correct measurement targets before reporting visual mismatches. |

The observed sidebar 260px, titlebar 44px, send 32×32px, settings navigation 220px, heading 15px, and conversation-width token 760px match the corresponding SPEC §2 defaults in this run. This is a limited comparison, not full typography/geometry acceptance.
