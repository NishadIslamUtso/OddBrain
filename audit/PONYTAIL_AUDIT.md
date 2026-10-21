# Ponytail audit, 2026-10-21

I used the `ponytail-audit` rules from DietrichGebert/ponytail: read the repo like the developer who recently inherited
it and gets paged when it breaks. Importance runs correct, safe, holds under load, tested, fast, lean. I wrote the
report in the `no-ai-slop` style from your `agent-resources` branch, and checked the code against your
`RULES_FEATURES_AND_REASONS.md`.

This report changes no app code. This turn I edited three docs (listed at the end) and added this file and
`audit/dead-code.txt`. Every number below is marked measured (I ran it), counted (a script over the code), or
estimate. The first report is `audit/AUDIT_REPORT.md`. Its 18 defects still stand, and I do not repeat them here
except where a new measurement changes them.

**What this repo does:** OddBrain is a Windows desktop app. It puts Claude Code and agy in a chat window, keeps your
chats and notes on your own PC, and has a Video Studio that reads videos and drives the Kdenlive editor.

**Load I assumed:** one owner on one Windows 11 PC, a vault that grows to thousands of notes, videos from 1 to 60
minutes, nobody else connected.

## The branch right now

`arena/81a07155-oddbrain` still points at `ba66c9d`, the commit I audited last time. Nobody has pushed since. PR #12
is open and mergeable: 999 files, +52,253 and -67,221 lines, 65 commits. Every CI check on that commit passed
(Linux, Windows, CodeQL, dependency review).

The checks were green while findings 1, 2 and 4 below existed. The old tests used pretend ffmpeg, yt-dlp and Kdenlive
programs, and 39 of the helper functions they tested are never called by the app (finding 8). Your own rules file
says it: "A green check proves only its assertions."

## Findings

### Must fix

1. **The video reader's three ffmpeg checks never run** (`src/main/media/service.ts:172, 177, 192`)
   - **What this is:** When a video is added, the app asks ffmpeg for loudness, pauses and scene cuts.
   - **Problem:** Each command ends in `file=pipe\:1`, which ffmpeg 4.2.2 and 7.0.2 reject. A 75-second test video with
     4 cuts came back with 0 cuts, no loudness, no pauses and one frame (measured). The code catches the failure and
     writes a calm sentence. One of the commands also leaves an empty file called `pipe` in the working folder.
   - **Fix:** Change `file=pipe\\:1` to `file=-` in the three places. Measured after the change: on the 75-second
     file, 4 pause intervals and 2,350 loudness windows; on a normally encoded 5-minute video, 19 of 19 cuts. Put ffmpeg's own error text in the evidence when a
     pass fails. These three catches are the only ones in the app that wrap an external program (counted).
   - **If we skip it:** The AI never gets a scene map or pause data, and the README keeps saying it does.

2. **A failed YouTube download throws itself away** (`src/main/video/service.ts:543-561`)
   - **What this is:** Links go to yt-dlp, which fetches video and audio as two streams and joins them with ffmpeg.
   - **Problem:** If ffmpeg is not on PATH, yt-dlp exits normally, leaves two files and prints the name of a joined
     file that does not exist. The app then reports `ENOENT`, says "the completed source remains at" that missing
     path, and deletes the staging folder with both files. The test download was 98 MB (measured, real yt-dlp
     2026.08.19).
   - **Fix:** Pass `--ffmpeg-location` (the media settings already store an ffmpeg path), cap the height at 1080 p,
     check that the printed file exists, and keep the staged files when joining fails.
   - **If we skip it:** On any PC without ffmpeg on PATH every YouTube link fails, and each failure costs the whole
     download time.

