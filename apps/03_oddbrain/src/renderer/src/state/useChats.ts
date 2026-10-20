import { workspaceKey } from '@shared/lib/sampleWorkspace'
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'
import type { Chat } from '@shared/types'
import { normalizeChats, newId, readStored, writeStored } from '@shared/lib/storage'
import { bridge, isDemo } from '@/platform/bridge'

/**
 * The conversation list, and which one is open.
 *
 * Desktop conversations live in the main process as an atomic index plus one
 * immutable file per changed chat. The browser-only preview keeps its sample
 * state in localStorage because it has no main process. On the first desktop
 * launch after this change, valid legacy localStorage is copied once; the exact
 * raw strings remain in the main-process recovery folder.
 */

const CHATS_KEY = 'ai-assistant.chats'
const CURRENT_KEY = 'ai-assistant.current-chat'
const WRITE_INTERVAL_MS = 500
const streamingWriteInterval = (chats: Chat[], current: string): number => {
  const active = chats.find(chat => chat.id === current)
  if (!active) return WRITE_INTERVAL_MS
  // Large active chats are expensive immutable generations. Keep frequent small
  // checkpoints, but stop rewriting multi-megabyte chats twice every second.
  const characters = JSON.stringify(active).length
  return characters > 1_000_000 ? 2_000 : characters > 250_000 ? 1_000 : WRITE_INTERVAL_MS
}

export type ChatStorageHealth = { state: 'loading' | 'ready' | 'saving' | 'attention'; message: string }

export type ChatState = {
  chats: Chat[]
  /** Replies stream in place; checkpoints run at most twice a second and slow down for large chats. */
  setChats: (update: SetStateAction<Chat[]>) => void
  /** Save and verify before a native send or branch is opened. */
  commit: (change: (previous: Chat[]) => Chat[]) => Promise<boolean>
  currentChat: string
  ready: boolean
  storage: ChatStorageHealth
  retryStorage: () => Promise<boolean>
  exportRecovery: () => Promise<{ ok: boolean; answer: string }>
  openStorageLocation: () => Promise<{ ok: boolean; answer: string }>
  open: (chatId: string) => void
  create: () => string
  remove: (chatId: string) => void
  rename: (chatId: string, title: string) => void
  pin: (chatId: string, pinned: boolean) => void
  setProject: (chatId: string, projectId: string | null) => void
}

