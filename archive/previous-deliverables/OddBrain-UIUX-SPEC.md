# OddBrain UI/UX implementation specification · revision 2

**Owner-approved direction, updated 17 October 2026.** Implement in `apps/03_oddbrain`. Open `OddBrain-UIUX-REFERENCE.html` first. This revision **replaces the previous nine-option UI/UX spec**, not merely supplements it.

The previous reference omitted most of the owner's uploaded `OddBrain.html`. That omission is corrected here. Retain its eight complete looks, eight actual layouts, nine palettes, four interface styles, motion controls, scene assignments, comparison, quiz, custom mixes and shortlist. Also retain the real app's existing controls. Moving a feature is not permission to remove it.

## 1. Authority and boundaries

1. This document defines behavior, retention, measurements and acceptance. The new reference HTML demonstrates the complete visual direction and interactions.
2. The owner's uploaded `OddBrain.html` remains the inventory source. This revision reorganizes it; it does not discard its options.
3. Current-app behavior is the real implementation. The inspected source is commit `2f05dac9a5f7a191104377ef940f81e76b9ebd74`. The HTML is a **design preview**, with scripted responses and sample records. Never replace the real engine, filesystem, provider or extension code with its simulation code.
4. No repo/README cleanup, new cloud service, microphone access, background telemetry, new font dependency or backend redesign is part of this pass.
5. Windows PC only. Minimum content window: **940 × 620**. Test comfortable sizes **1280 × 820** and **1440 × 900** too. Do not grade a mobile layout as a missing product feature.

## 2. Keep the existing scale

These are default numbers, not suggestions to scale the whole app up. Structural choices change arrangement; density changes spacing; the text-size setting changes only conversation text.

| Element | Size |
|---|---|
| Main page / empty-chat heading | 30px / 1.15 / weight 600 / tracking -0.01em |
| **Settings page heading** | **15px / weight 500**. Do not use a 30px settings title. |
| Section heading | 15px / medium |
| Body / UI | 13px / 1.5 |
| Navigation | 12.5px |
| Metadata / transient brain reply | 12px |
| Micro / optional row explanation | 11px |
| Conversation text | 14.5px / 1.65 by default; Small 13, Medium 14.5, Large 16.5 |
| Code | 12.5px, installed monospace stack |
| Standard title / navigation bar | 44px. Do not stack two bars unnecessarily. |
| Sidebar | 260px default. Preserve the real app's resize range, **200–420px**, and collapse state. |
| Collapsed rail | 56px |
| Main nav row / icon | 28px / 15px |
| Primary New chat button | 40px / radius 8 / 13px medium |
| Small control / icon button | 28px minimum |
| Send button | 32px square |
| Composer / panel radius | 14px default. Style choice may change the radius, not text size. |
| Settings nav | 220px; 200px at the smaller desktop width |
| Settings content padding | 28px; 24px at the smaller desktop width |
| Conversation width | Narrow 640, Medium 760, Wide 1040; always bounded by available width |
| Main brain | 180px canvas; 150px when the window height is 700px or less |
| Activity / footer brain | 24px |
| Assistant identity | 18px **logo mark**, not a tiny animated full-body mascot |
| Default motion | controls 160ms; small feedback 120ms; panels 220ms; easing `cubic-bezier(.2,.7,.2,1)` |

Default face: `system-ui, 'Segoe UI', sans-serif`. No Inter. No bundled or remote font. The original alternative type choices are opt-in; they must not resize the interface.

## 3. Quiet shell, full functionality

### 3.1 Delete decorative status furniture

No “Local” badge, local-workspace subtitle, “live” / “offline” indicator, pulsing dot, green dot, grey dot, replacement lamp, fake connection chip, prototype badge, permanent tutorial or explanatory strip at the top. Do not replace a removed dot with a differently shaped status ornament. Do not duplicate the brand in two adjacent headers.

This does **not** mean hiding actual task state, errors or privacy decisions. Keep these where they matter:

- Engine work immediately above the composer.
- A real approval request in the conversation.
- Provider / inference location in the model selector and Settings, especially before sending selected context to a cloud model.
- Errors next to the failed action, with a working recovery action.
- Pairing information in Agent access / Connectors.
- Folder-watch state next to the watch control, not in global chrome.

### 3.2 Sidebar footer

