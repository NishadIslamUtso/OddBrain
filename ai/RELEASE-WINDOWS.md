# RELEASE-WINDOWS.md — the installer recipe (verified 2026-10-16, v0.8.0)

Everything needed to rebuild the installer on the build sandbox. Wine/NSIS
vanish on every sandbox restart; this is the whole ritual, start to finish.

## The recipe (executed in this order)

1. **Deps survive?** `ls apps/03_oddbrain/node_modules` — if gone:
   `npm install` in `apps/03_oddbrain/`.
2. **Sanity build:** `npm run build` (typecheck + electron-vite → `out/`).
3. **Wine (it is always gone):**
   `dpkg --add-architecture i386 && apt-get update -qq && apt-get install -y -qq wine wine64 wine32`
   (~65 s on the sandbox; wine 10.0 verified).
4. **Build:** in `apps/03_oddbrain/`:
   `npx electron-builder --win`
   (downloads Electron + NSIS + winCodeSign into `~/.cache`, then builds with
   `electron-builder.yml`: NSIS, oneClick, runAfterFinish, per-user, maximum
   compression, icon.ico from `resources/`).
5. **IMMEDIATELY copy the exe out** — `dist/` is a snapshot-excluded folder
   name and dies at the message boundary:
   `cp dist/OddBrain-Setup-<version>.exe /home/user/`
6. **Record:** size + sha256sum here and in the CHANGELOG.

## Builds

| Version | File | Size (B) | SHA-256 | When |
| --- | --- | --- | --- | --- |
| 0.4.0 | AI-ASSistant-Setup-0.4.0.exe | 88,049,746 | 0c19f17a… | 2026-10-15 |
| 0.6.0 | AI-ASSistant-Setup-0.6.0.exe | 88,062,356 | c0c9c0861873b7b2db69c0d5d924563aa04b9cd53b015c44a8c4a640835ea38c | 2026-10-16 (rebuild; 1st build's copy was lost to the workspace size cap — two 88 MB exes at once exceed it. The 0.4.0 exe was deleted to make room; NSIS timestamps make each build's hash differ) |
| 0.8.0 | AI-ASSistant-Setup-0.8.0.exe | 88,171,076 | 2ca94dd2f3350f4c0794bbb25745b107700a66fe94742623ea17a2fdb93fea7b | 2026-10-16 (rebuild 4, THE shipped build: the furnished store in resources/store + Code inside Projects. Ships everything to date. Copy at /home/user/AI-ASSistant-Setup-0.8.0.exe) |
| 0.9.0 | OddBrain-Setup-0.9.0.exe | 100,262,886 | 3f09aeab46b75460a8dd97864e2889dc3fbb5a785e9d04a82a244d884485232f | 2026-10-17, SHIPPED build (from the judges' round-3 tip: parsed-origin guard + adversarial tests, the pairing flow end to end - Agent access UI, extension popup, token on every extension request, unpaired captures dropped not queued - publisher-redirect allowlist, checkpoint write chain, zip aggregate on actual bytes, full gear relaunch, smoke green in CI on BOTH OSes; fuses via afterPack; verified in the shipped asar. Copy at /home/user/OddBrain-Setup-0.9.0.exe) |

## What the person installing will see

Unsigned, so SmartScreen says "Windows protected your PC" — More info → Run
anyway, once. One click, no questions, app opens when done. Uninstall leaves
the vault and settings alone.

## 2026-10-17 rebuild note

The installer is now built with `npx electron-builder --win nsis --x64` and an
`afterPack` hook (`apps/03_oddbrain/scripts/apply-fuses.cjs`) that flips the
Electron fuses on the packaged binary (no `ELECTRON_RUN_AS_NODE`, no
`NODE_OPTIONS`, no `--inspect`). Under Linux this needs working wine with
32-bit support (`dpkg --add-architecture i386; apt install wine32 wine`), a
fresh prefix (`rm -rf ~/.wine && wineboot -u`), and `XDG_RUNTIME_DIR` set —
electron-builder exercises the produced installer under wine as part of the
build. Output: `dist/OddBrain-Setup-0.9.0.exe` — shipped build sha256 3f09aeab46b75460a8dd97864e2889dc3fbb5a785e9d04a82a244d884485232f (100,262,886 bytes, Electron 41.10.7, the round-3 fixes; earlier builds replaced, one-exe rule)..
