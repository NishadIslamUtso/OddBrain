import { useEffect } from 'react'
export default function useDismiss(ref, onClose, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const pointer = event => { if (!ref.current?.contains(event.target)) onClose() }
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && ref.current?.contains(event.target)) {
        const items = [...ref.current.querySelectorAll('[role="menuitem"]:not([disabled]),[role="menuitemradio"]:not([disabled])')]
        if (!items.length) return
        event.preventDefault()
        const index = items.indexOf(document.activeElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next].focus()
      }
    }
    document.addEventListener('pointerdown', pointer); document.addEventListener('keydown', keyboard)
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', keyboard) }
  }, [ref, onClose, enabled])
}
