# Ponytail audit — `arena/81a07155-oddbrain`

Date: 2026-10-21. Judged with three lenses, as asked:

1. **Ponytail** ([DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)) — the `ponytail-audit` skill format: lazy senior dev mode. Order: correct, safe, holds under load, tested, fast, lean. Every finding needs a concrete case. Plain English.
2. **Anti AI-slop** ([ai-slop-skill](https://github.com/HARQuantum/ai-slop-skill) model) — code fails two ways: it *builds too much* (wrappers, copies, speculative machinery), or it *understands too little* (works on the happy path only; no state for "unknown", "restart", "partial").
3. **Your development rules** — `RULES_FEATURES_AND_REASONS.md` in this repo ("Be exact. Never invent a capability…", "A green check proves only its assertions", etc.).

And one extra lens at the end: reading this as a first-year CS student (you).

**Branch fact first:** `arena/81a07155-oddbrain` on GitHub still points at commit `ba66c9d` — the same commit I audited before. **The tests are still on that branch** (245 files, 28,420 lines). If you deleted them, it has not reached GitHub. So this audit judges the product code only, and findings 1–2 from my earlier run-with-real-FFmpeg work still apply word for word, because the code did not change.

What this repo does: OddBrain is a Windows desktop app (Electron + React + TypeScript, ~50,200 lines of product code, 369 source files). It is a personal AI assistant: chat through locally installed engines (Claude Code, agy, Ollama, cloud APIs), a notes vault, a browser extension, and a new Video Studio that talks to a Kdenlive fork over MCP (a protocol for AI tools). Load assumed: **one person, one PC, for years.** Not many users — but ever-growing chats, vault notes, and videos.

---

## Must fix

**1. The video "measuring" passes silently produce nothing** (`apps/03_oddbrain/src/main/media/service.ts:172,177,192`)
- **What this is:** When a video is read, three FFmpeg passes should measure scene cuts, loudness (RMS), and pauses.
- **Problem:** I ran these exact commands with a real FFmpeg. Scene and pause passes die at startup (`Metadata key must be set`); the loudness pass runs but its numbers never arrive (0 values; the same command writing to a file gives 517). The code catches the failure and carries on quietly, and the app text still says "A local scene-change pass planned N adaptive frames." That sentence is false today. This breaks your rule 1: *never invent a capability.*
- **Fix:** Add the missing `key=…`, write metadata to temp files (the temp folder already exists in the code), and make the summary text say which passes actually ran.
- **If we skip it:** Every video analysis is transcript + evenly spaced pictures, dressed up as "adaptive scene understanding."

**2. A Kdenlive import can succeed while OddBrain reports it failed** (`src/main/video/service.ts`, MCP request timeout)
- **What this is:** OddBrain asks Kdenlive to import media with `wait: 30` (seconds), but gives up listening after 20 seconds.
- **Problem:** I proved it with a slow server: at 20.0s OddBrain reports "not imported" while the server finishes the import anyway. There is no "unknown — check state before retrying" outcome. Your own rules ban exactly this ("a timed-out operation is never called complete", "Stop creates an uncertain outcome that must be resolved by readback"). Anti-slop name for it: the lifecycle is missing its *indeterminate* state.
- **Fix:** Per-tool timeouts (import/batch ≥120s), and on timeout, read back project state/history before reporting anything.
- **If we skip it:** The first big import on a real machine desyncs OddBrain's view of the project from Kdenlive's.

**3. The faulty tests are gone in your head, not on the branch — and CI still trusts them** (`apps/03_oddbrain/tests/`, `package.json` scripts, `.github/workflows/checks.yml`, RULES "Release and verification")
- **What this is:** The suite (28,420 lines) that mocks FFmpeg and mocks Kdenlive, then certifies both as working.
- **Problem:** On `arena/81` it all still exists and still gates pull requests: `npm test` (vitest), `test:ui` (18 `check-ui*.cjs` scripts, 1,233 lines), `check-ci-tests`, test-only dependencies (vitest, jsdom, fake-indexeddb). Deleting only `tests/` would break the build scripts and CI instead of cleaning them. Your rules even say PRs run tests — the rule now protects the thing you decided to remove.
- **Fix:** One commit that removes `tests/`, the check-ui/ci test scripts, the test scripts in `package.json`, the 3 test-only deps, and rewrites `checks.yml` + the RULES release section to match (typecheck, builds, security, smoke stay).
- **If we skip it:** The next agent (or you in a month) sees green CI and believes the video features work. That is how finding 1 survived.

## Should fix

**4. 272 of 963 exported functions have no caller in the app** (whole `src/`)
- **What this is:** `export` marks a function as "other files may use me." I checked every exported function/const/class: 272 are never used outside their own file. 170 exist only so tests could reach them. 102 are used *nowhere at all* (e.g. `flagsExist`, `safeExternalUrl`, `discardAll`, `watchFolderOf`).
- **Problem:** A reader cannot tell the real public surface from leftovers. Agents keep dead code "just in case," and keep it compiling forever.
- **Fix:** After finding 3 lands, one sweep: remove the `export` keyword where a function is file-local, delete the 102 used-nowhere symbols. `tsc` will scream if anything real breaks — a safe first refactor.
- **If we skip it:** The codebase keeps ~28% fake surface area. Every future change gets slower to reason about.

**5. Every feature is written four times** (`src/shared/lib/*.ts` → `src/preload/index.ts` → `src/renderer/src/platform/bridge.ts` → `src/main/index.ts`)
- **What this is:** To add one button that does something in the desktop app, you write: the shared types, a preload IPC call (220 of them), a web-preview stub in `bridge.ts` (183 hand-written "requires the desktop app" stubs, 790 lines), and the handler in main.
- **Problem:** Four places must agree, by hand, forever. This is the biggest everyday tax in the repo and the easiest place for an agent to fake completeness (stub present, feature absent).
- **Fix:** Replace the 183 hand stubs with one small helper per API group that produces the same "desktop required" answers (e.g. a `desktopOnly()` factory). Same behavior, ~600 fewer lines, one place to update. Ponytail: deletion beats addition.
- **If we skip it:** Every new feature costs 4 edits and invites mismatch bugs in the web preview.

**6. The same four tiny jobs are re-implemented all over main** (whole `src/main/`)
- **What this is:** Hashing a file (SHA-256): 38 files call `createHash`; helpers named `digest` are defined in 7 files, `hash` in 5. Atomic JSON write: `atomicWrite` in 3 files plus inline copies. `validId` in 5 files. `JSON.parse` in 60 files.
- **Problem:** Copies drift. Fix a bug in one `digest`, six more stay broken — the exact failure ponytail-review hunts. Provenance hashing is this app's core promise; it should have one implementation.
- **Fix:** Two small shared helpers where shared code already lives (`hashFile`, `writeJsonAtomic`), migrate file by file as you touch them. Do not build a framework.
- **If we skip it:** One day two copies hash differently (streaming vs whole-file) and "same file" stops meaning the same thing.

**7. Two files no human can review** (`src/main/index.ts` 2,928 lines; `src/renderer/src/components/SettingsView.tsx` 1,303 lines)
- **What this is:** `main/index.ts` holds app boot, all 262 IPC handlers, windows, and wiring for every domain.
- **Problem:** You are the only reviewer. A 2,928-line file means agent diffs are unreviewable by you — which is how a "senile agent" turn breaks things in plain sight. It also guarantees merge pain between agent branches (you have 21 remote branches).
- **Fix:** Split by job, not by line count: each domain already has a service folder (`video/`, `vault/`, `chats/`…); move each domain's handler registration next to its service, one domain per commit. Start with video.
- **If we skip it:** The repo stays agent-only territory. You remain a passenger in your own project.

**8. A dead Kdenlive session wedges the Video Studio** (`src/main/video/service.ts` connection cache)
- **What this is:** Upstream Kdenlive kills idle sessions after 30 minutes. OddBrain caches its session and never throws it away.
- **Problem:** After expiry (or a Kdenlive restart), every action fails with a bare "HTTP 404" until you happen to press Test in settings. No message says that. Happy-path-only design: no reconnect state.
- **Fix:** On a session-not-found reply, drop the cache and reconnect once, then retry the *read*; for writes, stop and report unknown (see finding 2).
- **If we skip it:** The feature looks randomly broken every work session longer than 30 minutes.

**9. The AI's proposal and edit plan live only in memory** (`src/main/video/service.ts`)
- **What this is:** The Creative Library proposal and the proposed edit plan are single variables in the running app; library tokens expire after 15 minutes.
- **Problem:** Restart the app (or it crashes) mid-review and the plan you were checking is gone; a new search silently overwrites the old proposal. Your rules demand durable, recoverable owner-facing state everywhere else; this corner skipped it.
- **Fix:** Save proposal + plan as JSON next to the evidence index (the store pattern already exists). Keep the 15-minute token for *applying*, not for *existing*.
- **If we skip it:** Long review sessions and crashes eat work, and nobody can prove what was proposed.

**10. Reading a video decodes its audio three times** (`src/main/media/service.ts` `decodeLocalPath`)
- **What this is:** One pass extracts WAV for speech, one measures loudness, one finds pauses — each a full decode of the audio — plus one process spawn per picture frame.
- **Problem:** Once finding 1 is fixed, a 1-hour video pays 3 audio decodes where 1–2 do the job. (Today two passes fail instantly, so it is accidentally "fast.")
- **Fix:** Run loudness + pause measurement on the WAV chunks already extracted for speech (cheap, no re-decode of the source), or chain both filters in one pass writing two metadata files.
- **If we skip it:** Video reading stays minutes slower than it should be, on the owner's CPU, forever.

**11. A Short gets exactly one picture** (`src/main/media/service.ts`, frame budget)
- **What this is:** `wanted = min(3, ceil(duration/300))` — anything under 5 minutes gets 1 frame.
- **Problem:** Your plan is Shorts-first; the core use case gets the thinnest evidence. The better function (`adaptiveFramePoints`, up to 12 frames) already exists; the caller just never asks.
- **Fix:** Ask for a sane minimum (3) and scale with duration up to the existing cap. One line.
- **If we skip it:** "Adaptive understanding" of a 30-second Reel = one still image and a transcript.

**12. A "save-version" action that can never work** (`src/main/video/service.ts` action map; `src/shared/lib/videoStudio.ts:233`)
- **What this is:** The backend knows a `save-version` action. It looks for tools named `desktop_project_checkpoint` / `checkpoint_save` / …
- **Problem:** None of those tools exist in the real Kdenlive fork (it has `desktop_project_save` / `save_as`), and the UI has no button for it. A field that implies a capability that is not there — textbook AI slop, and a trap for the next agent who trusts the type.
- **Fix:** Wire it to the real `desktop_project_save(_as)` behind the normal approval card, or delete the action. Deleting is one small diff; wiring is the real fix when Kdenlive runs on Windows.
- **If we skip it:** Someone builds "versions" on top of a name that means nothing.

## Nice to have

**13. 19 empty `catch {}` blocks** (of 349 catches in `src/`)
- **What this is:** Errors caught and silently dropped.
- **Problem:** This exact habit hid finding 1. Most of the 349 catches do handle errors properly; the 19 silent ones are unmarked decisions. (The repo already has 3 `shortcut:` comments — ponytail's marker habit. It works; use it more.)
- **Fix:** In measuring/IO paths, log once with context; where silence is truly intended, one-line comment saying why.
- **If we skip it:** The next silent failure gets the same free pass.

**14. Duplicate truth in small places** (`vault/Brain/`, git branches)
- **What this is:** Four near-identical agent rule files (`AGENTS.md`, `CLAUDE.md`, and "(new)" copies that differ only in punctuation). 21 remote branches (`arena/*`, `archive/*`, `brain01`, `professional`, …).
- **Problem:** Two copies of the same rule always drift apart. 21 branches for a one-person project means "which branch is real?" is a real question (this audit had to check).
- **Fix:** Keep one pair of rule files, delete the "(new)" copies; delete merged/dead remote branches, keep `main` + active work. An afternoon of git you can do yourself.
- **If we skip it:** Small confusion tax on every future session, human or agent.

---

## Scope — is there more work worth doing?

Yes, plenty. Ordered ponytail-style: delete and shrink first, build second.

**A. Work you (first-year CS) can do yourself, safely, and learn from**
- Finding 14 (branches + duplicate files) — pure git, zero code risk.
- Finding 4 (un-export sweep) — TypeScript is your safety net: run `npm run typecheck` after each file. Perfect first refactor.
- Finding 1's check script — write a small Node script that generates a 12-second test video and asserts the real FFmpeg commands find the scene cut and the silence. This is the seed of honest tests, and teaches processes/pipes better than any tutorial.
- Read one feature top-to-bottom and write down the path (suggestion: `src/shared/lib/recall.ts` first — tiny pure functions — then trace one IPC call through the 4 layers of finding 5). A `docs/how-it-works.md` in your words will save every future agent session.

**B. Agent-sized, high value**
- Findings 5–7 (bridge stub helper, shared hash/atomic-write, splitting `main/index.ts` by domain). These make every later feature cheaper and make diffs reviewable by you.
- Finding 10 (one-pass audio) right after finding 1.

**C. Product scope (unchanged from the last audit — do not start before finding 1–3)**
- Real word-level transcription by *reusing* Kdenlive's built-in `desktop_transcribe` (already upstream) or a whisper.cpp adapter, instead of Windows `System.Speech`.
- Wire the ~49 upstream Kdenlive tools OddBrain ignores (project create, vertical profile, save, preview render, render + verify).
- Tool-calling for the Ollama path, so a free local model can drive the video tools ( today only signed-in Claude Code can).
- The Windows question for the Kdenlive fork (Craft build in CI vs file-based fallback) — still your decision to make.

**D. Anti-scope — the ponytail question: does it need to exist?**
Single-user desktop app, but the repo maintains extra surfaces: the web preview + single-file UI preview (~790-line bridge + build script), the sample workspace, and the skills/store machinery (~1,300 lines across `skillBundle`, `storeIndex`, `packs`, catalog installers). I am not saying delete them. I am saying: each surface taxes every change. If you, the only user, do not use the web preview or the store, deleting one surface is the largest efficiency win in this repo — bigger than any code trick. Decide as the owner; no agent should decide this for you.

## Reading this as a first-year CS student — honest notes

- **Size:** ~50k lines is not beginner-sized. Do not try to "read the repo." Read one feature at a time, along its data path.
- **What will confuse you first:** Electron's three processes (main / preload / renderer) and IPC (finding 5's four layers), async streaming, and FFmpeg filter strings. These are genuinely hard topics, not rite-of-passage hard. Every professional finds FFmpeg filters painful.
- **What is unusually kind to a beginner here:** plain-English names, comments that explain *why* (read `electron-builder.yml` and `src/main/chats/store.ts` headers), strict TypeScript (the compiler catches whole classes of your mistakes — use it as a tutor: change something, run `npm run typecheck`, read the errors), zero TODO/FIXME noise, only 45 `as any` and 25 `console.*` in 50k lines. For AI-built code, the hygiene is well above average. The slop here is not messy code; it is *confident* code — polished, compiling, and wrong at the edges (findings 1, 2, 12). That is the kind you must learn to smell: if there is no "unknown/restart/partial" state, be suspicious.
- **Your superpower as owner-reviewer:** you do not need to read every line. You need diffs small enough to read (finding 7) and checks that run real things (finding 3's replacement). Demand both from every agent, including me.

---

Verdict: The skeleton is sound; fix 1, 2, 3 first — they are the difference between "looks done" and "is done."
Lean: -29,653 lines and -3 dependencies when the test removal lands for real (finding 3); about -600 more lines if you take finding 5.
Not checked: anything that needs Windows, a signed-in engine, or a running Kdenlive (still impossible in this sandbox); Electron GUI behavior; the extension running in a real browser. Small extra findings were left out to stay at 14 — the next tier down is polish, not risk.