type ReadyGate = { promise: Promise<void>; resolve: () => void }
const readyGate = (): ReadyGate => {
  let resolve = (): void => undefined
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

export function useChats(onWarning?: (message: string) => void): ChatState {
  const chatsKey = workspaceKey(CHATS_KEY), currentKey = workspaceKey(CURRENT_KEY)
  const initial = useRef<{
    chats: ReturnType<typeof readStored<Chat[]>>
    current: ReturnType<typeof readStored<string>>
    rawChats: string | null
    rawCurrent: string | null
  } | null>(null)
  if (!initial.current) {
    let rawChats: string | null = null, rawCurrent: string | null = null
    try { rawChats = localStorage.getItem(chatsKey); rawCurrent = localStorage.getItem(currentKey) } catch { /* readStored supplies the visible warning */ }
    initial.current = {
      chats: readStored(chatsKey, [], normalizeChats),
      current: readStored(currentKey, '', value => typeof value === 'string' ? value : ''),
      rawChats,
      rawCurrent,
    }
  }

  const [chats, setChatValue] = useState<Chat[]>(initial.current.chats.value)
  const [currentChat, setCurrentValue] = useState(initial.current.current.value)
  const [ready, setReady] = useState(isDemo)
  const [storage, setStorage] = useState<ChatStorageHealth>(isDemo ? { state: 'ready', message: 'Browser preview storage' } : { state: 'loading', message: 'Opening conversation storage…' })
  const chatsRef = useRef(chats), currentRef = useRef(currentChat)
  const revision = useRef(0), nativeReady = useRef(isDemo), loadGeneration = useRef(0)
  const savedObjects = useRef(new Map<string, Chat>())
  const queuedChats = useRef<Array<SetStateAction<Chat[]>>>([])
  const queuedCurrent = useRef<Array<SetStateAction<string>>>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const writes = useRef<Promise<void>>(Promise.resolve())
  const gate = useRef<ReadyGate | null>(null)
  if (!gate.current) gate.current = readyGate()
  if (isDemo) gate.current.resolve()
  const warn = useRef(onWarning), lastWarning = useRef('')
  warn.current = onWarning
  const report = useCallback((message: string) => {
    if (!message || lastWarning.current === message) return
    lastWarning.current = message
    warn.current?.(message)
  }, [])

  const persist = useCallback((nextChats: Chat[], nextCurrent: string): Promise<boolean> => {
    if (isDemo) {
      try {
        writeStored(chatsKey, normalizeChats(nextChats))
        writeStored(currentKey, typeof nextCurrent === 'string' ? nextCurrent : '')
        return Promise.resolve(true)
      } catch {
        report('The conversation could not be saved. Original browser storage was not replaced; keep this window open and export important text.')
        return Promise.resolve(false)
      }
    }
    let outcome = false
    const operation = writes.current.then(async () => {
      setStorage({ state: 'saving', message: 'Saving conversation…' })
      try {
        const answer = await bridge.chats.write({
          order: nextChats.map(chat => chat.id),
          upserts: nextChats.filter(chat => savedObjects.current.get(chat.id) !== chat),
          currentChat: nextCurrent,
          expectedRevision: revision.current,
        })
        if (!answer.ok) {
          if (answer.snapshot) {
            revision.current = answer.snapshot.revision
            savedObjects.current = new Map(answer.snapshot.chats.map(chat => [chat.id, chat]))
          }
          const message = `${answer.error} Your visible chats are still in this window; retry or export recovery data.`
          setStorage({ state: 'attention', message }); report(message)
          return
        }
        revision.current = answer.snapshot.revision
        savedObjects.current = new Map(nextChats.map(chat => [chat.id, chat]))
        if (answer.snapshot.notice) { setStorage({ state: 'attention', message: answer.snapshot.notice }); report(answer.snapshot.notice) }
        else setStorage({ state: 'ready', message: 'Conversations saved' })
        outcome = true
      } catch {
        const message = 'Conversation storage could not be reached. Your visible chats are still in this window; retry or export recovery data before closing.'
        setStorage({ state: 'attention', message }); report(message)
      }
    })
    writes.current = operation.then(() => undefined, () => undefined)
    return operation.then(() => outcome)
  }, [chatsKey, currentKey, report])

  const schedule = useCallback(() => {
    if (isDemo || !nativeReady.current || timer.current) return
    // This is a throttle, not a trailing debounce: a long streaming answer is
    // checkpointed every interval instead of waiting minutes for the final token.
    timer.current = setTimeout(() => {
      timer.current = null
      void persist(chatsRef.current, currentRef.current)
    }, streamingWriteInterval(chatsRef.current, currentRef.current))
  }, [persist])

  const setChats = useCallback((update: SetStateAction<Chat[]>) => {
    const next = typeof update === 'function' ? update(chatsRef.current) : update
    chatsRef.current = next
    setChatValue(next)
    if (!isDemo && !nativeReady.current) queuedChats.current.push(update)
    if (isDemo) void persist(next, currentRef.current)
    else schedule()
  }, [persist, schedule])

  const setCurrentChat = useCallback((update: SetStateAction<string>) => {
    const next = typeof update === 'function' ? update(currentRef.current) : update
    currentRef.current = next
    setCurrentValue(next)
    if (!isDemo && !nativeReady.current) queuedCurrent.current.push(update)
    if (isDemo) void persist(chatsRef.current, next)
    else schedule()
  }, [persist, schedule])

  const loadNative = useCallback(async (): Promise<boolean> => {
    if (isDemo) return true
    const own = ++loadGeneration.current
    setStorage({ state: 'loading', message: 'Opening conversation storage…' })
    try {
      let answer = await bridge.chats.read()
      if (!answer.ok) throw Error(answer.error)
      let snapshot = answer.snapshot
      if (!snapshot.initialized) {
        if (initial.current!.chats.warning || initial.current!.current.warning) {
          throw Error('Legacy conversation storage is damaged, so it was not migrated or replaced. Export the recovery data before repairing the original browser value.')
        }
        answer = await bridge.chats.migrate({
          chats: initial.current!.chats.value,
          currentChat: initial.current!.current.value,
          rawChats: initial.current!.rawChats,
          rawCurrentChat: initial.current!.rawCurrent,
        })
        if (!answer.ok) throw Error(answer.error)
        snapshot = answer.snapshot
      }
      if (own !== loadGeneration.current) return false
      savedObjects.current = new Map(snapshot.chats.map(chat => [chat.id, chat]))
      let loadedChats = snapshot.chats, loadedCurrent = snapshot.currentChat
      for (const update of queuedChats.current) loadedChats = typeof update === 'function' ? update(loadedChats) : update
      for (const update of queuedCurrent.current) loadedCurrent = typeof update === 'function' ? update(loadedCurrent) : update
      const changedDuringLoad = queuedChats.current.length > 0 || queuedCurrent.current.length > 0
      queuedChats.current = []; queuedCurrent.current = []
      revision.current = snapshot.revision
      chatsRef.current = loadedChats; currentRef.current = loadedCurrent
      setChatValue(loadedChats); setCurrentValue(loadedCurrent)
      nativeReady.current = true; setReady(true); gate.current!.resolve()
      if (snapshot.notice) { setStorage({ state: 'attention', message: snapshot.notice }); report(snapshot.notice) }
      else setStorage({ state: 'ready', message: 'Conversations saved' })
      // A successful retry means unavailable-time edits are durably written, not
      // merely put back on a timer that could be lost if the window closes.
      if (changedDuringLoad) return persist(loadedChats, loadedCurrent)
      return true
    } catch (error) {
      if (own !== loadGeneration.current) return false
      nativeReady.current = false; setReady(true); gate.current!.resolve()
      const message = (error as Error).message || 'Conversation storage could not be opened. Original data was not replaced.'
      setStorage({ state: 'attention', message }); report(message)
      return false
    }
  }, [persist, report])

  useEffect(() => {
    if (initial.current?.chats.warning) report(initial.current.chats.warning)
    if (initial.current?.current.warning) report(initial.current.current.warning)
    if (isDemo) return
    void loadNative()
    return () => { loadGeneration.current++ }
  }, [loadNative, report])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    // Final native turns already have an append-only transcript. This best-effort
    // flush covers sidebar edits and local-model chats without blocking teardown.
    if (!isDemo && nativeReady.current) void persist(chatsRef.current, currentRef.current)
  }, [persist])

  const open = useCallback((chatId: string) => setCurrentChat(chatId), [setCurrentChat])

  /** A chat comes into being on its first message, not on an abandoned New click. */
  const create = useCallback(() => { setCurrentChat(''); return '' }, [setCurrentChat])

  const remove = useCallback((chatId: string) => {
    setChats(previous => previous.filter(chat => chat.id !== chatId))
    if (currentRef.current === chatId) setCurrentChat('')
  }, [setChats, setCurrentChat])

  const pin = useCallback((chatId: string, pinned: boolean) => {
    setChats(previous => previous.map(chat => chat.id === chatId ? { ...chat, pinned } : chat))
  }, [setChats])

  const setProject = useCallback((chatId: string, projectId: string | null) => {
    setChats(previous => previous.map(chat => chat.id === chatId ? { ...chat, projectId } : chat))
  }, [setChats])

  const rename = useCallback((chatId: string, title: string) => {
    const clean = String(title || '').trim().slice(0, 80)
    if (!clean) return
    setChats(previous => previous.map(chat => chat.id === chatId ? { ...chat, title: clean } : chat))
  }, [setChats])

  const commit = useCallback(async (change: (previous: Chat[]) => Chat[]): Promise<boolean> => {
    await gate.current!.promise
    let next: Chat[]
    try { next = normalizeChats(change(chatsRef.current)) }
    catch {
      report('The conversation change was invalid and was not saved. Original storage was not replaced.')
      return false
    }
    chatsRef.current = next; setChatValue(next)
    if (!isDemo && !nativeReady.current) { queuedChats.current.push(change); return false }
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    return persist(next, currentRef.current)
  }, [persist, report])

  const retryStorage = useCallback(async (): Promise<boolean> => {
    if (isDemo) return true
    if (nativeReady.current) return persist(chatsRef.current, currentRef.current)
    return loadNative()
  }, [loadNative, persist])
  const exportRecovery = useCallback(async (): Promise<{ ok: boolean; answer: string }> => {
    try {
      return await bridge.chats.exportRecovery({ chats: chatsRef.current, currentChat: currentRef.current, rawChats: initial.current!.rawChats, rawCurrentChat: initial.current!.rawCurrent })
    } catch { return { ok: false, answer: 'Chat recovery data could not be exported. The live store was not changed.' } }
  }, [])
  const openStorageLocation = useCallback(async (): Promise<{ ok: boolean; answer: string }> => {
    try { return await bridge.chats.openLocation() }
    catch { return { ok: false, answer: 'The private chat storage folder could not be opened.' } }
  }, [])

  return useMemo<ChatState>(
    () => ({ commit, chats, setChats, currentChat, ready, storage, retryStorage, exportRecovery, openStorageLocation, open, create, remove, rename, pin, setProject }),
    [commit, chats, setChats, currentChat, ready, storage, retryStorage, exportRecovery, openStorageLocation, open, create, remove, rename, pin, setProject]
  )
}

/** Group chats exactly as the sidebar labels them. */
export function groupChats(chats: Chat[]): Array<{ label: string; chats: Chat[] }> {
  const pinned: Chat[] = [], today: Chat[] = [], earlier: Chat[] = []
  for (const chat of chats) {
    if (chat.pinned) pinned.push(chat)
    else (chat.date === 'Today' ? today : earlier).push(chat)
  }
  return [
    { label: 'Pinned', chats: pinned },
    { label: 'Today', chats: today },
    { label: 'Older', chats: earlier },
  ].filter(group => group.chats.length > 0)
}

export function emptyChat(projectId: string | null = null): Chat {
  return { id: newId(), title: 'New chat', date: 'Today', projectId, messages: [] }
}
