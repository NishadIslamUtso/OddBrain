# OddBrain — what a judge needs to know

A desktop app (Electron + React + TypeScript) that drives coding-agent CLIs —
Claude Code and Google's agy — over their own stream-json protocols, renders
their work as permission cards and file checkpoints in a local Obsidian-style
vault, and can fall back to a local Ollama for free brains. It is a local,
offline front-end; it ships no model and no cloud service.

Owner: Nishad Islam Utso. Branch of record: `v3`. This brief supersedes
everything in `archive/` and the promotional voice of `CHANGELOG.md`.

## What is actually proven

| Claim | Proof |
|---|---|
| The Claude Code wire (stream-json, tool events, permission round-trip, resume) is parsed correctly, including hostile chunk boundaries | `npm ci && npx vitest run` — the parser tests feed real wire shapes, chopped at regular offsets and mid-character |
| A Deny reaches the engine as a real deny response (not UI suppression) | wire-level tests + code path in `src/main/engine/claudeCode.ts` |
| File checkpoints complete before an Allow is forwarded — and a checkpoint that CANNOT be saved denies the change instead of allowing blind; engine-created files are undone one at a time, by name | race test, fail-closed test, multi-ghost test; live figure `receipts/shots/g66-checkpoint-ghost.png` |
| Watch mode never fires on deletions; the engine's own writes are suppressed; a bricked watcher now FAILS the suite (a real fire is driven end to end in `tests/watch-fire.test.ts`) | behavioral test + `g68-watch-truths.png` |
| The app asks the user's shell for the real PATH and merges it (fixes "'claude' is not recognized" in packaged apps) | tests in `tests/claudereverse-takes.test.ts` |
| Memory reads stay inside the memory folder, symlink-safe | tests with real symlinks on a real filesystem |
| The agy wire implementation matches the real agy v1.4.0 binary's documented non-interactive mode | flags verified against the real binary's `--help` and probes; see the limitation below |

Verify with:

```bash
git clone -b v3 https://github.com/NishadIslamUtso/OddBrain.git
cd OddBrain/apps/03_oddbrain
npm ci && npx vitest run      # 131 files / 893 tests
npx tsc --noEmit && npm run build
```

CI runs the same four steps on every push (Linux; a Windows job exists in
promoted from allow-failure to a required, green gate on 2026-10-17).

## What is NOT proven — read before judging

1. **No human has ever used this app.** The owner has not run it. There is no
   recorded session of a real model answering through this UI. Everything
   below the app is real; the app has never been lived in.
2. **agy is implemented, not proven.** The wire shape comes from the real
   binary's own `--help` and probes. The app has reached agy's Google
   sign-in gate and reports it correctly (`g67-agy-real.png`), but no
   signed-in agy turn has ever been driven, and the models list is defensive,
   not verified.
3. **Most screenshots were made against a test stand-in, not a real engine.**
   Figures g27–g65 and g66/g70/g71 were captured with a scripted fake CLI
   (`ob-shim`, now answering `claude --version` as "TEST STAND-IN") because
   real engine sign-in cannot happen in this sandbox. The stand-in proves the
   app's half of the wire, never a model's answer. One real claude-binary
   permission round-trip exists (an external judge drove it, 2026-10-17).
4. **Windows runs and gates, but no human has installed on it yet.** The CI
   Windows job runs on every push, is a required check, and has been green
   since 2026-10-17 (the same day it was promoted from allow-failure). The
   installer
   was built cross-platform (wine) but never installed by a human.
5. **The test suite is honest as of 2026-10-17, and its honesty is
   mutation-checked.** 169 asserts that read source files were removed, and
   the count stands at 131 files / 893 tests after the judge rounds and the real-machine rounds added
   behavioral tests: a bricked watch mode now fails the suite, a checkpoint
   that cannot save now denies the change instead of allowing blind, and a
   zip bomb is refused before it inflates. A small number of
   structural-identity checks remain on purpose — the no-old-name guard,
   the fuse-hook wiring, the shortcut name — and they say so in their own
   text instead of passing as behavior.
6. **Everything says OddBrain, including the GitHub repo.** Product,
   installer (`OddBrain-Setup-0.9.0.exe`, sha256 `3f09aeab…232f`), app title,
   shortcut, source tree (`apps/03_oddbrain`), checkout vault (`vault/Brain`),
   default vault path (`Documents\OddBrain\Brain`), and the repo itself —
   renamed by the owner 2026-10-17; the old URL redirects.

## Where the installer comes from

Every push to `v3` or `main` packages the Windows exe on a real Windows
runner (the `installer` workflow) and uploads it as an artifact of that run —
download it from the Actions run page, with its sha256 beside it. Pushing a
tag `v*` publishes a GitHub Release with the exe attached. The workspace
hash below is the same build recipe; the CI artifact is the independently
verifiable one.

## The three rules the code actually keeps

1. One send path: every feature (recipes, watch, split, quick window) sends
   through the same engine queue, so permission cards govern everything.
2. The app adds no engine rules: throttles map to each CLI's own flags.
3. Logins belong to the user's terminal; the app never stores or forwards
   engine credentials.

## Known limitations

- A human Windows install and a signed-in real-engine turn are still owed (see 4).
- The receipts gallery mixes stand-in and real evidence; every figure's
  caption in the gallery does not distinguish them — this brief does.
- `CHANGELOG.md` records development in a promotional voice; treat it as a
  log, not as assessment. `00_LIVING_DOCS/archive/` is the same, older.
