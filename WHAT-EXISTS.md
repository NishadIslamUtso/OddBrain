# OddBrain: what exists and what still needs work

Updated 2026-10-18. This working tree integrates the recovered v2 UI into baseline `a6c7807`; it does not replace main with the older package. Working branch: `arena/cc83a507-oddbrain`. No Windows release was made.

## Current verification

- **858 tests in 124 files pass.** TypeScript, the Electron production bundles and the web production build pass. The three parked JSX-era tests were rewritten against the current compiler and rendered composer; none remain parked.
- All **eight browser-check scripts pass** against the real React renderer, including the full appearance inventory, navigation/draft preservation, all 18 Settings sections, graph interaction fixtures, engine events, motion, offline export, attachments and slash templates.
- Layout checks include **1536×864**, **1280×820**, **1280×768** and the **940×620** minimum. All eight layouts are checked across seven screens at the minimum size. Native sizing uses Electron's logical work area; it does not apply 125% scale twice.
- The built worker actually decoded text, Office and image fixtures. A real FFmpeg executable processed a short video and audio fixture; encrypted-document refusal, cancellation and unchanged original files were checked. Linux correctly refuses Windows speech recognition rather than substituting another service.
- The official Claude Code **2.1.302** CLI actually added a local fixture marketplace, installed/listed/enabled/disabled/uninstalled an inert plugin in an isolated test profile. Per-action flags and marketplace-list JSON were checked. No real plugin was installed into the owner's profile.
- **Full `npm audit`: 0 advisories**, including development dependencies. Vitest/build tooling and decoder dependencies were updated. Node 22.13 or newer is required.
- Provider transports, microphone lifecycle and speech-voice selection have fixture coverage, **not live-provider or physical-device acceptance**. The Electron runtime download failed here; no installed Windows, signed-in Claude/agy, installer or native multi-window acceptance is claimed.

## App surfaces

| Surface | Purpose and operation | Current state / limits |
|---|---|---|
| Chat and engine turns | One engine send path; model and engine selection, streaming/final-only output, thinking disclosure, Stop, work queue, attachments, compact/queued brief, handoff, review, journal and project selection. Extra composer tools are under More. | Integrated. The engine's own model choice remains the default. Real authenticated turns still need Windows verification. |
| Permissions and restore | Allow/Deny uses the engine's request IDs. With Auto-keep on, a checkpoint must succeed before allowing supported writes. Copies can be inspected and restored. | Fixture-tested. Turning Auto-keep off prevents new copies but keeps old restores. agy and full-speed bypasses cannot be promised the same write interception. |
| Automatic review | Optional text-only second pass after successful work and idle. Normal work preempts it. Manual review uses the same tool-free transport. | Integrated and unit-tested. No agent CLI, tools, commands or approval dispatch in this reviewer. Auto-review and external review default off; unavailable model routes are explained rather than silently replaced. |
| Artifacts | Preview, rewrite/version restore, type filters, search, sorting, source access, pop-out, PDF/export and disk Trash recovery. | Integrated. Delete/restore collision and path checks are tested. Actual Windows PDF/pop-out behavior remains unverified. |
| Projects / Today / Vault / Brain / Code | Project grouping and rename; daily records; vault folder/structure/conflicts/links; memory graph; repository workspaces. | Shared reference styling and contextual original SVGs. Folder dialogs and real-data scale need installed-app acceptance. |
| Sample workspace | Browser-only example chats, projects, versioned HTML/SVG artifacts, linked vault notes, Today sources, memory and scripted engine/extension interactions. Reset or switch to an empty preview from the title-bar sample label / About & help. | Sample writes use a separate storage namespace. Switching keeps separate drafts; reset leaves normal work and appearance untouched. No preload, disk access, model calls, real extension connection or provider credentials. Unsupported native operations still refuse. |
| Settings | Appearance including display name; windows/shortcuts; engine selection; external-engine connectors; provider keys and access; memory; rules/hooks/recipes/skills/watch; pack store and engine-marketplace selector; Voice & files; inference/performance/system controls. | Retained. There is no separate name-only You page. Sidebar footer is only the name and brain button opening Appearance. Utility actions moved, not deleted. |
| Brain graph | Real resolved links and unlinked Markdown notes; perspective 3D or 2D, orbit/pan/zoom, keyboard controls, selection and note preview. Saved colours, folder grouping, labels, sizes, layout forces and optional rotation. | At most 400 most-connected notes, with caps and missing listings disclosed. Browser examples are explicitly labelled and isolated from installed-app data. Bounded layout work; idle rendering stops; rotation respects reduced motion/Pause. Browser canvas checks use an explicit isolated fixture, not an installed vault. |
| Quick ask | Global shortcut opens the small window using the same engine and permission flow. Refused sends keep the draft. | Browser refusal test passes. Native global shortcut and multi-window behavior require installed-app verification. |

