import { workspaceKey } from '@shared/lib/sampleWorkspace'
import { useCallback, useMemo } from 'react'
import type { Chat } from '@shared/types'
import { normalizeChats } from '@shared/lib/storage'
import { newId } from '@shared/lib/storage'
import usePersistentState from '@/hooks/usePersistentState'

/**
 * The conversation list, and which one is open.
 *
 * Deliberately small: chats live in local storage until the vault service takes
 * them (that move is planned, and reads these same two keys), and nothing here
 * decides anything about a conversation's contents.
 */

const CHATS_KEY = 'ai-assistant.chats'
const CURRENT_KEY = 'ai-assistant.current-chat'

export type ChatState = {
  chats: Chat[]
  /** The raw setter, for the chat hook: replies stream into a message in place,
   *  which is a different kind of edit from opening or deleting a chat. */
  setChats: (update: Chat[] | ((previous: Chat[]) => Chat[])) => void
  currentChat: string
  open: (chatId: string) => void
  create: () => string
  remove: (chatId: string) => void
  rename: (chatId: string, title: string) => void
  pin: (chatId: string, pinned: boolean) => void
  setProject: (chatId: string, projectId: string | null) => void
}

export function useChats(onWarning?: (message: string) => void): ChatState {
  const [chats, setChats] = usePersistentState<Chat[]>(
    workspaceKey(CHATS_KEY),
    [],
    normalizeChats,
    onWarning
  )
  const [currentChat, setCurrentChat] = usePersistentState<string>(
    workspaceKey(CURRENT_KEY),
    '',
    value => (typeof value === 'string' ? value : ''),
    onWarning
  )

  const open = useCallback(
    (chatId: string) => setCurrentChat(chatId),
    [setCurrentChat]
  )

  /**
   * A new chat is not created here. It comes into being when the first message
   * is sent, so that clicking "New chat" and changing your mind does not leave an
   * empty conversation in the list forever.
   */
  const create = useCallback(() => {
    setCurrentChat('')
    return ''
  }, [setCurrentChat])

  const remove = useCallback(
    (chatId: string) => {
      setChats(previous => previous.filter(chat => chat.id !== chatId))
      if (currentChat === chatId) setCurrentChat('')
    },
    [setChats, setCurrentChat, currentChat]
  )

  const pin = useCallback(
    (chatId: string, pinned: boolean) => {
      setChats(previous => previous.map(chat => (chat.id === chatId ? { ...chat, pinned } : chat)))
    },
    [setChats]
  )

  const setProject = useCallback(
    (chatId: string, projectId: string | null) => {
      setChats(previous => previous.map(chat => (chat.id === chatId ? { ...chat, projectId } : chat)))
    },
    [setChats]
  )

  const rename = useCallback(
    (chatId: string, title: string) => {
      const clean = String(title || '').trim().slice(0, 80)
      if (!clean) return
      setChats(previous =>
        previous.map(chat => (chat.id === chatId ? { ...chat, title: clean } : chat))
      )
    },
    [setChats]
  )

  const value = useMemo<ChatState>(
    () => ({ chats, setChats, currentChat, open, create, remove, rename, pin, setProject }),
    [chats, setChats, currentChat, open, create, remove, rename]
  )

  return value
}

/**
 * Group the list the way the sidebar shows it. New chats are stamped 'Today' when
 * they are created, and everything older is grouped by that stamp — no guessing
 * from timestamps, so the headings never disagree with what was stored.
 */
export function groupChats(chats: Chat[]): Array<{ label: string; chats: Chat[] }> {
  const pinned: Chat[] = []
  const today: Chat[] = []
  const earlier: Chat[] = []
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
