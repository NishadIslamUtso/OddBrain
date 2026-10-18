import { useCallback, useEffect, useState } from 'react'
import { bridge } from '@/platform/bridge'
import { normalizeProjects, type Project } from '@shared/lib/projects'

/**
 * The projects, as one hook. Reads once, keeps the list in memory, writes
 * the whole list on every change — the file is small and the app is
 * single-user, so last-write-wins is the honest simplest truth.
 */
export default function useProjects(active: boolean) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(active)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    bridge.projects
      .read()
      .then((list) => {
        if (!cancelled) {
          setProjects(normalizeProjects(list))
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active])

  const persist = useCallback((next: Project[]): void => {
    setProjects(next)
    void bridge.projects.write(next)
  }, [])

  const create = useCallback(
    (name: string): void => {
      void bridge.projects.blank(name).then((project) => persist([...projects, project]))
    },
    [projects, persist],
  )

  const update = useCallback(
    (id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): void => {
      persist(projects.map((project) => (project.id === id ? { ...project, ...patch } : project)))
    },
    [projects, persist],
  )

  const remove = useCallback(
    (id: string): void => {
      persist(projects.filter((project) => project.id !== id))
    },
    [projects, persist],
  )

  return { projects, loading, create, update, remove }
}
