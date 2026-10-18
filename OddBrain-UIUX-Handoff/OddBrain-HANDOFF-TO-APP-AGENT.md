# Apply OddBrain UI/UX revision 2

**This handoff replaces the earlier restricted, nine-option appearance plan.**

## Owner's request

Keep every option from the supplied full concept. Reorganize and redesign freely, but do not delete choices or former name-menu actions. Keep the app compact and mature. Remove general Local/live badges, dots, replacement status ornaments and unnecessary instructions. Give the launch name its own personality. Make the original front-page brain directly interactive and mischievous, without recording audio or sending model prompts.

## Files

- **`OddBrain-UIUX-REFERENCE.html`**: working, self-contained offline design preview. Open it in a desktop browser. Name + brain → Settings → Appearance contains the complete choices. Poke, tickle, hold, double-click, drag or flick the front-page brain; Enter/arrows also work. The opening can be replayed in Settings.
- **`OddBrain-UIUX-SPEC.md`**: authoritative behavior, full option/feature retention map, measurements, migration details and acceptance gates.
- **`OddBrain-wordmark.svg`**: original vector lettering used under the launch mascot. It has no font dependency. Animate its named letter groups as shown in the preview.
- **`OddBrain-UIUX-CHECKS.json`**: finite browser-reference check results and limitations. Not an installed-Windows certificate.

## Implementation brief

Apply the specification to the current **Windows** app in `apps/03_oddbrain`. Keep the existing UI/text scale, real engine/model/vault/plugin/extension functionality, approval and cloud-consent behavior, and original 77 SVG assets. Use the reference for visuals and interactions, **not** as a replacement backend or a monolithic React component.

Retain **8 complete looks, 8 structural layouts, 9 uploaded palettes plus the app default, 4 interface styles, all original type/motion/density choices, activity mappings, custom mixes, compare, quiz, shortlist and exports**. Preserve the native reading-font, size, width, accent, quick-window, words and explanation controls. Appearance choices must remain independent after a preset is applied.

Restore every actual former profile action in Settings. All original 14 Settings sections remain, with You, Windows & shortcuts, Browsing maps, and About & help added: **18 destinations**. Keep the existing provider-key forms and native startup/warm-runtime/quick-window/model-loaded bridges. The reference's shorter settings pages are not permission to remove native controls.

Use shared Home/Chat/shell components for the Appearance miniature. Keep draft, conversation, project and permission state through layout changes. Pay attention to the migration warning: native `theme` and `font` do not mean the same thing as the HTML's demonstration state fields.

The startup stage fills the whole window. Original parts enter from actual screen edges, then the new lettering crawls into place. Gate its dismissal on the real app being painted; obey reduced motion and allow a skip. Run once per process launch, not in every quick/popout window.

Implement the brain as a local gesture state machine using the supplied SVGs. No microphone, audio, speech service, network call, fake emotional dependence or interruption of active conversations. Keep jokes out of errors, security decisions and operational labels.

## Proof before calling it done

Complete §12 of the specification in the real app. Run typecheck, tests and production build; give before/after desktop screenshots and a clear report of what remains unverified. Preserve existing security, provider, extension, download, approval, model, startup and keep-alive regression tests. Build and actually check the Windows app; browser checks do not prove native behavior.

Do not assume the UI is already applied to Electron: **this package contains reference/spec work only**. Do not expand this pass into repository or README professionalization; that is still deferred until the owner installs and confirms the app.
