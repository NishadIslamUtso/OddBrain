# Release notes — the Windows installer

## 0.9.0 — current (2026-10-17, the build to install)

| | |
|---|---|
| Name | `OddBrain-Setup-0.9.0.exe` |
| Size | SEE THE ROOT TABLE — this file defers to it |
| SHA-256 | SEE THE ROOT TABLE — this file defers to it |
| Signed | No — SmartScreen will say "unknown publisher" |

**What it is:** the full v3 feature set, the judges' security rounds, the
full OddBrain rename and the Windows-green suite. Built with
electron-builder NSIS on this branch; one exe kept at a time by rule. The
exact size and hash of the CURRENT build live in
`00_LIVING_DOCS/RELEASE-WINDOWS.md` (the root table) and in the release
commit message — one source of truth, updated with every rebuild, so this
file can never point at a stale byte count again.

## 0.1.2 — historical: the owner's own artwork, verbatim

| | |
|---|---|
| Name | `AI-ASSistant-Setup-0.1.2.exe` |
| Size | 87,929,333 bytes |
| SHA-256 | `a8fa8f275f68036930920b617bdeed1cb108df2e11396ab0f872d27ac4631f4a` |
| Signed | No — SmartScreen will say "unknown publisher" |

**What changed:** where the logo comes from. The owner supplied his own SVG export of the mark and said to
use it **everywhere, as SVG**. It is now the canonical file, byte-identical to what he sent:

- `resources/icon.svg` — his file, verbatim; the window icon, exe icon and installer icon are rendered from
  it (transparent background — the tile 0.1.1 put behind the mark is gone, because his file says transparent).
- `src/renderer/public/favicon.svg` — his file, verbatim (the previous favicon was a crop of the same artwork
  framed on the head, because the full figure turns to mush at 16 px; swapped as instructed — one line in the
  report says why, and it is a one-file change to go back).
- The app's `BrainMark` component renders the same artwork (it always did — a path-by-path diff against his
  file showed 32 identical paths and 22 identical colours) and gained his `<desc>` for screen readers.

**The renderer changed with it:** its source is now the SVG file itself instead of extracting JSX out of the
component, and it keeps a **sync guard** — paths, colours and circles must match the component or it refuses
to write an icon — plus the two audits from 0.1.1 (every `url(#…)` must resolve; the pixels must show the
brain, lenses, shine and sneakers with **transparent corners**).

**Verified:** 269 tests, typecheck, `SMOKE OK errors=0 warnings=0`, the 22-assertion artifact-library check
green, the icon read back out of the built executables (seven sizes, brain present, corners empty).

**If this file is missing from a fresh checkout:** the installer is ~88 MB and workspace snapshots may drop
it. Rebuild it from the pushed tree — `npm install`, then `npm run dist:win`
(two commands, PowerShell-safe; Linux needs Wine for the NSIS step).
NSIS stamps build time, so a rebuild hashes differently; the SHA-256 above identifies the delivered file
itself, and the icon inside any rebuild is held to the same audits (sync + references + pixels).

## 0.1.1 — the logo, for real this time

> Superseded by 0.1.2: same app, but the icon in 0.1.1 sits on a dark tile of my choosing. The owner's own
> export is transparent; 0.1.2 ships his file verbatim.

| | |
|---|---|
| Name | `AI-ASSistant-Setup-0.1.1.exe` |
| Size | 87,869,296 bytes |
| SHA-256 | `f56828ef96a08de4327221768bad648fa777e95a8bdec966a6e43768a261ad5f` |
| Signed | No — SmartScreen will say "unknown publisher" |

**What changed:** the icon. 0.1.0 shipped a mark with its body missing — the glasses, hands and sneakers
painted and the brain itself did not, which is what showed up on the desktop shortcut and in the title bar.
The cause: the brain is defined once inside the mark and painted **through a reference**, and the icon
renderer left that reference unresolved, so the body silently painted nothing while everything drawn directly
still looked plausible.

Three fixes, all in the renderer, none of them hand-drawn artwork:

- The renderer now **checks the drawing against itself** — every `url(#…)` in the extracted SVG must point at
  an id that exists — and **refuses to write an image** if one is missing.