Exactly one button: **24px brain + person's name**, 13px medium, 48px tall. No Local text, initials disc, settings cog, dropdown chevron, second utilities row or popup menu. The whole row opens **Settings → You** directly.

Browsing maps and apps/connections leave the footer and become Settings destinations. The same Settings entry must remain discoverable in every layout. An icon-only rail may use the brain as the compact entry, with the person's name in its accessible label and tooltip.

Main destinations stay Chat, Artifacts, Today, Projects, Vault and Brain. Code remains accessible through Projects and search. Keep conversation search, open, rename, pin, move to project/group and delete. Preserve drag resizing, double-click width reset, collapse persistence and keyboard access. Layout switches must not reset selection or lose a draft.

### 3.3 Former name-menu actions: explicit retention map

Verified against both the real repo's `UserMenu` and the uploaded concept's Profile menu.

| Previous action | New destination | Required real behavior |
|---|---|---|
| Settings | You, with full settings navigation | Open directly. `Ctrl+,` still works. |
| Get API keys / Model & key information | Models & API keys | Existing provider-key forms, provider links, save/remove and custom-provider controls stay. Do not substitute the model picker for key management. |
| Install apps and extensions / Apps & connections | Connectors | Existing app/runtime setup, extension pairing and connection actions stay. |
| Plugins & community | Plugins | Existing installed packs, indexes, inspect/install, remove and pack export stay. |
| Browsing Maps | Browsing maps | Existing map/timeline, filters, source details and navigation stay. |
| A smaller window | Windows & shortcuts | Existing Quick window enable control and actual open action. |
| Learn more | About & help | Existing repository/help route remains reachable; desktop external links use the app's existing safe external-open bridge. |

Settings → You visibly lists these destinations. None disappears just because it also has a place in the navigation.

## 4. Complete Appearance inventory

Appearance has five compact sub-tabs: **Looks · Layout · Details · Brain & motion · My mixes**. One universal Settings navigation, not an app sidebar surrounding another sidebar. No utility tray floating over the workspace.

### 4.1 Looks: all eight complete presets

Selecting a preset explicitly applies a bundle once. Subsequent individual choices are independent. A preset must never reassert its font, palette, layout or motion after the person changes one of those settings.

| Preset | Palette | Style | Layout | Type | Motion / spacing |
|---|---|---|---|---|---|
| Warm Editorial | Paper & Plum | Editorial | Classic sidebar | Serif headings, clean system body | Balanced / Roomy |
| Cozy Studio | Peach Fuzz | Soft studio | Top bar | Humanist | Calm / Roomy |
| Quiet Minimal | Quiet Graphite | Editorial | Command first | App sans | Calm / Compact |
| Playful Lab | Lemon Drop | Soft studio | Bento dashboard | Humanist | Playful / Roomy |
| Ink & Sketchbook | Paper & Plum | Ink & paper | List + detail | Bookish serif | Balanced / Roomy |
| Terminal / Engineer | Midnight Ink | Editorial | Console | Monospace | Calm / Compact |
| Retro Desktop | Blue Hour | Editorial | Floating window | Humanist | Balanced / Roomy |
| Glass / Futuristic | Rose After Dark | Glass studio | Rail + list | App sans | Balanced / Roomy |

Each also carries the uploaded preset's eight activity-scene assignments. Preserve those assignments. A preset sets native palette accent, “As designed” theme, 1× speed, unpaused motion, and matching interface/chat typography. It does **not** change model, engine, API keys, permissions, approvals, cloud consent, startup flags, quick-window enablement, chat text size, conversation width, name, saved looks, mood words or explanations.

Do not show a checkmark for a preset that no longer matches its bundle. Edited combinations can be saved under My mixes. The restrained current-app dark/sans look remains the initial default; the warm/editorial preset is not imposed on everyone.

### 4.2 Layout: all eight, genuinely structural