3. **The evidence file is full after about 45 one-hour videos** (`src/main/video/service.ts:160, 469`, `src/main/recoverableJson.ts:8`)
   - **What this is:** Each analysed video adds a record to one file, `video-evidence-v1.json`.
   - **Problem:** The record stores the transcript three times (`sourceText`, `transcript`, `transcriptSegments`), and
     every change rewrites the whole file. With one-hour transcripts of 48 KB and 400 scene cuts, a record took
     171 KB, and the 46th video was refused with "Store exceeds the 8 MB recovery limit" (measured, real service
     code). The "256 records" limit in the message is never reached. Word timestamps from whisper would leave room
     for about 10 videos (estimate).
   - **Fix:** Store each transcript once, in the per-video folder the code already makes
     (`video-evidence-files/<id>/`), and keep only a summary in the index. Write compact JSON.
   - **If we skip it:** After a few weeks of daily videos, new videos download but cannot be read, and the error names
     a limit nobody can act on.

4. **The AI cannot write a working edit** (`src/main/video/service.ts:661-668`, `src/main/video/nativeProtocol.ts:132`)
   - **What this is:** The AI proposes edits with `oddbrain_edit_plan_propose`. Kdenlive's commands need track, clip
     and asset IDs.
   - **Problem:** `oddbrain_kdenlive_state` returns only counts. The plan tool has no list of command shapes. A plan
     with a guessed asset ID is refused with `UNKNOWN_BIN` (measured against a stand-in server).
   - **Fix:** Pass Kdenlive's read-only answers through (tracks, clips, assets, transcript, silences), and give the
     plan tool Kdenlive's own command schema. Details are in the first report, D2.
   - **If we skip it:** The review and approve machinery works, and nothing real ever reaches it.

### Should fix

5. **Backup freezes the whole app** (`src/main/vault/backup.ts:44-66`)
   - **What this is:** Backup copies every vault file, then reads each file again to check it.
   - **Problem:** Both passes are blocking calls on the main thread. Backing up about 1 GB froze the app for 4.4 s and
     5.0 s in two runs on a fast disk (measured, real `backupVault`). Windows usually marks a window that stops answering for
     about 5 seconds as "Not Responding", so a larger vault or a slower disk can reach that.
   - **Fix:** Make `stream()` use the async file API so the loop gives control back between 1 MB chunks. A worker
     thread works too.
   - **If we skip it:** A large backup looks like a crash, and people kill the app halfway through.

6. **Vault search rereads the vault on every query** (`src/main/vault/recall.ts:18-20`)
   - **What this is:** Memory lookups search your notes for matching words. The native chat context, the research path and the
     `/api/vault/recall` route call it.
   - **Problem:** Each query reads files from disk on the main thread. Measured twice with the real code: about 30 ms
     for 76 notes, 0.4 s for 3,000, 1.3 s for 20,000. Past the 64 MB read budget it searches only part of the vault and
     shows "Not all saved files could be searched". I did not measure how often something triggers a search.
   - **Fix:** The smallest change is to run the search in a worker thread. The real fix is an index that updates when a
     note changes, which your plan lists as "later".
   - **If we skip it:** Past a few thousand notes every memory lookup stalls the app for half a second, and past a
     few years of notes some answers miss notes.

7. **`registerBridges` is one 1,995-line function** (`src/main/index.ts:361-2355`)
   - **What this is:** It registers all 264 handlers that connect the window to the backend: chats, vault, engines,
     video, backups, settings.
   - **Problem:** One function holds unrelated jobs and shares dozens of local variables. Nobody can read it in one
     sitting, and a test cannot load it without starting the app.
   - **Fix:** Split by job into `registerChatBridges(deps)`, `registerVaultBridges(deps)` and so on, with the shared
     variables in one `deps` object. No behaviour changes.
   - **If we skip it:** Each new feature adds more lines to the same function, and the next bug hides in it.

8. **76 functions and constants, about 600 lines, have no caller** (list in `audit/dead-code.txt`)
   - **What this is:** Exported code that nothing in the app, extension, scripts or store uses (counted, then grepped
     across the whole repo).
   - **Problem:** 47 of them were used only by the old tests. Eight of those are test hooks, and 39 (411 lines) are real
     helpers the app never calls, such as `unzipArchive`, `deployMcp`, `deployHouseRules` and `packModelContext`. So part
     of the old suite tested code that never runs. Another 29 (161 lines) had no user and no test, for example
     `DEFAULT_CHATS` (placeholder chat titles) and `shrinkImage`.
   - **Fix:** Delete them. `tsc` fails if one was needed.
   - **If we skip it:** About 600 lines get read, searched and carried through every change, and they hide which code
     the app really uses.

