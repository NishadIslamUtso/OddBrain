# OddBrain app code · corrected package v2

**This is application source, not the old HTML/spec handoff. Use this package instead of v1.**

Target: OddBrain v0.9.0 source snapshot `2f05dac9a5f7a191104377ef940f81e76b9ebd74`, in `apps/03_oddbrain`. The apply tool accepts either that baseline or the exact earlier UI-code package. Other edits are refused, not overwritten.

## What was corrected

The follow-up check was right: v1 lacked equivalent Auto-keep and automatic second-pass controls. Those now have real main-process behavior. The broader audit also restored missing artifact, project, context and memory controls.

- **Auto-keep On/Off, House rules:** the running Claude Code session reads the saved preference at each approval. On takes the existing file snapshot before Allow; backup failure still denies the write. Off stops new app copies without removing older restore points. Full copy history, restricted content inspection and confirmed restore/undo are available. This protects file edits approved through app cards; it cannot intercept actions that bypass those cards (for example agy/full-speed actions). The UI states that limit.
- **Automatic second-pass On/Off, Engine:** schedules one text-only model review after successful normal work and an idle interval. New work has priority; cancellation, timeout, duplicate completion and queue limits are handled. Reports do not replace the completed work turn. Manual Review uses the same protected path.
- **Technical report-only boundary:** the reviewer is an isolated text transport, not an agent turn. No app tools, filesystem reader/writer, commands, approvals or hooks are available. Ollama requests contain no tool schema; unexpected tool requests are refused rather than dispatched. Saved-key providers use the existing key/permission client, also without tools. No review-result event is fed back into normal work, so it cannot trigger a review loop or turn-done hook.
- **Reviewer choice and privacy:** default is the selected engine's model where a text-only API exists. There is no silent substitute. agy needs an explicitly chosen local/saved-key reviewer because its agent has no verified tool-free channel. Extra reviews are opt-in (default Off). Cloud/network review is separately Off by default and checked against metadata, not merely model-name suffixes. Keys stay in main; Agent access restrictions apply. The global Cloud inference switch also has a real pre-prompt gate.
- **Artifacts:** Everything/HTML/SVG filters, Newest/Name sort and an in-view search that works in all layouts. Disk Trash can be listed/recovered with versions and titles retained. Legacy trash metadata can be recovered honestly; active id collisions do not overwrite newer artifacts. Paths/symlinks are refused. Re-adoption from an old chat no longer silently undoes deletion. Imported artifacts can also be sent to the composer for a requested change, without automatic sending.
- **Memory:** independent native folder selection, working-folder default, actual reads/deletes and marker-bounded engine instructions pointing to the selected directory. Existing notes are not silently moved. Memory pass refresh follows actual completion, not a fake fixed timer. The pane opens the global actual journal.
- **Other restored controls:** project renaming, streamed/final-only reply display (approvals/Stop stay live), individual message/source copy with an honest blocked-clipboard fallback, rule defaults, explicit saved-watch-order run-once, refreshed turn journal/review reports, inspect/discard pending compaction brief, and old concept/v2 look imports. Refused or oversized sends no longer consume a queued brief. Text attachments ride the actual single normal send path rather than being discarded.

## Retained UI inventory

7 main views (Chat, Artifacts, Today, Projects, Vault, Brain, Code), first-run and Quick window; original 14 Settings sections plus You/Windows/Maps/About = 18. Former profile actions are direct Settings routes.

8 looks, 8 layouts, 9 supplied palettes plus app default, 4 styles, original type treatments plus app sans, native chat fonts/sizes/widths/accent, spacing/sidebar choices, System/Calm/Balanced/Playful/Still, speed/pause, 8 roles and all 77 unchanged SVG assets. Shared-component Home/Chat miniature; named looks, mix/compare/structure/quiz/verdict/notes/shortlist, Markdown/JSON/copy/HTML/SVG/ZIP exports.

Original background/status decorations are removed. The front brain remains local, witty and interactive without microphone/audio/model/tool effects. Launch uses full-window assembly and the new vector lettering, including skip, real paint readiness, one process ticket and reduced motion.

## Package contents

- `files/apps/03_oddbrain/`: actual replacement/new app source, assets, scripts and regression tests at the correct paths.
- `OddBrain-App-UI.patch`: combined Git patch from the reviewed baseline.
- `apply.mjs`, `PATCH-MANIFEST.json`: content/version checks, backups and rollback on write failure. Normalizes only CRLF/LF for compatibility, not arbitrary edits.
- `checks/RETENTION-AUDIT.json` / `.csv`: traceability for all 221 original dispatcher action ids, including aliases. **This is not a claim that 221 independent features were runtime-tested.** Redundant/cosmetic dialogs are consolidated; fake demo actions use genuine native callbacks. `mobile-menu` is intentionally out of scope because the owner specified Windows PC only.
- `checks/RESULTS.json` + logs: exact checks and remaining platform limits.
- `preview/OddBrain-Actual-App.html`: offline build of this same React renderer, not a handwritten substitute or the installed app's runtime. Browser-only native operations report that the installed app is required.

## Apply — for the app agent

Use a working branch, Node >=22.12. From the extracted package:

```text
node apply.mjs "PATH_TO_ODDBRAIN_REPOSITORY" --check
node apply.mjs "PATH_TO_ODDBRAIN_REPOSITORY"
```

The tool verifies all replacements and relevant untouched dependencies before writing. It accepts the original baseline and exact v1 UI-code bytes. Newer/unrelated changes cause refusal; rebase/review the patch, do not force overwrite. It makes `_oddbrain-ui-backup-*` under the target repo, rolls back partial writes, and reapplication is a no-op. It never changes vault contents, installed files, keys, machine preferences, Git configuration or remote branches.

The unified patch can instead be checked/applied with `git apply --check` / `git apply` against the original baseline. An existing v1 tree should use the checked apply tool or a reviewed rebase.

In `apps/03_oddbrain`:

```text
npm ci
npm run typecheck
npm test
npm run build
```

Build produces Electron main/preload/renderer and the same-renderer offline export asset. Windows packaging includes that asset. The existing Windows release/CI setup can then run `npm run dist:win` with its normal fuse/security/installer checks. No new npm dependencies or Windows installer are included here.

Optional renderer checks: install the existing playwright-core Chromium, start `npm run dev:web` separately, then `npm run test:ui`. Set `ODDBRAIN_UI_URL` if not using port 5174. On a Linux display/Xvfb, `node scripts/check-electron-automation.cjs` additionally tests actual Electron main/preload/renderer IPC, filesystem callbacks and an HTTP model stub. This is not an authenticated model/provider test.

## Honest verification boundary

The package was compiled and regression-tested; actual Electron IPC/file/model-stub behavior was exercised as recorded. The owner still needs the normal installed **Windows** checks for OS startup, warm runtime, global hotkey, native dialogs, real provider credentials/models and extension capture. No human-opened Windows installation, remote commit/push/merge or deployment is claimed. The finite checks are not an exhaustive Cartesian-product or a promise of bug-free software.

Repository/README professionalization remains deferred; this README is only for applying and checking the requested app code.
