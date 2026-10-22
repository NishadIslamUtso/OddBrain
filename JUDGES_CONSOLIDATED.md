# What the judges said — merged, checked, de-duplicated

Six reviews, one list. I verified each claim against the code before keeping it.
"Verified" = I read the exact lines. "Reported" = plausible but not proven here.

---

## 1. Faults that are real (fix these)

| # | Fault | Where | Verified |
|---|---|---|---|
| 1 | **Two programs want port 8765.** The browser-capture server defaults to 8765; the Kdenlive MCP default is also 8765. Whichever starts first wins, the other fails. If the extension wins, "Test Kdenlive" talks to the extension and gets a 404, and the app blames Kdenlive. | `shared/lib/videoStudio.ts:21` vs `main/extension/server.ts:43` | Yes |
| 2 | **Import can succeed in Kdenlive and fail in OddBrain.** Every request times out at 20 s, but media import asks the server to wait up to 30 s. A 25-second import reports failure while the file lands in the bin. Same risk for a big batch. | `video/service.ts:210` vs `:400` | Yes |
| 3 | **"Save version" can never work.** It looks for `desktop_project_checkpoint` / `save_version`; the real server only has `desktop_project_save` / `desktop_project_save_as`. No UI calls it either. | `video/service.ts:739` | Yes |
| 4 | **Undo/Redo accept any local server**, not just the pinned Kdenlive. The identity check is skipped on this path, so a program squatting on the port could be driven. | `video/service.ts:745, 770` | Yes |
| 5 | **The evidence file dies at 8 MB.** One JSON holds every transcript, stored three times (as full text, as `transcript`, and again inside segments), and is rewritten whole on every note. Past ~8 MB, saving throws and evidence stops. | `video/service.ts:469`, `recoverableJson.ts:38` | Yes |
| 6 | **A short video gets one frame.** Frame count is `min(3, ceil(duration/300))`, so anything under 5 minutes gets exactly 1 picture. | `media/service.ts:196` | Yes |
| 7 | **The AI cannot see the timeline.** State is cut down to counts, size, revision and Undo. No frame rate, clip IDs, bin IDs or track tags, so it cannot compute frames or name clips. | `nativeProtocol.ts:132` | Yes |
| 8 | **The approval card hides what it approves.** It shows a six-field summary; effect values, title text, keyframes and captions are invisible. | `VideoStudioView.tsx:49` | Yes |
| 9 | **Backups skip the evidence index.** `video-studio.json` is backed up; `video-evidence-v1.json` and the frame folders are not. | `appDataBackup.ts:10` | Yes |
| 10 | **The local AI endpoint has no key.** Any local process can read every transcript and frame. | `api/server.ts:244` | Yes |

## 2. Risks to check before acting

- **Protocol version pin.** The app demands exactly `2025-06-18`; upstream says its primary lifecycle is `2025-11-25` with `2025-06-18` supported. If the server answers with its newest version, everything reads "not compatible". One real connection settles it.
- **Three required tools are never used** (`desktop_capabilities`, `desktop_preview_render`, `desktop_render_cancel`). If upstream renames one, the whole editor refuses to connect over a tool nothing calls.
- **A short video gets one frame** is also why "adaptive" reads as static on Reels-length clips.
- **Unverified judge claims** (do not act on these yet): the renderer ships unminified; FFmpeg filters silently produce nothing; the vault backup freezes the window for 4–5 s per GB; a scene cut lands 2 s late. I could not reproduce any of them here.

## 3. Efficiency wins, biggest first

1. **Two downloaders.** `engine/downloadStream.ts` already streams with a cap, hash and progress; `video/service.ts:346` re-implements it without progress, then re-reads the finished file to hash it again. One file, two full reads, no progress bar.
2. **Every video is decoded 3–4 times** — audio chunks, loudness, silence, scene scan. One decode can feed all four.
3. **512 blocking file calls on the UI thread** (`existsSync` 132, `statSync` 126, `writeFileSync` 65…). Don't rewrite them all; time startup, Vault and Brain, then fix what actually stalls.
4. **Two files are unreadable at 2 a.m.** `main/index.ts` (2,928 lines) and `video/service.ts` (806 lines, average 111 characters per line, longest 1,284). Split by job, one statement per line.
5. **Dead surface.** `skills:deploy` always answers "no" and nothing calls it; `save-version` has no caller; several judges found 70–270 exported functions with no caller (counts differ by scan). Delete, let the compiler confirm.
6. **Evidence grows without a budget.** Each AI request is bounded, but requests accumulate; add a per-video cap and paging.
7. **Housekeeping.** ~18 remote branches; one PR of 999 files.

## 4. Suggestions worth doing (hours, not days)

- Show the full command JSON in the approval card, and refuse Apply if it differs from what was shown.
- Three small tests with exact values: frame positions at 15/30/45 s, URL classification, plan normalization. That one file would have caught the frame bug everyone missed.
- Turn the two CI jobs into one two-OS matrix.
- Add a count to export messages ("…, 12 chats").
- Remove "Minimize" from the storage-fault banner.
- Add download progress (falls out of fix 1 above).
- Text dry-run of a plan before applying: "V1 gains clip X at 00:12–00:19".
- A "check this PC" page: FFmpeg, ffprobe, yt-dlp, Kdenlive, the port, Ollama, folder, free space, OCR adapter — each with a copyable fix.
- Keep three documents from drifting: the rulebook is authority, the other two become pointers.

## 5. Scope worth adding

Ordered by value per hour, and all of it is upstream already:

1. **Word-level transcript** from Kdenlive (`desktop_transcript` / `transcribe`). Replaces the weakest part of the reader with the strongest, free.
2. **`desktop_effect_list`** so the AI stops guessing effect IDs.
3. **`desktop_silence_detect` + `range_cut`** — "cut dead air" becomes a real recipe.
4. **`preview_render` + `render_verify`** — the missing "watch it back" loop.
5. **`project_new` / profile** — one-click 9:16.
6. **Draft-project export**: write a new `.kdenlive` for stock Kdenlive, no fork needed. This is the insurance policy if the fork goes quiet.
7. More providers (Google Fonts, Freesound, Iconify) only after the basic chain works.

## 6. Where the judges disagreed

- **"Tests removed" vs "tests still there."** Both true: they inspected different branches. `arena/81a07155-oddbrain` is `ba66c9d` and still has 245 test files. Removal only exists on `arena/649ffaaf-oddbrain`.
- **"The port was changed from 8766 to 8765 to make a test pass."** Wrong. 8765 was there from the first commit. The collision is real; the story about how it happened is not.
- **"500 commands per plan."** It is 200 commands; 500 is the per-list cap and 20,000 the per-string cap.
- **"1,650 mocks."** That was my own wrong number last turn. The real count is 2,751 assertions and 29 module mocks — a shape problem, not a mock swamp.
- **Test counts** (1,655 / 1,657 / 233 files + 2 skipped) differ because they measured different runs and branches.

## 7. All six agree on one thing

Nothing has run against a real Kdenlive on a real Windows machine. Every judge's first recommendation is the same: build/install the editor once, open one real project, make one real edit, approve it, apply it, capture a frame, render, verify. Until that happens, green CI proves only that the code compiles.

## 8. Do this next, in order

1. Move the Kdenlive default off 8765 (5 min).
2. Raise the timeout for import and batch to 120 s (5 min).
3. Point Save-version at `desktop_project_save_as`, or delete it (10 min).
4. Require the pinned identity for Undo/Redo (5 min).
5. Show the full plan JSON in the approval card (30 min).
6. Then the real-machine run — before any new feature.
