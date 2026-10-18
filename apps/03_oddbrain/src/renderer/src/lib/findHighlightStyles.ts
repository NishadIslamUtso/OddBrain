/**
 * The CSS Highlight API's named `::highlight()` pseudo-elements are supported
 * by Chromium, but Lightning CSS currently warns while processing those
 * selectors from a stylesheet. Keep the standards-based rules as a constant
 * and install them at runtime so the production build stays warning-free.
 */
export const FIND_HIGHLIGHT_STYLES = `
::highlight(ob-find) {
  background-color: rgba(224, 164, 74, 0.35);
  color: inherit;
}
::highlight(ob-find-current) {
  background-color: rgba(224, 164, 74, 0.75);
  color: #141417;
}
`.trim()

const STYLE_ID = 'ob-find-highlight-styles'

export function installFindHighlightStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const host = document.head || document.documentElement
  if (!host) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = FIND_HIGHLIGHT_STYLES
  host.append(style)
}
