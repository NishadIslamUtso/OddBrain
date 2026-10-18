# Source artifacts and where they are

The uploaded design files and the source patch were not deleted. This is the
inventory, with checksums so a copy can be matched byte for byte.

## Uploaded design files

Kept in the workspace at `ctx/uploads/`, and on the `agent-resources` branch
(`d1e3402`) under `uploads/`.

| File | Bytes | SHA-256 |
|---|---|---|
| `OddBrain.html` | 1,668,917 | `16b9291c53a786a9c03ec63cc71c78471107352c6e17ad19f2e32dda1ad88554` |
| `index.html` | 258,848 | `96d56826d4ef13fc136b0c682f9ce16e87bbdc3b5bf84bd2d8079ee648e8dc58` |
| `index (1).html` (branch name `uploads/index`) | 195,369 | `d135715ed19935f0a986655b0a2b4b3bd6d15018fef44e931b8271558044a63f` |
| `butt-brain-animations.html` | 122,503 | `b2c7cc1f0a66b9f89a9665b388d4550ae1b4df262b766a4c31c56dcc2a0e293f` |

`OddBrain.html` is the concept: 8 layouts, 9 palettes, the looks and styles,
and the scene catalogue. The two `index` files and `butt-brain-animations.html`
are the animation references (76 scenes plus the loader, 304 status words)
that the generated motion kit came from.

## Source patch

`ctx/reference/session-v2/`, also on `agent-resources` under
`reference/session-v2/`.

| File | Bytes | SHA-256 |
|---|---|---|
| `OddBrain-App-UI.patch` | 582,388 | `a5859feaeb4935dbed00997bd6377f19970ab21dad61399888ec2465a5dc4261` |
| `PATCH-MANIFEST.json` | 103,663 | per-file before/after hashes |

The patch's baseline is `2f05dac`; it applies cleanly to that tree. It touches
94 files.

## Archives

`ctx/archive/previous-deliverables/`, also on `agent-resources` under
`archive/previous-deliverables/`. Selected checksums:

| File | SHA-256 |
|---|---|
| `OddBrain-APP-CODE-v2.zip` | `2d41d98d96ca13007075b831b253a6a8a2970712978612bbc2fe8e60d4c8efe4` |
| `oddbrain-motion-kit-v3.0.0.zip` | `6f0aa7b6a7c1bb2aee99b82fb08d5bd432735bba76e67720522f8b660be38080` |
| `OddBrain-UIUX-Handoff.zip` | `31cd600d53d2f294a859c23b19eb670cfc6903e411811ccd4e11b5e3f8f84f63` |

The full previous work tree is `ctx/archive/previous-work-2026-10-18.tar.gz`
(74,607,919 bytes, 87 MB unpacked context).

## What was applied

The current app tree contains all 94 patch paths. 76 of them are byte-identical
to the patch's after-state. The other 18 are the files that the merge with
`main` `a6c7807` and this pass's fixes changed on purpose:

`src/main/engine/claudeCode.ts`, `src/main/engine/socket.ts`,
`src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/App.tsx`,
`src/renderer/src/components/ChatView.tsx`, `Composer.tsx`, `EnginePanel.tsx`,
`MessageRow.tsx`, `SettingsView.tsx`, `src/renderer/src/main.tsx`,
`src/renderer/src/platform/bridge.ts`, `src/renderer/src/state/appearance.ts`,
`src/renderer/src/styles/desktop.css`, `src/renderer/src/ui/AppearancePanel.tsx`,
and the tests `appearance.test.ts`, `desktop-look.test.ts`, `engine.test.ts`.

No file from the patch is missing.
