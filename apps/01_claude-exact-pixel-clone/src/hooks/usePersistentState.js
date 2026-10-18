import { useEffect, useRef, useState } from 'react'
import { readStored, writeStored } from '../lib/storage.js'
export default function usePersistentState(key, fallback, normalize, onWarning) {
  const initial = useRef(null)
  if (!initial.current) initial.current = readStored(key, fallback, normalize)
  const [value, setValue] = useState(initial.current.value)
  const mounted = useRef(false)
  const warn = useRef(onWarning)
  warn.current = onWarning
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      if (initial.current.warning) warn.current?.(initial.current.warning)
      return // Never replace an unreadable legacy value just by opening the app.
    }
    try {
      if (initial.current.warning) {
        const raw = localStorage.getItem(key)
        if (raw !== null) localStorage.setItem(`${key}_recovery`, raw)
        initial.current.warning = ''
      }
      writeStored(key, value)
    } catch { warn.current?.(`Could not save ${key}. Browser storage may be full. Keep this tab open and export important source files.`) }
  }, [key, value])
  return [value, setValue]
}