| Layout | Actual structure |
|---|---|
| Classic sidebar | Resizable left navigation and recents; content to the right. |
| Top bar | Six sections across one top bar; no persistent left sidebar. Recents via search. |
| Rail + list | 56px icon rail, 220px item list (180px at smaller widths), content. |
| Command first | Search/command entry and one focused content area. Search is clickable as well as keyboard-accessible. |
| List + detail | Top section navigation, 260px list, selected detail beside it. |
| Bento dashboard | Top navigation. Today becomes a **hierarchical working dashboard**: primary Continue area, projects and quick actions; a smaller approvals/artifacts/watch/sources column. Not identical tiles. Other screens remain real pages. |
| Console | A navigation prompt, content, and a Browse fallback for mouse users. No permanent engine-status strip or instructional transcript. The preset chooses mono; selecting this layout alone must not override a separately chosen font. |
| Floating window | One opaque workspace window over a flat desktop surface, tabs in its title area. No fake Mac traffic lights, fake window controls, glow or frosted backdrop. |

Classic sidebar also has **Full / Icon rail**. Width and collapse state persist. When a layout already specifies its navigation, that structure takes precedence over the Classic-only collapse option; make that scope clear on demand, not in a permanent banner.

All layouts expose the same real screens and actions. They share application state. No layout-specific copy of a conversation store, engine connection or settings object.

### 4.3 Details: every palette, style and reading choice

| Control | Complete option list |
|---|---|
| Theme | System, Light, Dark, **As designed**. As designed uses the palette's original light/dark polarity. |
| Palette | **Neutral; Paper & Plum; Midnight Ink; Sage Notes; Peach Fuzz; Blue Hour; Lemon Drop; Rose After Dark; Quiet Graphite.** Also retain **OddBrain default**, the real app's palette. Nine uploaded palettes plus the app default, not eight. |
| Accent | Palette, Violet `#7350ff`, Blue `#4f8bf5`, Teal `#2fb3a2`, Amber `#e0a44a`, Rose `#e0688b`. Palette restores the chosen palette's own accent. |
| Interface style | **Editorial; Soft studio; Ink & paper; Glass studio**. |
| Interface font | App sans; **Serif headings** with clean system body; Humanist (`Trebuchet MS` fallback); Bookish serif (`Georgia` fallback); Monospace (`Cascadia Mono`, `Consolas`). This retains the uploaded four typography treatments plus the current app's all-sans default. |
| Chat font | Follow interface; App sans; Reading serif; Anthropic Serif. The last uses installed Anthropic Serif, otherwise Georgia. Never download or bundle that font. |
| Chat text size | Small 13; Medium 14.5; Large 16.5. Chrome stays unchanged. |
| Conversation width | Narrow 640; Medium 760; Wide 1040, clamped to the available pane. |
| Spacing | Compact; Roomy. Row padding changes, not font sizes or hit areas. |
| Quick window | On / Off. Same native preference as Windows & shortcuts, not a second switch with a different value. |
| Mascot mood words | On / Off. Controls the scene word, not operational safety labels. |
| Row explanations | On / Off. Default Off. Keep safety/consent information when necessary regardless of this cosmetic setting. |

**No hidden couplings.** Colour does not force a layout. A layout does not force a font. Motion does not change geometry. Text size does not enlarge the sidebar. A manual accent survives an unrelated style change.

### 4.4 Brain & motion

- Motion: **System, Calm, Balanced, Playful, Still**. Retains the original four modes plus current-app System.
- Duration scale: System/Balanced `1`, Calm `1.6`, Playful `0.85`; divide by animation-speed multiplier. Still renders a safe static pose.
- Speed: **0.5× to 1.5×, step 0.05**. Never change the authored SVG's source for this.
- **Pause / Resume mascots**, independent of motion personality. Reduced motion always takes priority; Resume must not override it.
- **Interactions On/Off** for the front-page brain.
- **Cheeky replies On/Off**, independent of interaction animations and professional activity words.
- Mischief: **Quiet, Witty, Extra**. Witty default. Quiet remains responsive without wisecracks; Extra allows broader physical reactions, not constant background chaos.
- Eight scene-assignment controls: **Idle, Thinking, Working, Waiting, Done, Searching, Making, Resting**. Every one can select from all **77** assets, including the compact loader.
- Keep a scene preview/replay route, searchable gallery, categories, paging, download one SVG, download the full kit and assignment from the gallery.
- Keep **borrow preset behavior** through Mix my own. Changing behavior does not secretly change palette or layout.

### 4.5 My mixes and exploration tools

Retain **Mix my own, Compare, Taste quiz, Shortlist/My list, verdicts and per-choice notes, structure comparison, export choices as Markdown/JSON, copy choices, export theme and reset look**. These are optional Appearance tools, not a tutorial or permanent bar over the working app.

