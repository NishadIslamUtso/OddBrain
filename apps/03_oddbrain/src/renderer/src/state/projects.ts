import { useCallback, useEffect, useRef, useState } from 'react'
import { bridge } from '@/platform/bridge'
import { normalizeProjects, type Project } from '@shared/lib/projects'
/** Saved project edits are acknowledged before the UI treats them as durable. */
export default function useProjects(active: boolean) {
  const [projects, setProjects] = useState<Project[]>([]), [loading, setLoading] = useState(active), [error, setError] = useState('')
  const current = useRef(projects), ready = useRef(false), busy = useRef(false), generation = useRef(0)
  const load = useCallback(async () => {
    const own = ++generation.current
    try {
      const value = normalizeProjects(await bridge.projects.read())
      if (own !== generation.current) return
      current.current = value; ready.current = true; setProjects(value); setError('')
    } catch (failure) { if (own === generation.current) { ready.current = false; setError((failure as Error).message || 'Projects could not be read. Originals are unchanged.') } }
    finally { if (own === generation.current) setLoading(false) }
  }, [])
  useEffect(() => {
    if (!active) return
    void load(); const changed = () => { void load() }
    window.addEventListener('app:projects-changed', changed)
    return () => { generation.current++; window.removeEventListener('app:projects-changed', changed) }
  }, [active, load])
  const persist = async (next: Project[]): Promise<boolean> => {
    if (!ready.current || busy.current) { setError('Wait for projects to finish loading or saving.'); return false }
    busy.current = true
    try {
      const answer = await bridge.projects.write(next, current.current)
      if (!answer.ok) throw Error('Projects were not saved. Originals are unchanged.')
      current.current = answer.projects; setProjects(answer.projects); setError('')
      window.dispatchEvent(new Event('app:projects-changed')); return true
    } catch (failure) { setError((failure as Error).message); return false }
    finally { busy.current = false }
  }
  const create = async (name: string) => {
    try { const project = await bridge.projects.blank(name); return persist([...current.current, project]) }
    catch (failure) { setError((failure as Error).message); return false }
  }
  const update = (id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>) => persist(current.current.map(p => p.id === id ? { ...p, ...patch } : p))
  const remove = (id: string) => persist(current.current.filter(p => p.id !== id))
  return { projects, loading, error, create, update, remove, reload: load }
}
