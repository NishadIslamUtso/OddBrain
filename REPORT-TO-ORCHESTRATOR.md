# REPORT TO ORCHESTRATOR — core lane

**Status: core follow-up green on CI; ready for orchestrator judgment, not merged.** Branch `arena/9781cd95-oddbrain`; main comparison point `a6c7807`. The prior broad commit `9f0772b` remains in ancestry. This follow-up changes the core smoke harness, a cross-platform switch test, and (under ruling #3) exactly the two shared date-label files plus tests. It does not undo the frozen non-core files in that earlier commit. No merge was attempted.

## Gate on this worktree (app directory)

| Step | Exact outcome |
| --- | --- |
| `npm ci --ignore-scripts && node node_modules/electron/install.js` | `npm ci` succeeded; Electron install exited 1 with `TypeError: fetch failed`. |
| One prescribed retry, `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js` | Exited 1 with `TypeError: fetch failed`. No Electron executable is installed. |
| `npx tsc --noEmit` | Exited 0, no diagnostics. |
| `npx vitest run` | **117 test files passed; 813 tests passed; zero failed.** From the current full run, not the reference snapshot. |
| `npm run build` | Exited 0; both renderer builds each logged two CSS-optimizer warnings for `::highlight(...)` (find highlights). |
| `npm run smoke` | **Not run locally:** Electron postinstall and its one prescribed mirror retry failed again. No local `SMOKE OK SCROLL OK errors=0 warnings=0` claim. CI's successful native smoke steps are the available proof under ruling #3. |
| CI | Run `39126226627` on `245684f` failed Windows Tests and Linux Smoke. Run [`39127459326`](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39127459326) on follow-up `bd36e2c` **succeeded on Linux and Windows**, including Tests and native Smoke on both. `gh run view --job ... --log` returned EOF from the log-download host, so I cannot quote either runner's literal `SMOKE OK SCROLL OK ... errors=0 warnings=0` line. Both Smoke steps exited successfully under the nonempty-screenshot, console-clean, scroll-OK gate (scroll-probe exceptions now also fail). |

Current-run evidence: `/tmp/oddbrain-core-fix-{install,electron,mirror,tsc,vitest,build}.log` (sandbox-local, not Git deliverables).

## Contract comparison: `reference/session-v2/README.md` vs main `WHAT-EXISTS.md`

1. **Approval-time auto-keep:** pre-brief core in `src/main/engine/{claudeCode,checkpoints}.ts`, `src/main/automation/service.ts`, and `src/renderer/src/ui/AutomationControls.tsx` reads the saved switch at each app-card approval, saves before Allow and denies on snapshot failure. Off stops new copies, not old restore points. `tests/auto-keep-toggle.test.ts` exercises On/Off during one session and failure-deny. This cannot protect agy/full-speed/bypass actions that never raise an app approval card. This landing makes checkpoint-list failure an error instead of false empty success (`src/main/index.ts`, typed preload/bridge, control).
2. **Second-pass:** `src/main/automation/{service,reviewer,inferencePolicy}.ts` and `src/main/index.ts` isolate a text-only, opt-in report from executable work. No tool schema, tool execution, review loops or work-turn overwrite; separate cloud-review consent and an explicitly selected reviewer for agy. This landing rejects single-object function requests as well as tool-call arrays (`tests/reviewer-readonly.test.ts`); browser preview refuses saved-switch/review success (`src/renderer/src/platform/bridge.ts`). `tests/automation.test.ts` covers defaults, priority, cancellation and timeout.
3. **Memory:** `src/main/memoryFiles.ts`, `src/main/index.ts`, `src/main/engine/houseRulesDeploy.ts`, `src/renderer/src/state/memory.ts` and `components/MemorySection.tsx` read/delete in the selected folder and refresh after actual turn completion; no fixed timer. This landing refuses missing/unreadable selected folders, reports skipped files and avoids a false empty state or stale file list. The House rules save path now preserves the selected folder. `tests/feature-retention-fixes.test.ts` and `tests/engine-memory-files.test.ts` cover paths and files. **Ruling #3 fix:** the two authorized shared files `src/shared/lib/{houseRules,memory}.ts` now instruct the current local date instead of labeling a hard-coded old date as today. `tests/houseRules.test.ts` rejects the stale example; `tests/feature-retention-fixes.test.ts` advances a fake clock across midnight and checks the new heading.
4. **Artifacts:** `src/main/artifacts/{store,ipc}.ts`, `components/ArtifactsView.tsx` and App's existing query wiring supply real type/search/name-or-newest controls in the library layouts and on-disk Trash with versions, titles, non-overwriting restore and deletion-safe chat re-adoption. This landing hardens active-folder/version, Trash and index symlink handling, exclusive metadata/version/index writes and failure reports. `tests/feature-retention-fixes.test.ts`, `tests/artifacts-store.test.ts`, `tests/core-renderer.test.ts` exercise recovery and controls. Symlink creation may be denied on Windows; those filesystem-specific assertions skip rather than claim a proof there.
5. **Project/context/display/copy:** `components/ProjectsView.tsx` persists project renames; `components/EnginePanel.tsx` shows only *reported* usage, not an invented zero-turn claim; the existing `streamReplies` setting in `SettingsView.tsx` controls `MessageRow.tsx` while cards and Stop remain live. `ui/CopyText.tsx`, `EnginePanel.tsx` and `MessageRow.tsx` copy a turn, message, reply or stored text source, and offer selectable original text if the clipboard rejects a write. `tests/core-renderer.test.ts`, `tests/engine-finale.test.ts` and `tests/engine-compact.test.ts` cover the controls, totals and brief-on-refused-send behavior.

**Refusals / main wins:** I did not port the reference's web simulation, media/provider/dictation additions, stores, launch/visual system, unrelated downloads or README cleanup into this landing. Main's engine binary override, Ollama boot-start, spawn/PATH/pid behavior, loader, connector doors and the two-engine boundary remain untouched here. The pre-brief commit had already imported substantial v2 code; the above distinguishes existing branch behavior from the fixes in this landing. The reference RESULTS file is evidence for its *separate snapshot*, not proof of native operation here.

## Ruling #3: CI failures on `245684f`

- **Windows Tests:** `tests/core-engine-switch.test.ts` had counted the Windows `taskkill` helper as a third engine session. The fixture now separates helpers from engine children, simulates the helper killing its target pid, and runs the same two-session/stale-event assertions with explicit `linux` and `win32` adapters on either host. No sleep or weaker session-count assertion. The full local suite and Windows CI Tests passed on `bd36e2c`.
- **Linux Smoke:** run `39126226627` reported `SMOKE BLANK SCROLL OK` (empty Electron capture, despite a working DOM scroller). Ruling commit `b6e4e1d` passed Linux smoke with no code change to the capture path; that suggests timing or visibility, not a proven renderer exception. `src/main/index.ts` now shows the actual smoke window, waits for its scroller and two animation frames, and retries an empty real capture only while the compositor has up to 10 seconds to paint. It still exits nonzero on a blank capture, any console error/warning, or any non-OK scroll result (including probe exceptions); the output now includes capture dimensions and visibility for diagnosis. **CI's Linux and Windows native Smoke steps passed on `bd36e2c`; literal log lines were unavailable through `gh` (download EOF).**

**Unproven:** local Electron smoke (binary fetch blocked); real signed-in claude-code/agy turns, permission-card protection on the owner's Windows machine, real Ollama/remote review service, and Windows folder/symlink behavior. CI's successful native smoke is runner proof, not a signed-in owner-machine run. No merge requested.

## Frozen, awaiting merge — pre-brief `9f0772b` out-of-lane paths

The exact paths below were changed by the earlier broad commit and were **not edited in this follow-up**. The two shared date-label files are excluded here because ruling #3 expressly authorized this fix; all other shared-library glue stays frozen. Non-core media/visual sections already present in mixed files `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/{App.tsx,platform/bridge.ts,components/{ChatView,Composer,EnginePanel,MessageRow,SettingsView}.tsx}` were likewise left intact; only core-specific hunks in those files changed. The preload/bridge type changes are necessary IPC glue and were granted under ruling #3.

- `WHAT-EXISTS.md`
- `apps/03_oddbrain/.gitignore`
- `apps/03_oddbrain/electron-builder.yml`
- `apps/03_oddbrain/package-lock.json`
- `apps/03_oddbrain/package.json`
- `apps/03_oddbrain/scripts/build-ui-preview.mjs`
- `apps/03_oddbrain/scripts/check-electron-automation.cjs`
- `apps/03_oddbrain/scripts/check-ui-market.cjs`
- `apps/03_oddbrain/scripts/check-ui-media.cjs`
- `apps/03_oddbrain/scripts/check-ui-motion.cjs`
- `apps/03_oddbrain/scripts/check-ui-standalone.cjs`
- `apps/03_oddbrain/scripts/check-ui-turns.cjs`
- `apps/03_oddbrain/scripts/check-ui.cjs`
- `apps/03_oddbrain/src/main/cloud/media.ts`
- `apps/03_oddbrain/src/main/engine/claudeMarketplace.ts`
- `apps/03_oddbrain/src/main/engine/downloads.ts`
- `apps/03_oddbrain/src/main/engine/mediaVision.ts`
- `apps/03_oddbrain/src/main/engine/runtimeZip.ts`
- `apps/03_oddbrain/src/main/uiLaunch.ts`
- `apps/03_oddbrain/src/main/uiPreview.ts`
- `apps/03_oddbrain/src/main/windowBounds.ts`
- `apps/03_oddbrain/src/renderer/index.html`
- `apps/03_oddbrain/src/renderer/src/assets/wordmark.svg`
- `apps/03_oddbrain/src/renderer/src/components/AppNav.tsx`
- `apps/03_oddbrain/src/renderer/src/components/ClaudeMarketplacesSection.tsx`
- `apps/03_oddbrain/src/renderer/src/components/EngineDownloadsSection.tsx`
- `apps/03_oddbrain/src/renderer/src/components/HouseRulesSection.tsx`
- `apps/03_oddbrain/src/renderer/src/components/MediaProviderPicker.tsx`
- `apps/03_oddbrain/src/renderer/src/components/MemoryMap.tsx`
- `apps/03_oddbrain/src/renderer/src/components/ModsSection.tsx`
- `apps/03_oddbrain/src/renderer/src/components/ReadAloudButton.tsx`
- `apps/03_oddbrain/src/renderer/src/components/Sidebar.tsx`
- `apps/03_oddbrain/src/renderer/src/components/TitleBar.tsx`
- `apps/03_oddbrain/src/renderer/src/components/TodayView.tsx`
- `apps/03_oddbrain/src/renderer/src/components/WatchSection.tsx`
- `apps/03_oddbrain/src/renderer/src/lib/imageReader.ts`
- `apps/03_oddbrain/src/renderer/src/lib/mediaFile.ts`
- `apps/03_oddbrain/src/renderer/src/lib/videoFrames.ts`
- `apps/03_oddbrain/src/renderer/src/main.tsx`
- `apps/03_oddbrain/src/renderer/src/motion/Mascot.tsx`
- `apps/03_oddbrain/src/renderer/src/motion/motionMode.ts`
- `apps/03_oddbrain/src/renderer/src/state/appearance.ts`
- `apps/03_oddbrain/src/renderer/src/state/look.ts`
- `apps/03_oddbrain/src/renderer/src/state/lookLab.ts`
- `apps/03_oddbrain/src/renderer/src/state/quickPreference.ts`
- `apps/03_oddbrain/src/renderer/src/state/watch.ts`
- `apps/03_oddbrain/src/renderer/src/styles/desktop.css`
- `apps/03_oddbrain/src/renderer/src/ui/AppBoundary.tsx`
- `apps/03_oddbrain/src/renderer/src/ui/AppearancePanel.tsx`
- `apps/03_oddbrain/src/renderer/src/ui/AppearancePreview.tsx`
- `apps/03_oddbrain/src/renderer/src/ui/ChatHome.tsx`
- `apps/03_oddbrain/src/renderer/src/ui/ComposerSurface.tsx`
- `apps/03_oddbrain/src/renderer/src/ui/DesktopShell.tsx`
- `apps/03_oddbrain/src/renderer/src/ui/EngineActivity.tsx`
- `apps/03_oddbrain/src/renderer/src/ui/InteractiveBrain.tsx`
- `apps/03_oddbrain/src/renderer/src/ui/LaunchOverlay.tsx`
- `apps/03_oddbrain/src/renderer/src/ui/LookContext.tsx`
- `apps/03_oddbrain/src/renderer/src/ui/MotionContext.ts`
- `apps/03_oddbrain/src/renderer/src/ui/ProfileButton.tsx`
- `apps/03_oddbrain/src/renderer/src/ui/exportPreview.ts`
- `apps/03_oddbrain/src/renderer/src/ui/lookCatalog.ts`
- `apps/03_oddbrain/src/renderer/src/ui/sceneCatalog.ts`
- `apps/03_oddbrain/src/shared/lib/attachments.ts`
- `apps/03_oddbrain/src/shared/lib/automation.ts`
- `apps/03_oddbrain/src/shared/lib/design-systems/index.ts`
- `apps/03_oddbrain/src/shared/lib/documentReader.ts`
- `apps/03_oddbrain/src/shared/lib/engineMarketplace.ts`
- `apps/03_oddbrain/src/shared/lib/media.ts`
- `apps/03_oddbrain/tests/accent-contrast.test.ts`
- `apps/03_oddbrain/tests/appearance.test.ts`
- `apps/03_oddbrain/tests/claude-marketplace.test.ts`
- `apps/03_oddbrain/tests/design-systems-wiring.test.ts`
- `apps/03_oddbrain/tests/desktop-launch-export.test.ts`
- `apps/03_oddbrain/tests/desktop-look.test.ts`
- `apps/03_oddbrain/tests/desktop-motion.test.ts`
- `apps/03_oddbrain/tests/document-reader.test.ts`
- `apps/03_oddbrain/tests/fixtures/ui-retention.json`
- `apps/03_oddbrain/tests/honest-defaults.test.ts`
- `apps/03_oddbrain/tests/media-provider.test.ts`
- `apps/03_oddbrain/tests/read-aloud.test.ts`
- `apps/03_oddbrain/tests/retention-inventory.test.ts`
- `apps/03_oddbrain/tests/runtime-zip.test.ts`
- `apps/03_oddbrain/tests/takes.test.ts`
- `apps/03_oddbrain/tests/watch-boundary.test.ts`
- `apps/03_oddbrain/tests/window-bounds.test.ts`