Add named saved combinations: save, use, delete, export and import validated JSON. Save the complete appearance selection and eight scene mappings, not just its palette. Using a saved look must not restore old chats or change operational permissions.

The old “Second-pass review” control is not an appearance setting. **Move it to Engine**, retaining its existing behavior: report only, never approve/run. Do not remove it. Auto-keep remains under House rules. Startup and warm-runtime controls go under Windows & shortcuts and continue using their real native flags.

## 5. The miniature in Appearance

A small **desktop-shaped** Home/Chat preview stays beside all five Appearance tabs. Header says **Preview**, not “Home, live”. Two switches: Home / Chat. It shows the actual selected structure, palette, accent, style, fonts, size, width, spacing and mascot policy. Quick-window On adds a little matching quick-window preview.

Reference dimensions: 340px wide at a normal desktop size; 280px at narrower desktop content widths. The miniature is a 1280 × 820 composition scaled to its frame, not a phone mockup. Keep it sticky while the choices scroll. Stack it above the controls only when the content column is narrower than 620px.

**In the real app, share components.** Render the same Home/Chat/shell components with sample data in a read-only scaled host. Do not screenshot a fixed UI or maintain a second hand-drawn interpretation. Do not initialize a second engine, vault or permission system for the preview. Update it on the same render as the selected control, before persistence finishes. No network or external fonts needed.

“Try in workspace” closes Settings onto Chat, with the selected appearance already applied and the existing conversation/draft intact.

## 6. The brain: cheeky companion, calm application

The personality is **witty, smug, mischievous, Shinchan-like in attitude**, expressed by the owner's original brain artwork. No replacement character, copied costume, baby talk, sexual jokes, insults, guilt, dependence, demands for attention or fake claims of understanding the user. The character brings the mischief; the controls stay mature.

### 6.1 Interactions on empty Chat

Use the original SVG scenes, not CSS stretching of the brain artwork or a new mascot.

| Input | Reaction | Example one-line reply |
|---|---|---|
| Body poke / Enter / Space | `boop`, occasional `eye-roll` / `shades-drop` | “Boop. Highly technical work.” |
| Head/glasses poke / Up | `glasses-clean` / `shades-drop` | “The sunglasses are load-bearing.” |
| Shoes poke / Down | `shoe-phone` / `shoe-skateboard` | “My shoes are taking calls now.” |
| Quick back-and-forth tickle | `belly-laugh` / `cheek-drums` | “Not the cheeks. I have a reputation.” |
| Double click | `cheek-drums` / `belly-laugh` | “Two pokes. Still no snacks.” |
| Drag / Left | `waddle` / `moonwalk`, then return home | “I was sitting there professionally.” |
| Quick flick / Right | `brain-kickflip` / `topsy`, then return home | “Completely intentional. Naturally.” |
| Hold | `peekaboo` / `self-hug` | “Personal space. A bold concept.” |
| Repeated pokes | `eye-roll` / `pocket-panic` | “Yes, yes. Premium poking service.” |
| Escape | Return to resting scene; clear transient reply | None |

- Gesture transforms affect the wrapper only. Bound dragging to roughly ±64px horizontally / ±40px vertically / ±12° and spring it back. Never drag the mascot over the composer or off the window.
- A reply lasts about 2.6 seconds and occupies a reserved line. **No layout jump.** Mood words and the interaction reply share this slot instead of stacking lines over the greeting.
- Never repeat the same reaction sentence consecutively when a pool has alternatives.
- No permanent “poke me” instruction, mascot caption, action toolbar, affection meter or pet-game currency. No unsolicited talking while the user is typing.
- **No microphone, recording, voice imitation, speech API or autoplay sound.** “Talking Tom-like” here means direct responsive physical interaction, not permission to record or transmit audio.
- Never put a reaction into the transcript, dispatch a model prompt, execute a tool, grant permission or change a user's draft.
- On Still, Pause or Windows reduced motion, swap to a safe static pose. No wobble, flight, spring or pointer tilt. Keyboard equivalents remain usable.
- Once a real conversation is open, the large toy gives the space to the transcript. Do not keep a floating pet over active work.

## 7. Chat and meaningful activity

### 7.1 Chatbox

