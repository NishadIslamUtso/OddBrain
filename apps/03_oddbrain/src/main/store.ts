import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  MAX_WORKSPACE_BYTES,
  emptyWorkspace,
  validateWorkspace,
  type Workspace,
  type WorkspaceReply,
} from '../shared/workspace'

const message = (cause: unknown): string =>
  cause instanceof Error ? cause.message : 'Unknown storage failure.'

/** Separate from the prior app's files: a rebuild must never overwrite old owner data. */
export function createWorkspaceStore(directory: string) {
  const path = join(directory, 'workspace-v1.json')
  let pending: Promise<unknown> = Promise.resolve()
  const load = async (): Promise<{ data: Workspace; revision: number }> => {
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch (failure) {
      if ((failure as NodeJS.ErrnoException).code === 'ENOENT')
        return { data: emptyWorkspace(), revision: 0 }
      throw new Error(`Workspace could not be read: ${message(failure)}`)
    }
    try {
      if (Buffer.byteLength(raw) > MAX_WORKSPACE_BYTES + 1024)
        throw new Error('The workspace is too large.')
      const envelope: unknown = JSON.parse(raw)
      if (
        !envelope ||
        typeof envelope !== 'object' ||
        !('revision' in envelope) ||
        !Number.isSafeInteger(envelope.revision) ||
        (envelope.revision as number) < 0 ||
        !('data' in envelope)
      )
        throw new Error('Workspace header is damaged.')
      return { revision: envelope.revision as number, data: validateWorkspace(envelope.data) }
    } catch (failure) {
      throw new Error(`Saved workspace is unreadable. Nothing was overwritten. ${message(failure)}`)
    }
  }
  const read = async (): Promise<WorkspaceReply> => {
    await pending
    try {
      const result = await load()
      return { ok: true, ...result, location: path }
    } catch (failure) {
      return { ok: false, error: message(failure) }
    }
  }
  const write = (data: Workspace, expectedRevision: number): Promise<WorkspaceReply> => {
    const next = pending.then(async (): Promise<WorkspaceReply> => {
      let temporary = ''
      try {
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
          throw new Error('The workspace revision is invalid.')
        const current = await load()
        if (current.revision !== expectedRevision)
          throw new Error(
            'The workspace changed in another window. Reload before saving; nothing was overwritten.',
          )
        const checked = validateWorkspace(data)
        const revision = current.revision + 1
        const serialized = JSON.stringify({ revision, data: checked })
        if (Buffer.byteLength(serialized) > MAX_WORKSPACE_BYTES + 1024)
          throw new Error('The workspace is too large to save.')
        await mkdir(directory, { recursive: true })
        temporary = join(directory, `.workspace-${randomUUID()}.tmp`)
        await writeFile(temporary, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
        await rename(temporary, path)
        return { ok: true, data: checked, revision, location: path }
      } catch (failure) {
        return { ok: false, error: message(failure) }
      } finally {
        if (temporary) await rm(temporary, { force: true }).catch(() => undefined)
      }
    })
    pending = next
    return next
  }
  return { read, write, path }
}