9. **Four test-only packages are still installed** (`apps/03_oddbrain/package.json`)
   - **What this is:** `vitest`, `jsdom`, `fake-indexeddb` and `playwright-core` ran the old tests.
   - **Problem:** I removed the tests last time and left the packages. Nothing references them now. Without them the
     lockfile drops from 519 to 462 packages (measured on a temporary copy).
   - **Fix:** Run `npm uninstall vitest jsdom fake-indexeddb playwright-core`, or keep them on purpose if the rebuilt
     tests will use them (vitest and jsdom probably will). Either way, decide.
   - **If we skip it:** Slower installs and CI, and four more packages to patch.

10. **No test would catch any of this** (`apps/03_oddbrain/` has none)
    - **What this is:** The tests were removed on 2026-10-21 and will be rebuilt.
    - **Problem:** The old tests passed while findings 1, 2 and 4 existed, because they used pretend programs.
      Rebuilt tests that do the same will pass over the same bugs.
    - **Fix:** Start with one check per real program: ffmpeg arguments, the yt-dlp join, evidence file size, backup
      stall, and "the AI can see IDs". `audit/probes` has all five as runnable scripts (`probe-media`,
      `probe-evidence-size`, `probe-backup-stall`, `probe-video`). Keep each as a plain script that exits with an error
      when the check fails.
    - **If we skip it:** The next edit to the reader breaks it again, and CI stays green.

11. **Docs and screens say things the code does not do** (Rule 1 in your RULES file)
    - **What this is:** README, RULES and the Settings page describe the video features.
    - **Problem:** They say the reader measures loudness, pauses and scene changes (finding 1), and
      `VideoStudioSettings.tsx:84` says "Video preflight reuses the reviewed DeepSeek-OCR-2 adapter", which it does
      not. RULES also said pull requests run tests. I fixed that sentence and a matching one in FUTURE_PLAN this turn.
    - **Fix:** Fix the Settings sentence now. The loudness, pause and scene claims become true when finding 1 lands.
    - **If we skip it:** The app breaks your first rule, "Never invent a capability".

### Nice to have

12. **The renderer ships unminified** (`apps/03_oddbrain/electron.vite.config.ts:28-40`)
    - **What this is:** The screen code loads from disk when the app starts.
    - **Problem:** It is 3.2 MB (538 KB gzipped) as indented, readable code. With `minify: 'esbuild'` it was 2.2 MB
      (431 KB gzipped), measured on a temporary build. I did not measure startup time, and a local disk makes the gain small.
    - **Fix:** Add `minify: 'esbuild'` to the renderer build, after you measure startup on your PC (plan item 8).
    - **If we skip it:** A slightly slower first window on a slow disk.

13. **Scene detection decodes every frame** (`src/main/media/service.ts:192`)
    - **What this is:** The reader looks at two frames per second, but decodes all of them first.
    - **Problem:** It took 16 to 17 s for 5 minutes of 720p video on a 2-core machine (measured twice), so a one-hour 1080p video
      is roughly 7 minutes (estimate). Reading only keyframes took 0.9 s, about 18 times faster, but it reported 4 cuts about
      2 s late and added 4 extra candidates. I could not test on a many-core PC, where the fixed `-threads 2` may matter.
    - **Fix:** Only if the time hurts: a keyframe pass first, then a normal check within 2 seconds of each candidate.
    - **If we skip it:** Long videos take minutes to read, with no progress shown (see "More scope").

14. **Ten state files copy the same small store** (`src/renderer/src/state/` battle, compact, engine, memory, recipes, split, watch, automation, quickPreference, review)
    - **What this is:** Each file keeps a set of listeners, a version number and an `emit` function.
    - **Problem:** Seven of the ten have an identical `emit`. Fourteen groups of identical helpers exist across the app, about
      69 lines (counted), including `writeLine` and `deadSession` in both `agy.ts` and `claudeCode.ts`.
    - **Fix:** One `createStore` helper of about 10 lines, and one shared copy of each other helper.
    - **If we skip it:** A fix to one copy misses the other nine.