- Empty Chat is a single compact stack: interactive brain, 30px greeting, composer, three short suggestion actions. Center the stack as a unit; do not stretch a blank area between it and the composer on tall screens.
- User messages: right aligned; max 78%; card surface; radius `14 14 4 14`; padding `10px 14px`; no border.
- Assistant: left aligned, **18px logo**, 12px gap, plain reply column. No assistant bubble, “Demo response” badge, nested panel or mascot-sized identity block.
- Thinking disclosure and tool events: plain typography. Only permissions and code need bordered structures inside the thread. The composer itself keeps its single border.
- Keep copy/edit/retry/review/handoff/compact/checkpoints/receipt actions, accessible on keyboard focus as well as hover. Preserve code-copy, artifact opening and safe source/preview/history behavior.
- Projects use working rows, not large matching feature cards or colored icon tiles. Project detail keeps instruction editing, working folder and conversations without redundant mascot callouts.
- Artifacts keep real content thumbnails, type/search/sort, source/history/download/restore and Trash. These are records, not feature-marketing cards; do not rewrite user-created artwork to match the app palette.
- Code keeps continuing/completed groups, but remove the outer board-card borders around already bordered thread cards. Use compact thread rows, real Windows folder paths and the plain “Approval mode” / “Threads” headings.
- Vault keeps its tree, search, note viewer, copy/context/export and real structure checks. Brain keeps the actual graph, selected-note details, unresolved-link honesty and accessible zoom controls, not a mascot promo in the side panel. File/folder names such as `01 Identity` are actual vault data, not decorative numbering.
- Composer: Attach, Dictation, engine, model, Send/Stop. Put Cook context, Recipes, Battle, Split, Map folder, Project, Turn journal and Thinking toggle under **More chat tools**. Nothing is removed.
- Keep streaming, cancellation, approval decisions, attachments, project scope, context limits and actual provider routing. UI reorganization must not change their meaning.

### 7.2 Activity strip

One 28–30px strip immediately above the composer: **24px scene + actual state + optional scene word**. No card and no green dot. A working label such as “Searching” comes from the real task event; its companion word comes from the **same scene** that is actually displayed.

Use the kit's existing role pools and vocabulary. A word is not picked from an unrelated global random list. For example, searching can use `flashlight-search` / `lens-inspector`; reading can use `read`; making can use `forge` / `assemble` / `architect`. Custom role assignments are respected without fabricating a tool event.

Rotate only at sensible scene boundaries, with no immediate repeat, roughly once per 4–5 seconds during longer activity. Freeze scene/word rotation under Still or Pause, including across unrelated rerenders. Actual state changes still update the truthful state label. Completion gets one brief 24–40px reaction, then disappears. Error information is plain text with a recovery action, not a joke or celebratory scene.

The permission request remains the actual native action with its real diff, path and Allow/Deny controls. Other-window engine work remains observable through the existing ambient state; never answer its cards in the wrong window. Do not lose the agy limitation: it can chat, but its actions do not use this app's permission cards.

## 8. Opening and original wordmark

Every normal app process launch opens with the **whole window as the stage**. No box, rounded card, progress percentage, spinner, status label, helper instruction or tagline.

1. Apply saved palette/type/motion tokens before the first visible paint.
2. Run original `assemble.svg`. At normal height its authored 740px canvas is displayed at **`min(740px, 76vmin)`**; below 700px use `min(640px, 74vmin)`. SVG and its wrapper allow overflow; the window clips it. Parts visibly arrive from different screen edges. The reference scales the opening-only large travel offsets to the actual viewport, so a 1920px-wide window does not reveal parts already sitting inside the screen. Keep the original timing/settle poses and vectors; do not edit the kit files. Do not crop the traveling arms/shoes/glasses into a little square.
3. Use duration scale **0.55**, independent of normal mascot speed, for a roughly 1.54-second assembly.
4. Under the finished brain use **`OddBrain-wordmark.svg`**, the new hand-drawn rounded lettering. It has an intentionally irregular rhythm and a pink, slightly crooked i-dot, not a substituted font or generic word typed below the logo.
5. Wordmark canvas: about **228 × 50px**. Letters scoot/crawl into place from about 1.03s, stagger 55ms. The B sidesteps in late; the dot drops in at about 1.82s. Settle, do not loop. The result must read clearly as OddBrain.
6. Ready by about 2.62s in the reference, then fade the overlay for 220ms. **Native readiness is the real gate:** if the app is not painted yet, hold the finished mark and name. Never reveal an unpainted app just because the timer ended.
7. Any click or key after 250ms skips cleanly. Remove skip listeners when done.
8. Still / Pause / Windows reduced motion: static original mark + complete wordmark, with only a short opacity transition. No frozen off-screen assembly parts and no letter-flight.

