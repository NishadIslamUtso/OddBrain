import { useCallback, useEffect, useRef, useState } from 'react'
import type { Workspace } from '../../../shared/workspace'
import { client } from './client'

type Snapshot = { data: Workspace; revision: number; location: string }
export const newId = (): string => globalThis.crypto.randomUUID().replaceAll('-', '')
export const now = (): string => new Date().toISOString()

export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const current = useRef<Snapshot | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await client().workspace.read()
      if (!result.ok) {
        setError(result.error)
        current.current = null
        setSnapshot(null)
        return
      }
      const fresh = { data: result.data, revision: result.revision, location: result.location }
      current.current = fresh
      setSnapshot(fresh)
      setError('')
    } catch (failure) {
      setError((failure as Error).message || 'Could not read the workspace.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  const update = useCallback((transform: (data: Workspace) => Workspace): Promise<boolean> => {
    const work = queue.current.then(async () => {
      const previous = current.current
      if (!previous) {
        setError('The workspace did not load. Nothing was saved.')
        return false
      }
      try {
        const next = transform(previous.data)
        const result = await client().workspace.write(next, previous.revision)
        if (!result.ok) {
          setError(result.error)
          return false
        }
        const fresh = { data: result.data, revision: result.revision, location: result.location }
        current.current = fresh
        setSnapshot(fresh)
        setError('')
        return true
      } catch (failure) {
        setError((failure as Error).message || 'Nothing was saved.')
        return false
      }
    })
    queue.current = work.then(
      () => undefined,
      () => undefined,
    )
    return work
  }, [])
  return { snapshot, loading, error, update, reload, clearError: () => setError('') }
}
