# QA findings

Only reproduced observations belong here. A blocked run is not proof of an app defect.

| ID | What / repro | Expected | Actual / evidence | Severity | Responsible / status |
|---|---|---|---|---|---|
| QA-001 | Built driver: launch fresh profile, visit default Chat, assert stored view equals `chat`. | Driver respects the initial default without requiring a state change. | Run 39123828400: `null !== 'chat'`. App writes on change; this was a harness error, not an app defect. | QA blocker | QA lane; fixed in 9c0cf16. Other view switches remain strict. |
| QA-002 | Linux built-app QA, run 39125100489. | Driver completes or emits diagnostic evidence before timeout. | Step failed with empty log; prior Types, Tests, Build, renderer checks and Smoke succeeded. Exact stalled phase was not established. | QA blocker | QA lane; file breadcrumbs and phase deadlines added following rulings #3/#4; rerun pending. |
| QA-003 | Linux renderer workflow readiness and dependency setup. | Every network/setup/readiness phase has a finite deadline. | Workflow had a 20-minute outer limit, but Playwright installation had no phase deadline; curl readiness could exceed its nominal retry window because requests lacked timeouts. Source inspection, plus ruling #3 scanner observation. | QA reliability | QA lane; 10-minute outer limit, 240-second install, 90-second readiness with bounded curl added; rerun pending. |

## Not yet established

All seven built views, all 18 settings sections, both fixture IPC regressions, and SPEC §2 measurements have not completed in a single successful built-driver run. No visual mismatch is claimed without that evidence. Windows standard-gate success does not prove this Linux-only driver passed.