Once per process launch, not on Settings reload, quick-window creation, artifact popout or ordinary window restore. Settings → You / Appearance can explicitly replay it. Use a process-owned launch flag, not a renderer-only flag that makes each window run it again.

The SVG wordmark is branding, not a new body font. Its paths use `currentColor` and a pink token so it remains readable under every palette. Keep the original app icon and all 77 motion SVGs unchanged.

## 9. Settings, all retained sections

Organize into these four groups; every section is reachable by mouse and search:

- **Your space:** You · Appearance · Windows & shortcuts · Browsing maps.
- **The work:** Engine · Models · Performance · Agent access · Connectors.
- **Memory & tools:** Memory · Vault · House rules · Skills · Recipes · Hooks · Plugins.
- **This app:** System · About & help.

This is **18 sections: the original 14 plus four**, not replacement placeholder pages. Keep existing section row controls, search terms, reset behavior, validation and errors. Search must also find old labels such as “API keys”, “Install apps”, “Quick window”, “pairing token” and “Browsing Maps”.

Native settings that must not be lost in the move:

- Model stays loaded: same stored model preference and Ollama keep-alive behavior.
- Run at startup: existing `loginItem` app flag.
- Warm runtime: existing `warmRuntime` app flag, default Off.
- Quick window: existing `oddbrain.quickShortcut` preference and `bridge.quick.shortcut()` path, not an appearance-only boolean that only changes the miniature.
- Provider keys: existing encrypted main-process storage and model/key invalidation on key rotation/clearing. Never put secrets into the appearance JSON or saved HTML.
- All existing Performance profiles/custom values; do not replace them with only the three sample profiles in the HTML.
- Memory files, vault folder/structure/conflict flows, agent permissions, browser-tool entries, recipe parameters, hooks and plugin permissions.
- Approval mode, second-pass review, auto-keep and checkpoint semantics.

About & help is where the design preview admits its simulation limits. **Do not copy those limitations into the shipping app as if its real features were simulations.** The native System page must continue showing actual reported information.

## 10. Colour, restraint and interchangeability

### 10.1 Original app default

| Token | Dark | Light |
|---|---|---|
| Background | `#141417` | `#f4f2ec` |
| Panel | `#1a1a1f` | `#ebe8df` |
| Card | `#202027` | `#fbfaf6` |
| Line | `#2e2e36` | `#dcd7ca` |
| Ink | `#ececef` | `#262420` |
| Muted | `#9a9aa3` | `#67625a` |
| Brand pink | `#e8a0b4` | `#b04a6a` |

All nine uploaded palette token sets are embedded in the reference's `THEMES` table. Use those values for As designed. System/Light/Dark derive matching neutral surfaces when a palette needs the opposite polarity. Do not silently map all light choices back to the same cream palette.

For accent labels choose a readable **`--accent-ink`** by measured contrast. Original five accents keep their existing white/near-black pairs. Lemon Drop's native olive needs black ink to pass; white measures only 4.43:1. For each derived palette, adjust muted text toward the palette ink until it reaches at least **4.5:1 on background, panel and card**. Body text also requires 4.5:1. Links can be ink rather than an unreadable pastel accent. Use a contrast-safe focus-ring token when the raw accent is too faint against the surface.

### 10.2 Keep all choices without importing the banned decoration

“Use every option” is **not** permission to reintroduce the owner's anti-slop list. Retain the labels and functional distinctions, but clean their rendering:

- Glass studio / Glass Futuristic: opaque layers, not blur, frosted glass, sheen, halos or gradients.
- Playful Lab: motion and interaction personality, not notebook dots, tilted badges or icon tiles.
- Ink & Sketchbook: clear outlines and selected typography, not a decorative grid background.
- Retro Desktop: its palette, type and window structure, not fake Mac traffic lights or gradient title bars.
- Bento dashboard: real hierarchy and unequal content weight, not identical cards flattening all information.

