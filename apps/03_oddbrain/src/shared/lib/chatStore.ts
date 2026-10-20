import type { Chat } from '../types'

/** A complete, revisioned view of the app-owned conversation library. */
export type ChatStoreSnapshot = {
  initialized: boolean
  revision: number
  chats: Chat[]
  currentChat: string
  /** Present when the previous atomic index was used because the newest one was damaged. */
  notice?: string
}

/** The one-time renderer-storage handoff. Raw strings are retained as recovery evidence. */
export type ChatStoreMigration = {
  chats: unknown
  currentChat: unknown
  rawChats: string | null
  rawCurrentChat: string | null
}

export type ChatStoreWrite = {
  /** Complete ordering/retention list, but only changed chats travel in upserts. */
  order: unknown
  upserts: unknown
  currentChat: unknown
  expectedRevision: number
}

export type ChatStoreAnswer =
  | { ok: true; snapshot: ChatStoreSnapshot; migrated?: boolean }
  | { ok: false; error: string; snapshot?: ChatStoreSnapshot }

export type ChatStorageAction = { ok: boolean; answer: string; path?: string }

export type ChatStoreBridge = {
  read: () => Promise<ChatStoreAnswer>
  migrate: (input: ChatStoreMigration) => Promise<ChatStoreAnswer>
  write: (input: ChatStoreWrite) => Promise<ChatStoreAnswer>
  /** Export the visible library plus the exact legacy strings through a native save dialog. */
  exportRecovery: (input: ChatStoreMigration) => Promise<ChatStorageAction>
  /** Open the private app-chat folder. The renderer never supplies a path. */
  openLocation: () => Promise<ChatStorageAction>
}