- It then reads the render back **as pixels**: the pink body must be a large blob in the middle of the tile,
  the lenses grey with their white shine, the sneakers purple, and the tile clean where the drawing does not
  reach. A transparent PNG paints white behind itself in most viewers, which is how a hollow logo passed a
  look-at-it check once already; pixels are not a matter of opinion.
- The mark now sits on a **rounded dark tile**, because a white-bodied mark on transparency disappears on a
  light wallpaper and turns to mush at 16 px. The `.ico` carries seven sizes (16 → 256) instead of one PNG
  Windows scales badly.

It also carries the **Artifacts** screen from 0.1.0's successor (what the app builds now survives the
conversation), plus the sidebar's collapse/resize and the conversation-toolbar fixes.

**Verified before shipping:** 269 tests, clean typecheck, `SMOKE OK errors=0 warnings=0`, and the icon read
back **out of the built executables** with `wrestool` — all seven sizes present in both
`AI ASSistant.exe` and the installer, with the body present in the 64 px frame.

**Installing:** run it; it replaces 0.1.0 in place (per-user, no admin). Windows will warn about an unknown
publisher — there is still no signing certificate, and this file says so rather than pretending.

**Still true, unchanged:** it installs per-user, leaves your data on uninstall, and `npm run dist:win` on
Windows needs nothing extra.

---

# Release notes — `AI-ASSistant-Setup-0.1.0.exe` (Windows) — superseded

> The icon in this build is the broken one described above. Kept as history.

**What this is:** the first installer this app has had. Everything below is what a person actually needs to
know before double-clicking it — including the warning Windows will show and why.

---

## The file

| | |
|---|---|
| Name | `AI-ASSistant-Setup-0.1.0.exe` |
| Size | 87,748,105 bytes (~84 MB) |
| Target | Windows x64 |
| Built by | `electron-builder` 26.15.3, from `electron-builder.yml` at this folder's root |
| Type | NSIS, **assisted** install (not one-click) — you choose the folder |
| Signed | **No.** There is no code-signing certificate. |

---

## Windows will warn you. Here is why, and what to do.

**What you will see:** a blue box — *"Windows protected your PC — Microsoft Defender SmartScreen prevented an
unrecognized app from starting"* — naming an **unknown publisher**.

**Why:** SmartScreen trusts apps whose publisher has paid for a code-signing certificate and proven their
identity to a certificate authority. This build has no certificate, so Windows cannot tell who made it and
says so. That is what "unknown publisher" means — **not** that something was found inside it.

**What to do:** click **More info** → **Run anyway**.

**The honest caveat, stated plainly:** an unsigned installer is indistinguishable from a malicious one by
Windows alone. If you did not build this file yourself or download it from a source you trust, do not run it.
This one came from this repository, built by these exact commands, from this exact source — the recipe is at
the bottom of this page so it can be reproduced and compared.

---

## Installing

1. Double-click, click through SmartScreen as above.
2. **Choose the folder** (the default is fine: `%LOCALAPPDATA%\Programs\AI ASSistant`).
3. Finish. A **desktop shortcut** and a **Start-menu entry** appear.

- **No admin rights** are required: it is a per-user install (`perMachine: false`), so Windows will not ask to
  elevate.
- **Uninstalling keeps your data** (`deleteAppDataOnUninstall: false`). Settings, keys and any vault the app
  kept live on after the app is removed — deliberately. Memory that vanishes with an app is not memory.

### Where things live afterwards

