# OddBrain v3 (`b81bf60`) — audit of the new repo

**Repo:** `https://github.com/NishadIslamUtso/OddBrain` · **branch `v3`** · tip **`b81bf6038773e4bf3f11bca82e2a47343d743a3e`**
**History:** `d78d6f4` (my last check) **is an ancestor** — 12 commits since, and both repos now report the *same* v3 tip, so the old URL is a live alias, not a fork.
**Method:** same as before — `npm ci`, `tsc`, `vitest`, web build, serve `dist-web/`, Playwright at 1440×700/900/1200, the same geometry and contrast functions. Nothing in either repo was modified.

---

## 0. Verdict in one paragraph

**This batch is the most honest engineering work the branch has produced, and it is still not the work you asked for.** The suite is genuinely de-padded, Windows CI was promoted from allow-failure to a real gate, Electron went to 41, and three security/truth findings from other reviewers were fixed at the source. All of that checks out. But **the UI you complained about is byte-identical to the version I measured two checks ago**: chat, settings, composer, tokens and the demo bridge have not changed by a single byte. Eight measured defects, still eight. And the new repo's **front door still shows the dead 0.7.0 app under the old name** — a visitor arriving at the new URL lands on exactly the thing I told you to stop showing.

---

## 1. Verified true (I ran it, not read it)

| Claim | Check | Result |
|---|---|---|
| Test suite | `npx vitest run` in `apps/03_oddbrain` | **78 files, 625 tests, 0 skipped** — matches the `9744e08` commit message exactly |
| Types / build | `npx tsc --noEmit`, `npx vite build --config vite.web.config.ts` | **exit 0 / green** |
| Suite de-padded | counted source-reading asserts in `tests/` | **169 → 6** occurrences across 2 files, and the survivors are the declared structural guards (no-old-name, fuse hook, shortcut) |
| Windows CI is a real gate | read `.github/workflows/checks.yml` | **`windows-latest` job, training wheels off**, plus a Linux job that posts failing suites as a commit comment via `github-script` |
| Electron 41 | `package.json` | **`^41.10.7`** |
| Watcher cooldown, downloader pins, `runInstaller` door | read `9744e08` diff + tests | fixed, each with a test that fails the old behaviour |
| Rename completed | `git ls-tree` + grep | app dir `apps/03_oddbrain`, vault `vault/Brain`, artifact zip is now **`oddbrain-artifact-<date>.zip`** (the leak I flagged is gone) |
| Honest doors stay open | read the commit | agy's brain list refuses until it can read something true; no MIT file exists in either repo |
| Nothing copied from the Claude payload | searched for fonts/assets | clean; patterns only |

Their own `JUDGE-BRIEF.md` is now the best document in the repo: it states plainly that no human has used the app, that agy is unproven past its sign-in gate, that **most screenshots were made against a labelled stand-in**, and that Windows has never run a test or an install. That is exactly the discipline I asked for, and they wrote it themselves.

---

## 2. The eight UI defects — re-measured on `b81bf60`

| # | Defect | `3fb6945` | `d78d6f4` | **`b81bf60`** | Status |
|---|---|---|---|---|---|
| 1 | Chat dead space | 109/309/609 | 24/146/446 | **24/146/446** | not fixed |
| 2 | CTA contrast | 4.35 : 1 | 4.35 : 1 | **4.35 : 1** (`#7C5CFF`, 40px) | not fixed |
| 3 | Settings values | 988px unused | 504px | **504px** | not fixed |
| 4 | `/api/ollama/tags` 404 | present | present | **present** | not fixed |
| 5 | Today = five "nothing" blocks | 5 | 5 | **5** | not fixed |
| 6 | Recipes button `aria-label` | missing | missing | **missing** | not fixed |
| 7 | Empty state type soup + duplicate line | 3 sizes | 4 sizes | **4 sizes, same duplicate "How can I help you today?"** | not fixed |
| 8 | "Mockups are the design authority" with no mockups | flagged | flagged | **still in `ARCHITECTURE-ENGINE.md:203`** | not fixed |

This is not a matter of opinion or a re-run drifting: I hashed the files.

