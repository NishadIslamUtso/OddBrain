# CLAUDE SPEC FROM SCREENSHOTS — Extracted Pixel Spec

**Source:** 6 screenshots 191547.png to 191707.png in spec/screenshots/
**Date:** 2026-10-10
**Purpose:** Exact pixel measurements, colors, layout for apps/01_claude-exact-pixel-clone

> ## ⚠️ READ `spec/MEASURED_PIXELS.md` FIRST
>
> The colour and layout values below are **estimates** and several are wrong.
> On 2026-10-11 the PNGs were decoded and sampled directly; the real values are
> sidebar **#111111 / 384px**, main **#151515**, composer **#20201f**,
> active row **#343434**, accent **#d97757**, text **#f0efec**.
> `spec/MEASURED_PIXELS.md` is now authoritative and is what the app uses.
> This file is kept for the structural description of each screenshot.

## Screenshot 191547.png — Main Window

### Layout
- Window: native Windows, title bar visible, File Edit View Go Help menu (from 191558)
- Sidebar: left 260px width, background #202020, full height, scrollable
  - Top: Search field with magnifying glass icon, placeholder "Search", background #2a2a2a, rounded-lg, height ~36px
  - + New chat button: white? Actually dark with plus icon, full width, rounded-lg, margin top 8px
  - Sections: Projects, Artifacts (2), Customize — each with icon + text, small, uppercase? Actually normal case, #888 secondary
  - Chat groups: "Oct 8" group header, small uppercase, #666, margin top 16px
    - Chat item: "Refining a 5-day workout cycle..." — active? White text, background #2a2a2a rounded, padding 8px
  - Older group: header "Older", same style
    - Items: "Identifying charisma type", "Realme 6i - realme... fix", "Fix AI generated Facebook picture", "PSY 101-01W | Unit 1 | Quiz Review", "STA201 - Elements of Statistics", "PHY-112, Principles of Physics II", "CSE220 MID - Data Structure and Algorithms", "Function: Manage memories..." — each truncated, #e0e0e0 text, hover #2a2a2a, padding 6px 8px, rounded
- Center: background #1a1a1a, flex-1, centered content max-w-4xl, padding 24px
  - Greeting: "Evening, Utso." — serif font, 3xl (30px), bold, #e0e0e0, with orange asterisk * superscript orange #ff8c00
  - Composer: background #242424, rounded-xl (12px), border #333, padding 16px, max-width 768px, centered
    - Placeholder: "How can I help you today?" — #888, 16px
    - Textarea: transparent, no border, auto-grow, min-height 24px, max-height 200px, #e0e0e0 text
    - Bottom row: left Project dropdown with folder icon + "Project" + chevron, right model selector "Sonnet 5.5 Medium Manual" with dropdown arrow, both #888 small 12px
    - Send button: bottom right, white circle #fff, arrow icon #000, 32px diameter, hover #e0e0e0
- Top bar: right side "Free plan • Upgrade" — Upgrade button white? Actually text link with arrow, #e0e0e0 small 12px, Free plan #888
- Bottom left: avatar circle with "NU" initials, #4a4a4a background, white text, 32px, next to "Utso" name #e0e0e0 14px + "Free" badge #888 12px

### Colors
- Sidebar #202020
- Main #1a1a1a
- Composer #242424
- Border #2a2a2a / #333
- Text primary #e0e0e0
- Text secondary #888
- Text tertiary #666
- Accent white #fff send button, orange #ff8c00 asterisk
- Hover #2a2a2a

### Behavior
- Dark default
- Sidebar collapsible? In screenshot always visible 260px
- Chat list scrollable
- Composer sticky bottom? Actually centered in middle for new chat, moves to bottom when messages exist
- Search filters chat list in real-time

## Screenshot 191558.png — File Menu

- Native menu bar: File Edit View Go Help
- File menu items: standard? Not visible expanded, but menu bar exists
- Indicates Electron or native Windows app, not just web — title bar + menu bar visible, fully on-screen

## Screenshot 191608.png — User Menu