15. **The densest code is hard to read** (`src/main/video/service.ts`, `src/main/media/service.ts`, `src/main/index.ts`)
    - **What this is:** 2,708 lines are longer than 160 characters, and the longest is 1,286 (counted). No formatter or
      linter is installed.
    - **Problem:** A line that long cannot be reviewed. A reviewer reads it once and hopes.
    - **Fix:** Run Prettier once on the files you touch while fixing findings 1 to 4, using `npx` so nothing is
      added to `package.json`.
    - **If we skip it:** The next bug hides in a line nobody can read.

16. **A newcomer has no map** (repo root)
    - **What this is:** There are four docs. `CONTEXT.md` is a stub.
    - **Problem:** The code has "battle" (`state/battle.ts`) and "split" (`state/split.ts`) features that the README and
      RULES never mention (0 mentions), and "brain door" appears in messages with no definition. Each module opens with
      a good comment, but nothing says where to start.
    - **Fix:** A one-page `ARCHITECTURE.md` (the map in the next section is a draft) and a short glossary.
    - **If we skip it:** Each new reader spends the first day working out the layout.

I left out the 206 unused exported types and two smaller items.

**Verdict:** Fix 1, 2, 3 and 4 first, then 5 and 6. Everything else is cleanup.

**Lean:** -about 670 lines (600 dead, 70 copied), -4 dependencies (57 packages) possible.

**Not checked:** The Electron app itself, anything Windows-only (including whether file renames need a retry when
antivirus holds a file, and the real "Not Responding" threshold), real YouTube, TikTok and Instagram, live Openverse,
Wikimedia and Pixabay, the AI engines, the OCR adapter, the packaged installer, startup time, chat storage with very
long chats, and the many-core effect of `-threads 2`. Outside the video feature I checked compile, build, security
gates, handler wiring and reachability, plus two measurements (backup and vault search) and the bundle size.

## Reading it as a first-year student

### The map

| Folder | What it is |
| --- | --- |
| `apps/03_oddbrain/src/main/` | The backend. It runs as Electron's main process and does files, ffmpeg, network and storage. About 20,000 lines. |
| `apps/03_oddbrain/src/renderer/` | The screen. React components and their state. About 20,000 lines. |
| `apps/03_oddbrain/src/preload/` | A narrow bridge. The screen can call the backend only through it. |
| `apps/03_oddbrain/src/shared/` | Types and small helpers that both sides use. |
| `extension/` | The browser companion, in plain JavaScript. |
| `vault/Brain/` | The 76 starter notes. |
| `store/` | Packs that ship with the app. |
| `audit/` | This review's checks. Not part of the app. |

A button click travels like this: the screen calls `bridge.something()`, the preload sends a message named like
`vault:backup`, `registerBridges` in `main/index.ts` has a handler with that name, the handler calls a service in
`main/`, and the answer goes back the same way. I checked that all 263 names the screen sends have a handler.

### What reads well

- The median function is 7 lines (counted over 2,295 functions).
- Most files open with a comment that says why the file exists. Read `state/battle.ts` and `api/guard.ts` first.
- `src/main/recoverableJson.ts` is 58 lines and shows the standard safe-save pattern: write a temporary file, flush
  it to disk, rename it over the real file, and keep the previous copy.
- `src/main/api/guard.ts` shows how to protect a local web server: a fixed list of routes, a loopback-only Host
  check against DNS rebinding, a same-origin check, and JSON-only writes.
- TypeScript is strict and compiles with zero errors.

### What is hard

- One function is 1,995 lines long, and 74 functions are over 100 lines.
- Some lines run past 1,000 characters.
- 322 `try/catch` blocks never look at the error, so a failure turns into a calm sentence and you debug by guessing.
- There are no tests to run and learn from.
- Product words (battle, brain door, Ink & Sketchbook) appear in code and messages with no glossary.