## Appearance and motion

| Surface | Purpose and operation | Current state / limits |
|---|---|---|
| Original look collection | Eight presets, eight layouts, nine palettes, four interface styles; independent typography, spacing, reading size/width and motion choices. | Integrated into the actual renderer, not a mock HTML replacement. Existing reading sizes remain the defaults. |
| Home / Chat miniature | Uses the same React shell, sidebar, brain, composer surface and message components. | Browser-tested. Selection changes are reflected in the miniature and workspace. |
| Appearance tools | Compare looks/structures, taste quiz, shortlist, verdicts/notes, saved custom mixes, import/export and standalone HTML preview. | Integrated; offline HTML reopens in ordinary files, viewer wrappers and opaque sandboxes. |
| Existing extra themes | All 16 design systems and pack styles remain available in addition to the eight original presets. Artifact styling keeps its catalog. | Fixed the integration conflict where inline palette variables masked these themes. Selected system colours match the miniature in browser checks. |
| Mascot | All 77 owner SVG scenes, eight role assignments, speed/pause/reduced-motion controls; interactive Home brain and task-linked activity scenes/words. | Catalog and behavior tests pass. Original artwork stays in the app; standalone logo/mascot SVG and kit-ZIP download options are removed. |
| Launch | Full-window assembly and animated wordmark once per normal app process; manual replay; no quick-window splash. | Browser-tested, including reduced motion. Process gate is unit-tested; installed Windows launch still needs checking. |

## Engines, runtime and privacy

| Surface | Purpose and operation | Current state / limits |
|---|---|---|
| Claude Code and agy discovery | Automatic detection plus explicit executable picker, persisted override and reset to automatic. | Newer main fixes retained and unit-tested. agy authenticated wire remains unproven. |
| Ollama startup | Start the installed copy first, then PATH/staged fallback; stop only the app-owned runtime. Preserve keep-loaded settings. | Newer main behavior retained. Fixed the warm-start check to await its asynchronous status. User-machine startup/warm behavior is unverified. |
| External engine setup | Install engines separately, then detect or choose an executable in Connectors. Start/stop operates on the installed runtime. | Built-in installer/download and model-pull options are removed from the UI. Existing guarded backend code remains covered by tests; no installation is triggered by navigation. |
| Provider access | Saved keys, per-provider permission gates and global external-inference switch. | Retained, with review routes covered by privacy tests. No new automatic provider fallback. Actual provider credentials stay with the app. |
| Capture and browser control | Paired extension relay, capture permissions/outbox handling and engine-driven browser tools. | Existing code/tests retained. Extension capture and real Playwright-MCP use need user-machine verification. |
| Pack store | Explicit source refresh; pinned digests, pack installation/export, skills/prompts/themes. | Existing implementation retained. This is separate from engine-owned marketplaces. |

## Voice and attachments

