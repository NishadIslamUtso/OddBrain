import { useCallback, useEffect, useRef, useState } from 'react'
import { bridge } from '@/platform/bridge'
import type { AdoptInput, ArtifactSummary } from '../../../main/artifacts/store'

/**
 * The library, as the Artifacts screen sees it.
 *
 * One place loads it, one place mutates it, and every mutation reports back so
 * the screen can say what happened instead of re-rendering silently and leaving
 * a person to guess whether the rename took.
 *
 * The list deliberately carries no document content: a grid of twenty cards
 * should not pull twenty documents across the bridge to draw titles. Each card
 * reads its own single document when it comes into view (see ArtifactThumb).
 */

export type LibraryAnswer = { ok: boolean; error?: string }

export default function useArtifactLibrary(active: boolean) {
  const [items, setItems] = useState<ArtifactSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [where, setWhere] = useState('')
  const alive = useRef(true)
  const asked = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    const answer = await bridge.artifacts.list()
    if (!alive.current) return
    if (answer.ok) {
      setItems(answer.items)
      setWhere(answer.where)
      setError('')
    } else {
      // A library that cannot be read is not an empty library, and saying so is
      // the whole difference between an honest screen and a confusing one.
      setItems([])
      setError(answer.error)
    }
    setLoading(false)
    asked.current = true
  }, [])

  useEffect(() => {
    if (active) void refresh()
  }, [active, refresh])

  /** Did the library load at least once? Used to decide whether to adopt. */
  const loaded = useCallback((): boolean => asked.current, [])

  const rename = useCallback(async (id: string, title: string): Promise<LibraryAnswer> => {
    const answer = await bridge.artifacts.rename(id, title)
    if (!answer.ok) return { ok: false, error: answer.error }
    setItems(previous => previous.map(item => (item.id === id ? answer.item : item)))
    return { ok: true }
  }, [])

  const duplicate = useCallback(async (id: string): Promise<LibraryAnswer> => {
    const answer = await bridge.artifacts.duplicate(id)
    if (!answer.ok) return { ok: false, error: answer.error }
    await refresh()
    return { ok: true }
  }, [refresh])

  const restore = useCallback(async (id: string, version: number): Promise<LibraryAnswer> => {
    const answer = await bridge.artifacts.restore(id, version)
    if (!answer.ok) return { ok: false, error: answer.error }
    await refresh()
    return { ok: true }
  }, [refresh])

  const remove = useCallback(async (id: string): Promise<LibraryAnswer & { movedTo?: string }> => {
    const answer = await bridge.artifacts.remove(id)
    if (!answer.ok) return { ok: false, error: answer.error }
    setItems(previous => previous.filter(item => item.id !== id))
    return { ok: true, movedTo: answer.movedTo }
  }, [])

  const importFile = useCallback(async (): Promise<LibraryAnswer & { canceled?: boolean }> => {
    const answer = await bridge.artifacts.import()
    if (answer.canceled) return { ok: false, canceled: true }
    if (!answer.ok) return { ok: false, error: answer.error }
    await refresh()
    return { ok: true }
  }, [refresh])

  /**
   * Write artifacts found in saved conversations into the library, once each.
   * Returns how many were brought in, so the screen can say so in a line.
   */
  const adopt = useCallback(async (records: AdoptInput[]): Promise<number> => {
    if (!records.length) return 0
    const answer = await bridge.artifacts.adopt(records)
    if (!answer.ok || !answer.adopted) return 0
    await refresh()
    return answer.adopted
  }, [refresh])

  return { items, loading, error, where, refresh, loaded, rename, duplicate, restore, remove, importFile, adopt }
}

/**
 * Everything a saved conversation holds, in the shape the library adopts.
 *
 * A draft is not a document: half a page adopted into the library would be a
 * card that cannot be opened for real, so partial artifacts are left in the
 * chat where they belong.
 */
export function adoptionRecords(
  messages: Array<{
    id: string
    artifacts?: Array<{
      id: string
      title: string
      type: 'html' | 'svg'
      createdAt?: string
      updatedAt?: string
      partial?: boolean
      versions: Array<{ content: string }>
    }>
  }>,
  chatId: string
): AdoptInput[] {
  const records: AdoptInput[] = []
  for (const message of messages) {
    for (const artifact of message.artifacts || []) {
      const content = artifact.versions[artifact.versions.length - 1]?.content || ''
      if (artifact.partial || !content.trim()) continue
      records.push({
        id: artifact.id,
        title: artifact.title,
        type: artifact.type,
        content,
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt,
        chatId,
        messageId: message.id,
      })
    }
  }
  return records
}