| | |
|---|---|
| The app | the folder you chose, with an `Uninstall AI ASSistant.exe` inside it |
| Your vault | your own Obsidian folder (chosen in **Settings > Vault**) — the app never owns it |
| Settings and sealed keys | `%APPDATA%\ai-assistant\` |

---

## What it needs to work

- **Nothing to run it.** No Node, no npm, no build tools, no admin rights.
- **For the local model:** Ollama running at `127.0.0.1:11434` with a model pulled. The app talks to Ollama;
  it does not install or manage it. With no Ollama running, the app still opens and says so in one line —
  it does not hang and does not pretend.
- **For a cloud model (optional):** an API key pasted in **Settings > Models**. Nothing leaves the machine
  until a key is saved, and a reply is always labelled `local` or `online · <provider>`.

### First run, in order

1. Start Ollama (if you want the local model).
2. Open **AI ASSistant**.
3. **Settings > Vault** → point it at your vault folder.
4. **Settings > Models** → the models Ollama reports; add a key only if you want a cloud model.
5. Ask something ordinary. It should answer; the conversation should land in the vault as Markdown.

---

## What was verified before this file was offered

- **The payload inside the installer** was extracted and listed: `AI ASSistant.exe`,
  `resources/app.asar` (31.9 MB), `Uninstall AI ASSistant.exe`, `elevate.exe`, and exactly one locale file
  (`en-US.pak`) — 21 entries in all.
- **The same configuration packaged for Linux boots clean**:
  `SMOKE OK title="AI ASSistant" size=1280x820 errors=0 warnings=0` — so the packaged asar is complete and
  the app really starts from a package, not only from source.
- The full test suite, typecheck and both builds pass in the sandbox (255 tests, 27 files).

**What was *not* verified — say it plainly:** an actual install on Windows. There is no Windows machine in the
sandbox this was built in. A Wine "silent install" was attempted and is **not** evidence: unpacking the
payload under Wine outruns any sane timeout, so an empty folder afterwards would say nothing either way. The
install on a real Windows machine is the owner's own test, and it is the first item on the list.

---

## Building it yourself (reproducible recipe)

```bash
cd apps/03_oddbrain
npm install
npm run dist:win         # → dist/AI-ASSistant-Setup-0.1.0.exe   (installer)
npm run dist:win:dir     # → dist/win-unpacked/                 (unpacked folder, much faster, no NSIS)
npm run dist:linux       # → dist/linux-unpacked/                (for a smoke test off Windows)
```

- On **Windows**, `npm run dist:win` needs nothing extra.
- On **Linux**, NSIS needs 32-bit Wine: `dpkg --add-architecture i386`, then install `wine` **and**
  `wine32:i386`, and point `WINEPREFIX` at a folder **outside** the repo (`export WINEPREFIX=/var/tmp/wineprefix`).
  64-bit Wine alone fails with `could not exec the wine loader`.

### The two size decisions, stated on purpose

| Decision | Why |
|---|---|
| `electronLanguages: [en-US]` | The app is written in English. The other 54 Chromium locale files were 46 MB unpacked for text nobody would see — and a person who needs another language is better served by a real translation than by Chromium's menus. |
| `compression: maximum` | An installer is downloaded, often on a slow connection. Slower to build, smaller to ship: the first build was 95,963,305 bytes, this one is 87,748,105. |

### Icon

The app icon is the app's own **BrainMark**, rendered from the existing `BrainMark.tsx` component by
`shot-tools/render-mark.cjs` into `build/icon.png` (512×512) — **the arrangement this release had, since superseded by `resources/` and the reference/pixel checks above.** No new logo was drawn for packaging.

---

## Known gaps in this release

- **Unsigned** → the SmartScreen warning above.
- **No auto-update.** Installing a newer build means running a newer installer over it.
- **Windows x64 is the only target configured.** macOS targets are not set up; Linux builds work
  (`dist:linux`) but are not the owner's platform.

## 0.2.1 (2026-10-15, evening) — the mark + the PATH

- `AI-ASSistant-Setup-0.2.1.exe`, SHA-256
  `78b9b40f221b5fb0f0657c0994b50ba9c5b2d7c4c2477cef03040c56d65de14f`.
- Fixes his first-run findings: owner's canonical butt-brain mark everywhere
  (UI + favicon + installer icons, rendered by the committed
  `scripts/render-icons.mjs`), and the engine prepends the Windows npm folders
  to its own PATH so `claude` is found without PowerShell.
- Windows icon-cache note applies to the desktop shortcut after upgrade.

## 0.4.0 (2026-10-16, early) — the spine: Track A in one installer

- Resumable engine sessions (survive app restarts), usage + before/after on
  cards, per-engine brain routing, engine detection (self-serve agy check),
  pull/delete brains in the bay, skills + MCP deploy to every engine, the
  editable House rules delivered on every send. 343 tests.
- `AI-ASSistant-Setup-0.4.0.exe` (~84 MB), SHA-256
  `0c19f17ae64d2d768fe9967669132d1966fcd30e1424943a22d28992bbcaf666`.
