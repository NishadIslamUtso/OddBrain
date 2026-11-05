import type { Chat } from '../types'
import type { Project } from './projects'

/** OddBrain consumes the separately downloadable, engine-neutral LEGO core. */
export * from '../../../../../packages/Memory_OB/src/index'
import type { MemoryLifecycle } from '../../../../../packages/Memory_OB/src/index'

export function memoryChatLifecycle(chat: Chat): MemoryLifecycle {
  return chat.lifecycle === 'trash' || chat.lifecycle === 'archived' ? chat.lifecycle : 'active'
}

export function memoryProjectLifecycle(project: Project): MemoryLifecycle {
  return project.lifecycle === 'trash' || project.lifecycle === 'archived' ? project.lifecycle : 'active'
}