```
ChatView.tsx     old=67b9b2780c3e  new=67b9b2780c3e  IDENTICAL
SettingsView.tsx old=c0afcf6032b5  new=c0afcf6032b5  IDENTICAL
Composer.tsx     old=91431a104fee  new=91431a104fee  IDENTICAL
bridge.ts        IDENTICAL      ollama.ts  IDENTICAL      globals.css  IDENTICAL
Sidebar.tsx      CHANGED — one line: the "Learn more" URL now points at the new repo
```

**Zero of eight fixed, across 12 commits and 471 changed files.** Every one of those 12 commits was another external judge's list, or the rename. Mine never entered the queue.

---

## 3. The new repo's front door is the old, dead app

The **default branch is `main`**, and `main` is still `8ab95ef` — *"Merge v3: v0.7.0"* from 2026-10-15.

- Its README opens: *"# AI ASSistant — Master Github Repo… **App Name:** `AI ASSistant` (preserve the double S)"*.
- Its app folder is `apps/03_ai-assistant`, `"version": "0.7.0"` — the build with the cramped header you complained about, and none of the 0.9.0 work.

So anyone who opens `github.com/NishadIslamUtso/OddBrain` sees the abandoned app, with the abandoned name, described as the current one. The v3 README says "OddBrain" and "built, tested, never used by a human" — but you have to know to switch branches to find it. **Fix, one action: make `v3` the default branch** (Settings → Branches), or merge it to `main`. Until then the rename is not visible to a visitor.

---

## 4. Fresh inaccuracies found in this batch

1. **The test count is wrong in both documents, in the same way.** `README.md:35` and `JUDGE-BRIEF.md:29,57` say **"78 files / 621 tests"**. I measured **78 files / 625 tests** on the exact tip, and commit `9744e08` itself says *"78 files / 625 tests"*. The documents were written once and not re-run. This is the third consecutive batch where the stated number and the measured number disagree — the pattern is the problem, not the digits.
2. **`JUDGE-BRIEF` §5 still describes Windows CI as a risk** — *"The CI Windows job was added 2026-10-17 and may fail at first"* and *"Known limitations: Linux-only verification so far"* — while the same tree has Windows promoted to a hard gate. The commit message knows ("the training wheels come off"); the brief does not. Stale text at the top of the document a judge is told to read first.
3. **The installer still cannot be checked.** `OddBrain-Setup-0.9.0.exe` and its sha256 (`cfb7e7a7…045a`) are not in the repo. Not dishonest — just not evidence. Their brief correctly says it was built via wine and never installed by a human.

---

## 5. What I say about "done"

It is done for the list the agent keeps choosing: engines, suites, CI, security doors, rename. That list is real and it is now unusually well-documented for an AI-built branch.

It is **not** done for the list you gave me: the app still opens with a purple button that fails contrast, a greeting floating a screen and a half above the composer, settings that leave half the pane empty, a console error on every load in the preview, a Today screen that says "nothing" five times, and a first-run chat screen with four competing type sizes. None of those need a model, a Windows box, or another judge — they need one afternoon and the eight-item list in §5 of `V3-RECHECK-2026-10-17.md`.

Two things to send back, in order:

1. **Make `v3` the default branch.** Otherwise the new repo's first impression is the old app.
2. **Do the eight UI items**, then re-run `vitest` and quote the number it prints — not a number copied from a previous document.

---

### Appendix — evidence

- Clone at `b81bf60` (detached), 12 commits past `d78d6f4`, 471 files changed (+2,380 / −477).
- `npm ci --ignore-scripts` → clean; `tsc` exit 0; `vitest` **78 / 625 / 0 skipped**, 37.0 s; web build green (605 KB chunk advisory unchanged).
- Browser: headless Chromium 156 at `:4182`; walked first-run; measured gaps, CTA colours, settings geometry, aria names, Today's empty phrases, and captured HTTP ≥400 on every load.
- Screens: `qa/v3-real/FINAL-chat-900.png`, `FINAL-settings.png`, `FINAL-today.png`; earlier: `qa/v3-real/RECHECK-*.png`, `qa/v3-real/v3-*.png`.
- File-identity proof: SHA-256 prefixes of the three defect files compared between `d78d6f4:apps/03_ai-assistant/…` and `b81bf60:apps/03_oddbrain/…` (table in §2).
