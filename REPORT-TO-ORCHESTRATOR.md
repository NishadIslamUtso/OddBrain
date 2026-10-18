# REPORT TO ORCHESTRATOR — core lane

**Status: core contract items 1–5 implemented and locally tested; CI for this test-only endgame update is pending.** Branch `arena/9781cd95-oddbrain`; main comparison point `a6c7807`. The prior broad commit `9f0772b` remains in ancestry. Ruling #3's cross-platform fixes and the authorized date-label correction already landed in `bd36e2c`; ruling #4 confirmed green CI. This update adds focused regressions for completion-driven memory refresh and artifact sorting, not another feature lane. Frozen non-core paths were not edited; no merge was attempted.

## Gate on this worktree (app directory)

| Step | Exact outcome |
| --- | --- |
| `npm ci --ignore-scripts && node node_modules/electron/install.js` | `npm ci` succeeded; Electron install exited 1 with `TypeError: fetch failed`. |
| One prescribed retry, `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js` | Exited 1 with `TypeError: fetch failed`. No Electron executable is installed. |
| `npx tsc --noEmit` | Exited 0, no diagnostics. |
| `npx vitest run` | **118 test files passed; 814 tests passed; zero failed.** From the full run after the endgame test changes, not the reference snapshot. |
| `npm run build` | Exited 0; both renderer builds each logged two CSS-optimizer warnings for `::highlight(...)` (find highlights). |
| `npm run smoke` | **Not run locally:** Electron postinstall and its one prescribed mirror retry failed again. No local `SMOKE OK SCROLL OK errors=0 warnings=0` claim. CI's successful native smoke steps are the available proof under ruling #3. |
| CI | Runs [`39127625053`](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39127625053) on `a17a4ee` and [`39127797062`](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39127797062) on ruling commit `d99dad7` passed Linux and Windows Tests and native Smoke. **CI on the endgame test change is pending.** `gh run view --job ... --log` returned EOF from the log-download host, so I cannot quote the runners' literal `SMOKE OK SCROLL OK ... errors=0 warnings=0` lines. Smoke steps did exit successfully under the nonempty-screenshot, console-clean, scroll-OK gate. |

Current-run evidence: `/tmp/oddbrain-core-endgame-{ci,electron,mirror,tsc,vitest,build}.log` (sandbox-local, not Git deliverables).

## Contract comparison: `reference/session-v2/README.md` vs main `WHAT-EXISTS.md`