| Feature | Purpose and operation | Current state / limits |
|---|---|---|
| Read aloud | Listen on a completed reply uses an installed on-device voice; Stop/unmount cancels it. | No silent network voice. Real Windows voices still need device acceptance. |
| Offline dictation | The composer microphone button runs Windows System.Speech using the chosen installed recognition language. Final words append to the draft, never auto-send. | Single user-triggered utterance, bounded duration. Missing language/microphone support is reported. The browser preview only permits explicit on-device Web Speech support. |
| Provider dictation | Choose recording mode, transcription provider and exact model in **Settings → Voice & files**, then press Dictate. Stop uploads; Cancel discards. | Main-process permission ticket before audio-only access; 60-second/24 MiB recording cap. Revocation/cancellation, late permission results and late transcripts are tested. No physical microphone or paid-provider test here. |
| Documents and images | Local-first UTF-8/UTF-16 text/code, PDF text, Word/Excel/PowerPoint OOXML and ODF extraction; signature-checked image normalization. | Worker timeout 30 seconds, 192 MiB V8 heap; 50 MiB input, 12,000-character excerpt, 50 PDF pages. Office ZIP/XML and image dimensions/output are bounded. No macro execution or local OCR; layouts, scanned content and unsupported/corrupt/encrypted files are disclosed or refused. |
| Audio and video | Uses the owner's installed FFmpeg, selected with a native file picker or found on PATH. Audio can use Windows offline recognition; video produces sampled stills. | Audio covers at most 120 seconds. At most three video frames within the first 30 seconds, including short clips. Video frames do **not** include an audio transcript. No automatic decoder download or DRM bypass. |
| Explicit provider extraction | Each original source offers a separate upload/transcription action naming the chosen provider and model. A changed selection is refused, not substituted. | Anthropic/OpenAI PDF and supported images; Gemini PDF/images/audio/video; custom Responses endpoint. Transcription adapters: OpenAI/Groq/Gemini/custom. Model capabilities still apply. Access/key/global-external gates are checked in main; no retries or redirects. |
| Original files and coverage | Original File objects stay available for retry/discard until sending; temporary local decoding never rewrites originals. Extraction coverage travels with quoted source data to the engine. | Eight waiting sources, four derived engine attachments. Insufficient slots refuse rather than silently drop content. Failed fallback retains and labels the previous extraction. |

**Jarvis, wake word and continuous background voice remain parked.**

## Engine marketplaces

- **Settings → Plugins → Source** retains the entire OddBrain pack store and adds Claude Code marketplaces and agy status.
- Claude browsing explicitly reads a public GitHub `owner/repository` catalog, with filtering and provenance. Nothing refreshes on launch. Sources/cache/downloads are bounded and browsing is cancellable.
- Add/install/update/enable/disable/uninstall require a one-minute, one-use, window-bound approval of the exact executable and argument list. Non-install actions verify the engine's registered marketplace repository before approval and again before execution. Uninstall preserves plugin data.
- CLI capability is probed per action. No `-y`, automatic helper-command approval, invented command fallback or shell interpolation of catalog text. A plugin that requests a marketplace-declared helper command must be reviewed in the CLI's own terminal. Cancellation cannot undo changes already completed; inspect the installed list before retrying.
- **agy catalog installation remains unavailable:** no verified upstream catalog/install adapter is configured. Engine detection and executable selection are retained; the UI explains the limitation instead of inventing a store.

## Remaining acceptance and deferred work

1. Installed Windows acceptance: launch at the owner's display scale; signed-in turn → Allow/Deny → Restore; executable overrides; Ollama start/warm/keep-loaded; native dialogs, shortcut, PDF/pop-out and extension capture. No installer was produced here; unsigned-installer warnings still apply.
2. Physical microphone/speaker and installed Windows recognition-language checks, plus explicitly chosen real-provider file/transcription requests. Fixtures prove routing and cancellation logic, not provider/model quality or device operation.
3. agy catalog integration needs a verified upstream interface. Claude marketplace-declared helper-command approval is deliberately left to the CLI terminal, not silently accepted by the app.
4. README/repository presentation cleanup and all-screen publication screenshots remain deferred until the owner installs and confirms the app.

## Repeating the checks

From `apps/03_oddbrain`: `npm ci`, `npm test`, `npm run build`, `npm run build:web`. Run `npm run dev:web`, then `npm run test:ui` with an installed Playwright Chromium. `ODDBRAIN_UI_URL`, `ODDBRAIN_QA_DIR` and optional `ODDBRAIN_BROWSER_OPTIONS` (a JSON launch-options file) configure the browser checks. After a production build, `ODDBRAIN_TEST_FFMPEG=/path/to/ffmpeg npm run test:media-runtime` exercises the built worker and real local media decoding using generated fixtures; it downloads nothing. Generated previews, QA screenshots, caches and recovered archives are ignored, not source deliverables.