### Five small tasks for you

Each takes under an hour. Do 1 and 2 first. In each, something tells you whether you broke anything.

1. **Fix the three ffmpeg arguments** (finding 1). Open `src/main/media/service.ts` at lines 172, 177 and 192 and
   change `pipe\\:1` to `-`. You learn command-line escaping. To check, run the one-liner from section 9 of the first
   report in PowerShell, or `audit/probes/run.sh probe-media` before and after.
2. **Delete `unzipArchive`** (`src/main/engine/downloads.ts`, about 70 lines, finding 8). Run `npx tsc --noEmit`. If it
   passes, nothing used it. You learn what dead code is and how types protect you.
3. **Write one test.** A script that runs the app's silence command on a generated tone and fails if no
   `lavfi.silence_start` line appears. You learn what a test is for. The old tests would have passed over this bug.
4. **Write `ARCHITECTURE.md`** from the map above, then correct whatever you find wrong in it. Writing it is the
   fastest way to learn the layout.
5. **Stretch: make backup async** (finding 5). Change `stream()` in `src/main/vault/backup.ts` to use `fs/promises`,
   then rerun `audit/probes` backup timing. You learn what blocking the event loop means.

One process change helps more than any code change. Keep pull requests under about 400 lines. PR #12 is 999 files and
nobody can review that as one piece.

## More scope

Yes, there is more to do, in three piles.

**Already on your plan and still right.** The seven steps in `audit/AUDIT_REPORT.md` section 8. Today's numbers change
the order in two places. Do finding 3 (evidence file) before the whisper step, because word timestamps make each
record several times bigger. Do finding 6 (search) before the vault passes a few thousand notes.

**Worth adding because the measurements point at it.**

1. **A "check this PC" panel.** Findings 1 and 2 are tool-setup problems that show up as vague errors. The smallest
   version is one list that runs commands the app already knows (`ffmpeg -version`, `yt-dlp --version`, the OCR
   adapter's `--oddbrain-capabilities`, the Kdenlive handshake) and shows green or red with the exact fix. It also
   gives your RULES file the "real Windows 11 acceptance" evidence it asks for.
2. **Progress for the video reader.** The reader, the video service and the Video Studio screen mention "progress"
   zero times (counted). The screen has one `busy` flag and a Stop button. A one-hour video takes minutes. The engine
   download code (`engine/pull.ts`) already sends progress events, so reuse that pattern: one event per phase
   (probe, audio, loudness, pauses, scenes, frames).
3. **Run the real-program checks in CI** once they exist (finding 10), on Linux where ffmpeg and yt-dlp install in
   one line.

**Skip on purpose.**

- A database or search server for the vault. An index file or a worker thread is enough at this size.
- Auto-update. It needs a signed installer first, and your plan says so.
- The mobile app. Your plan keeps it separate.
- A cloud relay or telemetry. Both are on your non-goals list.
- Paid captioning or vision services. You have no budget for them.
- Support for editors other than Kdenlive. That is your rule.
- Translating the interface. Nobody asked.

## Files I changed this turn

- `RULES_FEATURES_AND_REASONS.md`: the "Release and verification" paragraph and the first sentence now say the tests
  were removed and what CI checks today.
- `FUTURE_PLAN.md`: step 1 now says to rebuild the tests, starting from `audit/probes`.
- `audit/AUDIT_REPORT.md`: corrected the swallowed-error counts (137 empty, 322 that ignore the error, not 62) and the
  note about the missed 15-second cut, which came from my first test file.
- New: `audit/PONYTAIL_AUDIT.md` (this file) and `audit/dead-code.txt`.
- New scripts in `audit/probes/` so every number here can be rerun: `probe-evidence-size.cjs`, `probe-backup-stall.cjs`,
  `probe-vault-search.cjs`, `probe-scene-speed.sh` and the six `static-*.cjs` counters. `ipc-wiring.cjs` now resolves
  listeners registered through a variable (my first version raised a false alarm about `engine:pull-event`).
- `audit/README.md` lists them.