- Trigger: click avatar NU Utso Free bottom left
- Menu: dark #2a2a2a, rounded-lg, shadow, width ~240px, position above avatar, z-index 50
- Header: nishadislamutso@gmail.com — #e0e0e0 14px, email truncated?
- Items:
  - Settings — gear icon
  - Language — globe icon
  - Get help — question mark icon
  - Upgrade plan — star icon
  - Get apps and extensions — grid icon
  - Learn more — info icon
  - Get API keys — key icon
  - Log out — logout icon
- Each item: icon left #888, text #e0e0e0 14px, hover #333 background, padding 8px 12px, rounded
- Separator lines #333 between groups

## Screenshot 191636.png — Apps and Extensions Modal

- Modal: centered, dark #1a1a1a or #242424 background, rounded-xl, width ~600px, max-height 80vh, overlay #000 50% opacity
- Header: "Do more with Claude everywhere you work" — 20px bold #e0e0e0, close X button top right
- Sections:
  - Claude Code: Terminal, VSCode etc — icon + title + description
  - Microsoft 365: Word Excel etc
  - Chrome extension: etc
- Each app: icon 32px, title 16px #e0e0e0, description 12px #888, install button
- Trigger: User menu -> Get apps and extensions, or Settings -> Extensions

## Screenshot 191646.png — Context Menu

- Trigger: right-click on chat item (e.g., CSE220 MID - Data Structure and Algorithms)
- Menu: dark #2a2a2a, rounded-lg, shadow, width ~200px, position near cursor, z-index 50
- Items:
  - Open in new window — external link icon
  - Pin chat — pin icon
  - Rename — pencil icon
  - Add to project — folder plus icon
  - Move to group — move icon
  - Delete — trash icon, red? Actually #e0e0e0 but hover red
- Each item: icon left #888, text #e0e0e0 14px, hover #333, padding 8px 12px, first item may have separator below
- Delete has separator above

## Screenshot 191707.png — Settings Appearance

### Left Nav
- Width ~200px, background #202020 or #1a1a1a, border right #2a2a2a
- Items: General, Account, Privacy, Billing, Capabilities, Memory, Reflect, Time and focus, Claude Code, System, Extensions, Developer, Skills, Connectors
- General selected: background #2a2a2a, white text, others #888
- Each item: 14px, padding 8px 12px, rounded, hover #2a2a2a
- Icons left for each

### Right Content — Appearance
- Header: "Appearance" — 20px bold #e0e0e0
- Sections:
  - Theme: label "Theme" #e0e0e0 14px, options: System (monitor icon), Light (sun icon), Dark (moon icon) — Dark selected, white border, background #2a2a2a, rounded-lg, 3 options horizontally, each 80px width, icon top + text bottom
  - Chat font: label "Chat font" #e0e0e0 14px, value "Anthropic Serif" — dropdown or button, #2a2a2a background, rounded, padding 8px
  - Transcript size: label "Transcript size", options Small/Medium/Large — Medium selected, segmented control #2a2a2a background, white selected
  - Width: label "Width", options Narrow/Medium/Wide — Medium selected
  - Motion: label "Motion", options System/Reduced — System selected
  - Voice: label "Voice", sub-sections Language English, Style Buttery, Speed Normal — each dropdown #2a2a2a
- All controls: dark #2a2a2a, rounded, #e0e0e0 text, #888 secondary

### Overall Settings Modal
- Modal: centered, dark #1a1a1a background, rounded-xl, width ~800px, height ~600px, flex row left nav + right content, overlay #000 50%
- Close X top right

## Implementation Checklist for Exact Clone

