import { useLayoutEffect, useRef, useState } from 'react'

/** Window-local navigation only. Never snapshots credentials, drafts or engine work. */
export default function useNavigationHistory<T>(location: T, key: string, restore: (location: T) => void) {
  const previous = useRef({ location, key })
  const history = useRef<T[]>([])
  const restoring = useRef(false)
  const [depth, setDepth] = useState(0)
  useLayoutEffect(() => {
    if (!restoring.current && previous.current.key !== key) {
      history.current = [...history.current.slice(-63), previous.current.location]
    }
    restoring.current = false
    previous.current = { location, key }
    setDepth(history.current.length)
  }, [location, key])
  const back = (): void => {
    const target = history.current.pop()
    if (!target) return
    restoring.current = true
    setDepth(history.current.length)
    restore(target)
  }
  return { back, canBack: depth > 0 }
}
