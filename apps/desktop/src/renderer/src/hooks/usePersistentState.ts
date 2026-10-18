import { useEffect, useRef, useState } from 'react'
import { readStored, writeStored } from '@shared/lib/storage'

/**
 * State that survives a restart.
 *
 * Storage is a browser API that can throw (a full profile, a locked-down
 * environment), so every failure here becomes a callback rather than an
 * exception: the value still works for this session, and the person is told
 * once, in a line of text, not a dialog.
 *
 * The subtle part is the first write. A value that could not be READ must not be
 * overwritten just because the app opened — otherwise a corrupt file becomes a
 * lost file. So the first effect run only reports the problem, and the value is
 * copied to `<key>_recovery` before the first real write.
 */
export default function usePersistentState<T>(
  key: string,
  fallback: T,
  normalize: (value: unknown) => T = (value: unknown) => value as T,
  onWarning?: (message: string) => void
): [T, (value: T | ((previous: T) => T)) => void] {
  const initial = useRef<{ value: T; warning: string } | null>(null)
  if (!initial.current) initial.current = readStored(key, fallback, normalize)
  const [value, setValue] = useState<T>(initial.current.value)
  const mounted = useRef(false)
  const warn = useRef(onWarning)
  warn.current = onWarning

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      if (initial.current?.warning) warn.current?.(initial.current.warning)
      return
    }
    try {
      if (initial.current?.warning) {
        const raw = localStorage.getItem(key)
        if (raw !== null) localStorage.setItem(`${key}_recovery`, raw)
        initial.current.warning = ''
      }
      writeStored(key, value)
    } catch {
      warn.current?.(
        `Could not save ${key}. Browser storage may be full. Keep this window open and export anything important.`
      )
    }
  }, [key, value])

  return [value, setValue]
}