### Done (apps/01_claude-exact-pixel-clone)
- [x] Sidebar 260px #202020, Search, New chat, Projects / Artifacts (n) / Customize, Pinned + Today + Oct 8 + Older groups, chat list seeded from the screenshots
- [x] Context menu (191646) Open in new window / Pin / Rename / Add to project / Move to group / Delete — all six work (inline rename, confirm on delete)
- [x] Center #1a1a1a: "Evening, Utso." greeting with the orange asterisk, composer #242424 "How can I help you today?"
- [x] Top Free plan · Upgrade, bottom NU Utso Free avatar
- [x] Direct Ollama streaming + vault API
- [x] Settings modal (191707): left nav General→Connectors + Appearance (Theme System/Light/Dark, Chat font, Transcript size, Width, Motion, Voice Language/Style/Speed), persisted, really applied
- [x] User menu (191608): email header + Settings, Language, Get help, Upgrade plan, Get apps and extensions, Learn more, Get API keys, Log out
- [x] Apps and extensions modal (191636): Claude Code, Microsoft 365, AI ASSistant Chrome extension, Capsule Hub, inline suggestions
- [x] File / Edit / View / Go / Help menu bar (191558), custom bar for the web build with live Ollama + Vault status dots
- [x] Composer bottom row is real: attach (+), Project dropdown, **model selector listing Ollama models**, effort (Medium), thinking (Manual), send
- [x] Artifact runner: HTML/SVG sandboxed preview + code tab + copy/download/save-to-vault. **Only created when explicitly asked** (the Tic Tac Toe loop fix)
- [x] Search filters the chat list in real time
- [x] Pin / Rename / Delete / Move to group / Add to project all functional
- [x] Theme switcher: system / light / dark, remembers the choice, CSS-variable driven
- [x] File + image upload; images only sent to vision-capable models
- [x] Thinking display for `<think>` blocks
- [x] Capsule drag-drop injection from the AI-Brain panel into the composer
- [x] Never-check blacklist manager + Today (Current Snapshot / Open Loops / journal path)

### Still Missing
- [ ] Native Windows title bar + menu (Electron wrapper) — the web build uses a custom bar
- [ ] Journal draft generation and follow-up controls on the Today tab
- [ ] Windows installer
- [ ] Confirmation from the user that it matches the screenshots on their actual screen

## Pixel Measurements (Approximate from Screenshots)

- Sidebar width: 260px
- Search height: 36px, rounded 8px, background #2a2a2a
- +New chat height: 36px, rounded 8px, margin 8px 0
- Chat item height: ~32px, padding 6px 8px, rounded 6px, gap 4px between items
- Group header: uppercase 10px #666, letter-spacing 0.5px, margin 16px 0 8px 0, padding 0 8px
- Center max-width: 768px (max-w-4xl)
- Greeting font: serif, 30px (text-3xl), line-height 36px, margin bottom 24px
- Asterisk: superscript, orange #ff8c00, 16px, margin left 4px
- Composer: rounded 12px, padding 16px, border 1px #333, background #242424, width 100%, max-width 768px
- Composer textarea: min-height 24px, max-height 200px, font 16px, line-height 24px
- Composer bottom row: height 32px, margin top 12px, flex justify-between, font 12px #888
- Send button: 32px circle, background white, icon black 16px, position absolute bottom 12px right 12px
- Top bar: height 40px, padding 0 16px, flex justify-end, font 12px
- Avatar: 32px circle, background #4a4a4a, text 14px white, margin right 8px
- Context menu: width 200px, rounded 8px, background #2a2a2a, shadow 0 4px 12px rgba(0,0,0,0.5), padding 4px, z-index 50
- Context menu item: height 36px, padding 8px 12px, rounded 6px, font 14px, icon 16px left, hover #333
- Settings modal: width 800px, height 600px, rounded 12px, background #1a1a1a, left nav 200px #202020, right content flex-1 padding 24px
- Theme option: width 80px, height 80px, rounded 8px, background #2a2a2a, border 1px #333, selected border white, icon 24px top, text 12px bottom

## Reference Implementation

See apps/01_claude-exact-pixel-clone/src/components/Sidebar.jsx for sidebar + context menu
See apps/01_claude-exact-pixel-clone/src/components/Center.jsx for greeting + composer
See apps/02_electron-claude-clone-v6/src/components/SettingsModal.jsx for Settings modal reference (needs update to match 191707.png)

## Notes

- Screenshots show real Claude desktop app, not web — but our exact clone is Vite web first, then Electron wrapper for native menu bar
- Orange asterisk in greeting is Claude branding — keep it
- "Evening, Utso." is time-based greeting — implement getGreeting() returns Morning/Afternoon/Evening + Utso
- Chat list defaults from screenshots: Refining 5-day workout cycle etc — use as initial localStorage data for exact match
- Free plan Upgrade top right is Claude's free tier indicator — keep for exact match, but our app is local free
- NU Utso Free bottom left avatar — from user email nishadislamutso@gmail.com, initials NU, name Utso, Free badge
