import type { KeyboardEvent } from 'react'
/** Trap only Tab in a modal. Read-only miniature controls and disabled/hidden
 * elements never become real focus targets. Escape belongs to the caller. */
export function trapDialogFocus(event: KeyboardEvent<HTMLElement>): void {
  if ((event.ctrlKey || event.metaKey) && ['k', ','].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); return }
  if (event.key !== 'Tab') return
  const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')].filter(node =>
    !node.closest('[inert]') && !node.hasAttribute('disabled') && node.tabIndex >= 0 && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden')
  const first = nodes[0], last = nodes.at(-1)
  if (!first || !last) { event.preventDefault(); return }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