1. **Approval-time auto-keep:** pre-brief core in `src/main/engine/{claudeCode,checkpoints}.ts`, `src/main/automation/service.ts`, and `src/renderer/src/ui/AutomationControls.tsx` reads the saved switch at each app-card approval, saves before Allow and denies on snapshot failure. Off stops new copies, not old restore points. `tests/auto-keep-toggle.test.ts` exercises On/Off during one session and failure-deny. This cannot protect agy/full-speed/bypass actions that never raise an app approval card. The core landing makes checkpoint-list failure an error instead of false empty success (`src/main/index.ts`, typed preload/bridge, control). **Named proof:** `tests/auto-keep-toggle.test.ts` — “Auto-keep On/Off is read at each approval in the same live session; old copies still restore” and “backup failure still fails closed when Auto-keep is On.”
2. **Second-pass:** `src/main/automation/{service,reviewer,inferencePolicy}.ts` and `src/main/index.ts` isolate a text-only, opt-in report from executable work. No tool schema, tool execution, review loops or work-turn overwrite; separate cloud-review consent and an explicitly selected reviewer for agy. This landing rejects single-object function requests as well as tool-call arrays (`tests/reviewer-readonly.test.ts`); browser preview refuses saved-switch/review success (`src/renderer/src/platform/bridge.ts`). **Named proof:** `tests/automation.test.ts` — “safe defaults preserve backups but never silently add background/cloud calls,” “Off means no call; On reviews successful normal work exactly once, not errors/closures,” “new work preempts an active reviewer, and late results cannot overwrite cancellation,” and “a timeout clears a non-responsive reviewer without blocking subsequent work.” `tests/reviewer-readonly.test.ts` — “a real text review sends no tool schema/session/permissions and never executes model output,” “a single-object function request is also refused, even if the response says CLEAN,” “agy is not falsely treated as a technically read-only agent; an explicit safe reviewer works,” and “cloud review needs explicit consent and uses the existing permission/key-gated client.”
3. **Memory:** `src/main/memoryFiles.ts`, `src/main/index.ts`, `src/main/engine/houseRulesDeploy.ts`, `src/renderer/src/state/memory.ts` and `components/MemorySection.tsx` read/delete in the selected folder and refresh after actual turn completion; no fixed timer. This landing refuses missing/unreadable selected folders, reports skipped files and avoids a false empty state or stale file list. The House rules save path now preserves the selected folder. `tests/feature-retention-fixes.test.ts` and `tests/engine-memory-files.test.ts` cover paths and files. **Ruling #3 fix:** the two authorized shared files `src/shared/lib/{houseRules,memory}.ts` now instruct the current local date instead of labeling a hard-coded old date as today. **Named proof:** `tests/feature-retention-fixes.test.ts` — “selected memory directory controls real reads/removals, refuses stale and linked files,” “a memory pass uses the current local date, including after midnight,” and “selected memory folder appears in both rules and pass without mutating the owner rules.” `tests/houseRules.test.ts` — “auto-keep is in the rulebook: the engine knows its memory file during normal work” rejects the stale sample. `tests/engine-memory-files.test.ts` — “removes exactly the named file, then reads as gone.” New `tests/core-memory-completion.test.ts` — “a sent memory pass refreshes real files on turn completion, not on an intermediate event or timer”; sends through the engine store, fires a status event and advances a fake clock 30 seconds without refreshing, then a done event re-reads the file.
4. **Artifacts:** `src/main/artifacts/{store,ipc}.ts`, `components/ArtifactsView.tsx` and App's existing query wiring supply real type/search/name-or-newest controls in the library layouts and on-disk Trash with versions, titles, non-overwriting restore and deletion-safe chat re-adoption. This landing hardens active-folder/version, Trash and index symlink handling, exclusive metadata/version/index writes and failure reports. **Named proof:** `tests/core-renderer.test.ts` — “artifact type/search/sort controls use real items and Trash recovery is an explicit desktop request”; its rendered grid changes from newest-first to name order. `tests/feature-retention-fixes.test.ts` — “Trash recovery preserves the title and every version without overwriting an active artifact,” “re-adopting a chat cannot undo deletion, even when the Trash metadata is damaged,” and the traversal/symlink refusal cases. `tests/artifacts-store.test.ts` — “a new version is appended, and identical content is not a version at all” and “removing moves the files aside — it does not destroy them.” Symlink creation may be denied on Windows; those filesystem-specific assertions skip rather than claim proof there.
5. **Project/context/display/copy:** `components/ProjectsView.tsx` persists project renames; `components/EnginePanel.tsx` shows only *reported* usage, not an invented zero-turn claim; the existing `streamReplies` setting in `SettingsView.tsx` controls `MessageRow.tsx` while cards and Stop remain live. `ui/CopyText.tsx`, `EnginePanel.tsx` and `MessageRow.tsx` copy a turn, message, reply or stored text source, and offer selectable original text if the clipboard rejects a write. **Named proof:** `tests/core-renderer.test.ts` — “editing a project name sends the changed name through the existing project persistence door,” “final-only hides only live answer/thinking; the completed text still appears,” “individual message, saved text source, context, and finished reply have their own copy controls,” and “clipboard refusal never says Copied and offers selectable original text.” `tests/engine-finale.test.ts` — “the totals accumulate across turns, honestly scoped to the window” and “the turn copies as the order plus the words; totals format honestly.” `tests/engine-compact.test.ts` — “a refused send cannot consume a queued brief; only an accepted send consumes that same brief.”

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
