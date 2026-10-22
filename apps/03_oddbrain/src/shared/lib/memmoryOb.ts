import type { Chat } from '../types'
import type { Project } from './projects'

/** OddBrain consumes the separately downloadable, engine-neutral LEGO core. */
export * from '../../../../../packages/Memmory_OB/src/index'
import type { MemmoryLifecycle } from '../../../../../packages/Memmory_OB/src/index'

export function memmoryChatLifecycle(chat: Chat): MemmoryLifecycle {
  return chat.lifecycle === 'trash' || chat.lifecycle === 'archived' ? chat.lifecycle : 'active'
}

export function memmoryProjectLifecycle(project: Project): MemmoryLifecycle {
  return project.lifecycle === 'trash' || project.lifecycle === 'archived' ? project.lifecycle : 'active'
}