No purple-blue gradient, gradient text, Inter-everywhere, “Introducing” badge, glowing halo, frosted glass, icon tiles, identical feature cards, cards inside cards, accent side stripes, giant fake statistics, decorative 01/02 labels, pulsing dot, fake live indicator, “supercharge” copy, em-dash-heavy explanations, or beige-plus-italic-serif premium-parchment treatment. Optional serif type is upright. Original artwork's own lens shading is not a decorative UI gradient and is not to be redrawn.

### 10.3 Persist without flattening or data loss

Version the appearance schema and migrate the existing `ai-assistant.appearance` values. **The reference's short state names are not the native schema:** existing native `theme` means System/Light/Dark, whereas HTML `S.theme` means palette; existing native `font` means transcript font, whereas HTML `S.font` means interface font. Keep native meanings or explicitly migrate to `colorMode` / `paletteId` and `chatFont` / `interfaceFont`. Do not accidentally reinterpret a saved reading serif as an interface setting. Native width keys `focused` / `comfortable` / `wide` and legacy `reduced` → Still remain valid. Old `sans` remains App sans; existing `serif` / `anthropic-serif`, width, text size, accent, motion, mascot words and row explanations all survive. Do not set all users back to the reference's default.

Layout and sidebar state can remain in their existing store. Native quick/startup/runtime flags stay in their existing owner. Export a combined **appearance-only** snapshot when saving a look, but exclude keys, vault contents, prompts, hooks/commands, permissions and machine-specific startup flags. Validate imports against enumerated values and valid scene IDs. Clamp numeric speed/width. Do not blindly spread imported JSON into application state.

Reset appearance resets appearance only, not saved looks or work data. Reset sample data in the reference must retain the complete chosen appearance. Deleting a saved look must not alter the current running appearance.

## 11. Implementation map

Prefer small shared components. Do not paste the monolithic preview program into React.

| Existing / new area | Required work |
|---|---|
| `state/appearance.ts` + migration tests | Independent palette/theme/style/type/layout/motion choices; keep old fields; named-look serialization. |
| `Sidebar.tsx` | Footer replacement; remove duplicate utilities, not their features; preserve chat actions and resizing. |
| App shell / navigation state | Eight layout renderers sharing one app state. Universal Settings host. |
| `SettingsView.tsx` | Reorder all existing sections; add You/Windows/Maps/About; all former profile actions; Appearance sub-tabs. Keep original section implementations. |
| `AppearancePreview` | Shared shell/Home/Chat in a read-only scaled host; no backend startup. |
| `ChatView.tsx` / `MessageRow.tsx` | Compact home stack; real chatbox; logo identity; preserved message actions; one composer. |
| `InteractiveBrain` | Gesture state machine, keyboard equivalents, bounded transform, no network/audio/model side effects. |
| `EnginePanel.tsx` + motion helper | One activity strip; correct scene/word pairing, real approval card, ambient-window behavior. |
| `motionKit.ts` / `Mascot.tsx` | Existing role pools, safe static poses, speed and pause policy, visible-scene limit. |
| `LaunchOverlay` + main process flag | Full-window assembly, original mark, new vector wordmark, native readiness gate, skip/reduced motion and replay. |
| `globals.css` / token resolvers | Same default scale; complete palettes and safe inks; no preset-specific overrides that lock out independent choices. |
| Existing native bridges | Reuse, do not replace. Quick window, startup, warm runtime, keep-alive, provider keys, vault and extension remain real. |

Cap simultaneous animated scenes at about six. Pause off-screen artwork and gallery thumbnails; animate a thumbnail only for hover/focus, plus the selected scene. Do not animate all 77 at once or create persistent timers after a screen unmounts.

## 12. Acceptance: implementation is not finished until these pass

