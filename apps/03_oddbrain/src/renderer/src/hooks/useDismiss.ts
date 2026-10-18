import { useEffect, type RefObject } from 'react'

/**
 * Close a menu when the pointer goes elsewhere or Escape is pressed, and let the
 * arrow keys move through it.
 *
 * One hook rather than three listeners per menu, and the keyboard half is the
 * part people forget: a popover that cannot be escaped with Escape is a popover
 * that traps you.
 */
export default function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return

    const pointer = (event: PointerEvent | MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }

    const keyboard = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (
        ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) &&
        ref.current?.contains(event.target as Node)
      ) {
        const items = [
          ...ref.current.querySelectorAll<HTMLElement>(
            '[role="menuitem"]:not([disabled]),[role="menuitemradio"]:not([disabled])'
          ),
        ]
        if (!items.length) return
        event.preventDefault()
        const index = items.indexOf(document.activeElement as HTMLElement)
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next].focus()
      }
    }

    document.addEventListener('pointerdown', pointer)
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('pointerdown', pointer)
      document.removeEventListener('keydown', keyboard)
    }
  }, [ref, onClose, enabled])
}
