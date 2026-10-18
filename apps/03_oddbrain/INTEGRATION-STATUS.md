# Integration status · 2026-10-18

## Sources and retained UI

- Current-main baseline: `a6c780768b77e50870bc297c928b7d84709a0697`.
- Uploaded workspace: `agent-resources` at `d1e3402282ba922571bc81de3ea20dec760cbc67`, `reference/session-v2/files/` (94 files).
- Uploaded implementation baseline: `2f05dac9a5f7a191104377ef940f81e76b9ebd74`.
- Session branch: `arena/d3c1ee25-oddbrain`.

Integrated with per-file three-way comparison, not the uploaded old-baseline replacement installer. Ten conflicts were reviewed manually. No reset or remote merge has been performed. The user subsequently authorized committing/pushing only the session branch and running Windows checks, without merging main or publishing a release.

The renderer uses the uploaded structural UI: eight presets, eight layouts, nine original palettes plus app default, four styles, all 77 SVG scenes, eight role assignments, shared Home/Chat miniature, saved mixes/import/export, comparison/quiz/notes/shortlist/gallery, interactive home mascot, launch assembly, seven main screens and eighteen Settings destinations. Auto-keep and isolated automatic review have independent operational controls. The app-default light palette is neutral grey/white rather than beige; existing optional palettes remain available. Default typography and sizing are retained.

Newer main behavior remains: engine PATH/staging/binary overrides, Ollama startup, engine-owned models, connector setup, error boundaries, find/scroll, existing packs and sixteen supplemental token themes. Those themes are additional choices, not substitutes for the uploaded UI inventory. Live miniatures and the shell resolve the same tokens.

## Functional repairs and integrations

### Runtime, windows and speech

- Official runtime downloads stream to disk and hash incrementally. Sequential/file-backed extraction checks sizes, aggregate size, CRC, paths, links and encryption, and stages before swapping the active runtime. A failed extraction leaves the previous runtime and record intact. Ollama-only limits permit its large Windows DLL without relaxing community pack limits.
- Normal/quick dimensions and minimums clamp to Electron's logical work area, including scaled/small displays.
- Read-aloud controls on engine/chat replies select on-device voices only. Stop and unmount cancel playback. Missing voices produce an explanation, not a remote fallback.
- Dictation can record a user-started clip for an explicitly selected media model. It appends to the current draft and never auto-sends. Pending microphone permission, recording and transcription can be cancelled; stale callbacks cannot append a cancelled transcript or interfere with a newer recording. Limits are three minutes/24 MB. Native speech recognition is a separate fallback only when `processLocally` is available; no remote browser recognition is silently enabled.
- Queued image tasks retain their image payload. Sending waits for attachment decoding. Standard images have header/pixel limits and must actually decode before becoming native image attachments.

### Attachments and media

- Added guarded media IPC, preferences, Settings controls, cancellation/progress and a killable decoder worker. The worker receives no provider key store and its environment is restricted to OS/temp paths, without inherited credentials or Node flags. This is process/thread isolation and resource limiting, not an OS security sandbox.
- Local PDF text extraction and bundled English OCR run without downloading fonts, scripts, models or language data. PDF limits: 80 text pages, 20 OCR pages, 180,000 extracted characters. Raster input is header-limited to 32 MP and scaled before OCR.
- Local legacy Word `.doc`, and saved-value `.xls`, `.xlsb`, `.ods`, `.fods` extraction are implemented in the worker. Existing bounded DOCX/ODT/PPTX/XLSX archive/XML extraction remains. Macros/formulas/connections are not executed. Limitations concerning embedded content are attached or displayed explicitly.
- Local failure never grants provider consent. A file requires explicit confirmation of the exact chosen media model; there is no substitute/retry. Network requests also require media network consent, cloud inference permission, enabled provider and its saved key. A configured custom loopback server requires local/provider access. Configuration revisions invalidate confirmations when the destination/access changes, including during recording.
- Explicit transports: Gemini native image/audio/video/PDF; Anthropic image/PDF; OpenAI-compatible image requests; OpenAI/custom PDF Responses requests; OpenAI/Groq/custom transcription. An incompatible format/model fails explicitly. Provider token/safety/incomplete stops are not presented as complete extraction. These API paths have transport/privacy tests, not authenticated live-model acceptance.
- Browser-decodable video can still become bounded, timestamped local still frames, with an explicit warning that audio/unsampled content was not read. A separate confirmed model route handles native media. Video processed through a transcription endpoint is labelled speech-only, not visual analysis.
- The agy adapter's native image wire remains unverified. Image/video uploads with agy selected therefore go through the separately confirmed media model and become attributed text, rather than queuing an image that agy cannot send.
- Long extractions open a keyboard-modal excerpt selector. The full extraction remains inspectable/downloadable; only an explicitly approved excerpt is attached, with an excerpt label. Plain UTF-8 text over the per-attachment budget uses the same selector. Nothing is silently cut. Budgets remain 12,000 characters per text attachment, four attachments and 20,000 characters per combined engine prompt.
- Workers/shared chunks and their production dependency graph are unpacked to real filesystem paths for packaged PDF imports, OCR/WASM and native canvas bindings. Windows CI now checks those packaged dependencies under Electron; this check has **not run yet** for these changes.

### Engine Store