1. **Inventory:** 8 presets, 8 distinct layouts, 9 uploaded palettes plus app default, 4 styles, original type treatments, original 4 motion modes plus System, speed, pause, all 8 role assignments and 77 scenes are selectable. All existing nine appearance preferences remain present.
2. **Nothing lost:** all former profile actions and all original 14 Settings sections exist. New navigation has 18 working destinations. Every native field/control in §9 remains connected to its original behavior.
3. **Independence:** apply a preset, then independently change palette, accent, layout, style, type, size, width and motion. No earlier choice silently overwrites a later one. Draft/conversation/project remain intact.
4. **Preview:** each visible choice updates the miniature; Home/Chat both work; layout genuinely changes; preview follows quick window, fonts, motion, speed, pause and words. Try in workspace uses the same result.
5. **Personality:** all mouse gestures and keyboard equivalents work. Repeated reactions vary. No chat/network/tool/audio side effect; no microphone permission. Interactions Off removes the toy behavior without removing the mascot.
6. **No clutter:** default shell, miniature, footer and all layouts have no general Local/live/connection badge, status dot, decorative replacement lamp, tutorial strip or duplicate header branding.
7. **Chat:** correct user bubbles/plain assistant replies; 18px logo; permission card real and actionable; all tools and message actions remain reachable; thinking words match displayed scenes.
8. **Motion:** Still, Pause and OS reduced motion work in home, activity strip, opening, gallery and preview. Unrelated renders cannot advance a frozen scene/word. Animation timers/listeners are cleaned up.
9. **Opening:** parts enter across the window, original mark assembles, new wordmark has its own crawl/late-B/dot motion, no box. Skip works. Holds until actual ready. Second/quick/popout windows do not replay. Manual replay works.
10. **Persistence:** old preferences migrate; all new choices, named looks and mappings survive restart. Export/import round-trips safely. No secrets/workspace data in look JSON.
11. **Desktop layout:** at least all 8 layouts × 10 palettes × 4 styles at 940×620, plus all 8 layouts × 5 interface fonts × 3 text sizes × 3 widths, with readable, reachable composer, no horizontal overflow and no clipped send/stop control. Also visually inspect real conversation, permission, error, empty and long-content states at larger desktop sizes.
12. **Accessibility:** measured body/muted/accent ink ratios ≥4.5:1, focus ring visible, icon controls named, hit targets ≥28px, keyboard access to every action, semantic headings/navigation, no drag-only feature. Announce meaningful task transitions, not every animation tick.
13. **Regression:** current typecheck, test suite and production build remain green. Existing guard pinning, download host allowlist, extension pairing/capture refusal, key rotation, keep-alive/startup and engine model/session handling must not regress during a cosmetic pass.
14. **Installed Windows app:** build installer and have the owner open it on their Windows PC. Test actual Quick window, startup/warm runtime, folder pickers, provider-key save/clear and extension capture. A browser preview or CI artifact is not proof of installed Windows behavior.

### What was actually checked in this reference

Browser checks, not installed-app claims:

- Complete option counts; all eight preset controls; 61 individually exposed preference values.
- All 18 Settings sections and the restored profile links.
- All 77 scene choices in each of eight activity selectors; gallery paging; comparison, quiz, mix, shortlist and structure tools.
- 240 palette/theme/accent contrast combinations: minimum button ratio **4.735:1**, minimum muted ratio **4.633:1**.
- 64 layout/screen combinations at minimum desktop size, 32 layout/style checks, **320 layout/palette/style** home checks and **360 layout/font/text-size/width** home checks, with no detected horizontal overflow or clipped composer/send control.
- Body/head/shoe poke, double click, hold, tickle, repeated poke, keyboard, drag/flick; paired approval scene/word; paused-word stability; reduced motion.
- Save/use/reload of the complete appearance and named looks; malformed-import checks; JSON round-trip; exported standalone HTML actually reopened from a file; shared preview shell; sidebar keyboard resize/reset; Settings search; project instruction save; sample-workspace reset retaining all appearance fields.
- File-viewer sandbox with storage blocked. No page errors in these checks.

These are finite checks, **not a claim that the enormous Cartesian product of all preferences or every native operation was tested**. The implementing agent must run the real app and complete the acceptance list above.


### Embedded-viewer compatibility repair · 18 October 2026

The first revision-2 file could be broken by a viewer injecting its helper before a literal document-closing tag inside a JavaScript string. This reproduced the exact empty dark screen and raw toast template reported by the owner. The generator now escapes nested document tags in executable script source, leaving one real closing head/body tag. Runtime HTML and all original SVG artwork are unchanged. The exact failing case, opaque-origin sandbox, direct offline file, live preview and re-exported HTML were retested successfully. All previous browser suites were rerun. Use the corrected packaged reference rather than a cached earlier copy.
