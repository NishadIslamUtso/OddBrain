# MEASURED_PIXELS.md — Values Sampled Directly From The Screenshots

**Date:** 2026-10-11 21:20 Asia/Dhaka
**Source:** `spec/screenshots/*.png`, decoded with a plain-Python PNG reader
(no image libraries available), pixels sampled directly.

> ## ⚠ RULING — 2026-10-11, later the same day
>
> **The user's palette wins. The measured colours below are NOT used.**
>
> Measured values were shipped for a few hours, then the user ruled:
> *"didn't make it look like how I said … take the looks like I said"*.
> The app now uses the palette they specified:
>
> | Role | Measured (NOT used) | **User's value (shipped)** |
> |---|---|---|
> | Main | `#151515` | **`#1a1a1a`** |
> | Sidebar | `#111111` 384px | **`#202020` 260px** |
> | Composer | `#20201f` | **`#242424`** |
> | Accent | `#d97757` | **`#ff8c00`** |
>
> The measurements below are kept **as reference only**. They still govern
> geometry the user never specified — toolbar height, composer radius,
> transcript widths, greeting size, settings-nav grouping — because the user
> also asked for pixel-exactness to these screenshots.
>
> Rule for future work: **when a measurement disagrees with a value the user
> stated, use the user's value and say so. Don't silently override them.**

**Why this file exists:** the original `CLAUDE_SPEC_FROM_SCREENSHOTS.md` listed
*estimates* — "sidebar 260px #202020", "main #1a1a1a", "composer #242424".
Those estimates are what the user had specified, so they are **authoritative**
even though they differ from the pixels. Measurements are recorded here so the
difference is documented rather than argued about again.

## Method

`Screenshot 2026-10-10 191547.png` is 1920×1020, colour type 6 (RGBA), 8-bit,
non-interlaced. The PNGs were decoded with `zlib` + `struct` and the filter
types (0–4) reversed, then horizontal/vertical scans were run to find colour
transitions. Layout is in native pixels, treated as CSS pixels at 1:1 — i.e. it
matches the screen the screenshots were taken on at 100% scaling.

## Colours (all re-verified this session)

| Role | Hex | Where it was sampled | Status |
|---|---|---|---|
| Sidebar | `#111111` | y=600, x=0–372 | verified |
| Main | `#151515` | y=600, x=388–1593 | verified |
| Composer | `#20201f` | composer body, x 715–1591 | verified |
| Composer border | `#373736` | composer edge | verified |
| Search field | `#1d1d1d` | y 63–93 | verified |
| Search / row border | `#343434` | edge of search box, New row | verified |
| Active row, New row, selected nav | `#343434` | y 107–143 | verified |
| Primary text | `#f0efec` | greeting glyphs | verified |
| Body text | `#b8b8ad` | chat titles | verified |
| Muted | `#898781` | section labels, placeholder | verified |
| Accent (Claude spark) | `#d97757` | 607 px in greeting band | verified |
| Link (Upgrade) | `#4099ec` | Free-plan pill | verified |
| Avatar | `#292929` | footer NU circle | verified |
| Free-plan pill background | `#111111` | x 1051–1258 | verified |
| Settings content pane | `#1a1a19` | right pane of 191707 | from `c4f75cce` |

## Layout (native px, verified unless noted)

| Element | Value |
|---|---|
| Sidebar width | **384** (content to ~372, 1px `#5a5957` rule, `#292929` at 384) |
| Toolbar height | 48 (search field starts y=61) |
| Search box | y 63–93 (h 31), inset x 14 — rendered 35px tall |
| New row | y 107–143 (h 36) |
| Chat rows | 34px high, 38px pitch *(c4f75cce)* |
| Composer | x 715–1591 (w 877), y 518–657 (h 139), radius ≈ 18 |
| Under-composer row | Project at x 735; model/Medium/Manual right-aligned *(c4f75cce)* |
| Greeting | serif ≈ 44px, spark ≈ 46px, `#d97757` |
| Free-plan pill | x 1051–1258, y 126–170, bg `#111111` |
| Footer avatar | centre y 989, `#292929` |
| User menu (191608) | x 12–383 (≈371 wide) *(c4f75cce)* |
| Context menu (191646) | ≈233 wide, opens near the row *(c4f75cce)* |
| Settings modal (191707) | x 82–1839, y 51–971; nav 263 wide, items 44px pitch *(c4f75cce)* |
| Apps modal (191636) | x 82–1839, y 67–954; header 65px *(c4f75cce)* |

## Settings values read off 191707

- Left nav is **grouped**, and the flat 14-item list in the old spec was wrong:
  - **Settings** — General, Account, Privacy, Billing, Capabilities, Memory,
    Reflect, Time and focus, Claude Code
  - **This computer** — System, Extensions, Developer
  - **Customize** — Skills, Connectors
- Appearance: Theme `[monitor, sun, moon]`; Chat font **Anthropic Serif**;
  Transcript **text size** Small/Medium/Large (Medium); Transcript **width**
  Narrow/Medium/Wide (**Narrow**); Motion System/Reduced (System);
  Voice: Language English, Style Buttery, Speed Normal.

Composer width in 191547 is 878px, which is the **Narrow** setting — so Narrow
is the correct default, not Medium.

## What is still NOT measured

- **Light theme.** No screenshot shows it. The light values in `index.css` are
  approximations and are labelled as such.
- **Message bubbles and assistant text.** No screenshot contains a conversation,
  so those are inferred from the surrounding palette.
- **Fonts.** "Anthropic Serif" is not on this machine; `index.css` falls back to
  `ui-serif / Georgia`. Glyph metrics will differ slightly.

## How to re-verify

```python
# no third-party image libraries needed
import sys; sys.path.insert(0, 'tools')
from pngread import read_png, hexof
img = read_png('spec/screenshots/Screenshot 2026-10-10 191547.png')
print(img['w'], img['h'], hexof(img['px'](200, 600)))
```

The decoder lives at `tools/pngread.py` in this repo.