- Added source-labelled OddBrain packs / Claude Code marketplaces / agy catalog selection. Existing pack features remain mounted/preserved; opening Store does not automatically fetch a community index or run a CLI.
- Claude catalog reads and source add/refresh/remove plus plugin install/update/uninstall use the official CLI, never hand-written plugin copies. Mutations require exact, owner-bound, single-use command cards with expiry and serialization. User scope is explicit. Closing a window clears its pending plans.
- Publisher-supplied commands require a separate card displaying the CLI's actual command declaration. Approval passes only the CLI-issued `--accept-command <sha256>` for that declaration. No `--yes`, force flag or automatic command acceptance is used. The CLI validates plugin/catalog binding; a changed declaration requires fresh review.
- An official agy marketplace/install command surface has not been verified in OddBrain and is not enabled. Existing agy skill deployment remains. This is an upstream verification/integration limit, not a completed agy marketplace implementation.

## Verification executed here

- Baseline before integration: **99 test files / 723 tests passed**.
- Current complete unit/regression suite: **114 files / 807 tests passed**.
- App typecheck, and separate typecheck of the new media/marketplace tests: passed.
- `npm run build`: passed for main/preload/renderer/worker and same-renderer offline HTML. Existing CSS optimizer warnings concern the valid `::highlight` pseudo-element; build succeeds.
- All **six** `npm run test:ui` scripts passed. Coverage includes eight layouts × seven screens at 940×620, target 1536×816 composer geometry, Appearance persistence/mixes, 77-scene controls/export, mascot reactions, approval fixtures, reduced motion/quick mode, offline file/viewer/sandbox exports, image queue retention, speech fixtures, microphone/transcription cancellation races, full-text download/excerpt approval, Office fallback and Store second-pass command cards. Browser QA uses software rendering; speech/recorder/bridge fixtures are explicitly not OS/device/provider proof.
- Actual built worker execution passed: PDF text layer, raster OCR, scanned-PDF rendering + OCR, XLS/XLSB/ODS/FODS saved values, a real legacy Word 97 OLE document, and corrupt-file refusals. The small licensed Word fixture and reproducible check are included. These were real decoder runs, not mocked extraction results.
- Actual marketplace service execution with official Claude Code **2.1.302** passed in a separate QA-only config directory: read 315 cached official catalog entries, install `frontend-design`, observe installed state, update, uninstall. A separate harmless local command-source plugin exercised real CLI refusal, the actual `shownCommand.sha256` second card, wrong-owner refusal, successful hash-approved installation, and uninstall. The command only printed the path of a QA plugin containing static text; no unreviewed third-party executable command ran. Test plugins were uninstalled; the temporary command marketplace was removed. No user's real engine configuration was modified.
- `npm audit`: **zero vulnerabilities**, including development dependencies, after the compatible Vite/Vitest toolchain and transitive dependency updates. Node requirement is now >=22.13.
- `git diff --check`: passed.
- With explicit user approval, implementation commit `e5cec77a3165ec2ce030c654f012bad921b4fc6c` was pushed only to the session branch. [GitHub checks run 39119166754](https://github.com/NishadIslamUtso/OddBrain/actions/runs/39119166754) **passed on both Windows and Linux**: types, tests, build, actual offline PDF/OCR/Office worker execution and Electron window/console smoke. This is real runner execution, not the browser bridge. Raw log download redirects were blocked in this sandbox; the run/job/step conclusions were obtained directly from the GitHub API.
- Manual `installer` dispatch was rejected with HTTP 403 (`Resource not accessible by integration`). The automatic push checks did run successfully; the separate installer/package verification has not yet run.

Reproducible commands: `npm test`, `npm run typecheck`, `npm run test:ui`, `npm run test:media:native`. `scripts/check-electron-media.cjs` additionally exercises a supplied packaged worker path under Electron. Detailed logs/screenshots/CLI receipts in this sandbox are outside the repository at `/home/user/oddbrain-integration/`.

## Acceptance still required

This is not an installed-Windows acceptance claim or a claim that every planned external integration is finished.

- Electron binary downloads failed through both its installer and GitHub release download because the redirected release-assets host is blocked here. No local Electron binary or Windows installer/ASAR execution has been verified in this sandbox. Windows CI has now verified an unpackaged Electron window smoke and the actual offline decoder worker; it has not verified installation or a physical microphone/playback device.
- Existing Windows/Linux workflows now include offline decoder execution. The Windows installer workflow also checks its unpacked worker dependencies under Electron. Windows/Linux push checks passed for `e5cec77`; the separate installer dispatch was blocked by GitHub Actions permissions. No signing certificate has been added; the existing unsigned-installer policy remains.
- Real Windows 1920×1080 at 125% scaling, installation/startup/relaunch, OS microphone permissions, audible speech playback, authenticated model turns, global hotkeys and live browser-extension/provider integration still require native acceptance. Fixtures and Linux worker runs are not substitutes.
- The agy catalog remains gated on verified official support. Corrupt/encrypted/DRM/unknown files and unsupported provider/model combinations cannot be promised readable.
- Jarvis/wake-word/persistent voice and repository/README redesign remain parked as requested.

The live browser preview is the actual renderer with an honest browser-only bridge, not a Windows desktop installation. Generated artifacts, OCR caches and large dependencies are ignored or outside source control.
