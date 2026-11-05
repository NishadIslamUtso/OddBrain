import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve, isAbsolute } from 'node:path'
import { configBytes, commitConfigs, noLinkedPath } from '../engine/configTransaction'
import { commandSpec, COMMAND_DISCLOSURE, type createCommandRunner } from '../commands/runner'
import type { WorkflowDefinition, WorkflowMode, WorkflowReview, WorkflowRun, WorkflowStep } from '../../shared/lib/workflows'
const ID = /^\d{13}-[a-f0-9-]{36}$/
const newId = () => `${Date.now()}-${randomUUID()}`
const digest = (value: Pick<WorkflowDefinition, 'name' | 'cwd' | 'platform' | 'steps' | 'mode'>) => createHash('sha256').update(JSON.stringify(value.mode === 'parallel-worktrees' ? [value.name, value.cwd, value.platform, value.steps, value.mode] : [value.name, value.cwd, value.platform, value.steps])).digest('hex')
const label = (value: unknown) => typeof value === 'string' && !!value.trim() && value.length <= 80 && !/[\x00-\x1f]/.test(value)
export function createWorkflowService(root: string, runner: ReturnType<typeof createCommandRunner>) {
  const definitions = join(root, 'definitions'), runs = join(root, 'runs')
  const path = (folder: string, id: string) => { if (!ID.test(id)) throw Error('Invalid workflow identifier.'); const file = join(folder, id + '.json'); noLinkedPath(file); return file }
  const load = <T,>(folder: string, id: string): { value: T; bytes: Buffer } => { const bytes = configBytes(path(folder, id)); if (!bytes) throw Error('Workflow record is missing.'); return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T, bytes } }
  const read = (id: string) => {
    const result = load<WorkflowDefinition>(definitions, id), v = result.value
    if (v?.id !== id || !label(v.name) || typeof v.cwd !== 'string' || !isAbsolute(v.cwd) || !['linux', 'win32', 'darwin'].includes(v.platform) || typeof v.archived !== 'boolean' || (v.mode !== undefined && !['serial', 'parallel-worktrees'].includes(v.mode)) || !Array.isArray(v.steps) || !v.steps.length || v.steps.length > 8 || (v.mode === 'parallel-worktrees' && v.steps.length < 2) || v.steps.some(step => !label(step?.name) || typeof step.command !== 'string' || !step.command.trim() || step.command.length > 32000) || v.digest !== digest(v)) throw Error('Workflow definition is invalid or changed. No repair or execution was attempted.')
    return result
  }
  const write = (folder: string, id: string, value: unknown, expected: Buffer | null) => {
    const text = JSON.stringify(value); commitConfigs([{ path: path(folder, id), text, expected }]); return Buffer.from(text)
  }
  const page = <T,>(folder: string, before: string, reader: (id: string) => T) => {
    if (before && !ID.test(before)) throw Error('Invalid workflow history cursor.')
    noLinkedPath(folder); if (!existsSync(folder)) return { items: [] as T[], next: '', notice: '' }
    const names = readdirSync(folder).filter(name => name.endsWith('.json')), ids = names.map(name => name.slice(0, -5)).filter(id => ID.test(id)).sort().reverse().filter(id => !before || id < before)
    const items: T[] = []; let damaged = names.some(name => !ID.test(name.slice(0, -5)))
    for (const id of ids.slice(0, 20)) { try { items.push(reader(id)) } catch { damaged = true } }
    return { items, next: ids.length > 20 ? ids[19] : '', notice: damaged ? 'Some workflow records could not be read. Originals were not changed.' : '' }
  }
  const prepare = (id: string, automated = false) => {
    const definition = read(id).value
    if (definition.archived || definition.platform !== process.platform) throw Error('This workflow is archived or belongs to another OS. It cannot run here unchanged.')
    if (automated && definition.mode === 'parallel-worktrees') throw Error('Isolated parallel workflows require a fresh manual review and cannot be scheduled unattended.')
    const requests = definition.steps.map(step => ({ command: step.command, cwd: definition.cwd }))
    if (definition.mode === 'parallel-worktrees') return { definition, mode: 'parallel-worktrees' as const, capability: runner.planParallelWorktrees(requests) }
    return { definition, mode: 'serial' as const, capability: runner.plan(requests) }
  }
  type Prepared = ReturnType<typeof prepare>
  const tickets = new Map<string, { owner: number; expiresAt: number; prepared: Prepared }>()
  let active: { owner: number; id: string; definitionId: string; controller: AbortController } | null = null
  const checkDefinition = (prepared: Prepared) => { const now = read(prepared.definition.id).value; if (now.archived || now.digest !== prepared.definition.digest) throw Error('Workflow changed or was archived after review. Remaining steps were not started.') }
  const runPrepared = async (prepared: Prepared, owner: number, origin?: { scheduleId: string; dueAt: number }, signal?: AbortSignal, onCreated?: (id: string) => void): Promise<WorkflowRun> => {
    if (active) throw Error('Another workflow is active.')
    checkDefinition(prepared); signal?.throwIfAborted()
    const record: WorkflowRun = { id: newId(), workflow: prepared.definition, at: new Date().toISOString(), state: 'running', steps: prepared.definition.steps.map(step => ({ ...step, state: 'pending' })), note: prepared.mode === 'parallel-worktrees' ? 'At most two commands run at once in separate detached Git worktrees. No merge or push is automatic.' : 'Commands run sequentially. Exit status is not proof of the overall requested outcome.', ...(prepared.mode === 'parallel-worktrees' ? { isolation: prepared.capability.isolation } : {}), ...origin }
    let previous = write(runs, record.id, record, null)
    onCreated?.(record.id)
    const own = { owner, id: record.id, definitionId: prepared.definition.id, controller: new AbortController() }; active = own
    const abort = () => own.controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort()
    const save = () => { previous = write(runs, record.id, record, previous) }
    try {
      const callbacks = {
        starting(index: number) { checkDefinition(prepared); own.controller.signal.throwIfAborted(); record.steps[index].state = 'starting' as const; save() },
        recorded(index: number, id: string) { record.steps[index].runId = id; save() },
        finished(index: number, result: { runId?: string; exitCode: number | null; interrupted: boolean; outputComplete: boolean; note?: string }) {
          const step = record.steps[index]; step.runId = result.runId; step.exitCode = result.exitCode; step.note = result.note
          step.state = result.interrupted || !result.outputComplete ? 'interrupted' : result.exitCode === 0 ? 'succeeded' : 'failed'
          save()
        },
      }
      if (prepared.mode === 'parallel-worktrees') await prepared.capability.run(owner, own.controller.signal, record.id, { ...callbacks, worktree(index, receipt) { record.steps[index].worktree = receipt; save() } })
      else await prepared.capability.run(owner, own.controller.signal, callbacks)
      record.state = record.steps.every(step => step.state === 'succeeded') ? 'succeeded' : record.steps.some(step => step.state === 'interrupted') ? 'interrupted' : 'failed'
      record.note = prepared.mode === 'parallel-worktrees'
        ? record.state === 'succeeded' ? 'Every isolated shell exited zero with complete captured output. Changed worktrees are retained for review; nothing was merged or pushed.' : 'No task after the first observed failure was started. Already-running siblings were allowed to record their actual result; changed worktrees remain isolated. Nothing was merged, pushed, retried, or rolled back.'
        : record.state === 'succeeded' ? 'Every planned shell exited zero with complete captured output. The overall task was not independently certified.' : 'Stopped at the first nonzero or unconfirmed result. Later steps did not run; completed effects were not rolled back.'
    } catch (error) { record.state = 'interrupted'; record.note = (error as Error)?.message || 'Workflow interrupted. No automatic retry.' }
    finally {
      for (const step of record.steps) if (step.state === 'starting') { step.state = 'interrupted'; step.note ||= 'Handoff or result was not confirmed. Inspect the linked command record before retrying.' } else if (step.state === 'pending') { step.state = 'skipped'; step.note = 'Not started.' }
      record.finishedAt = new Date().toISOString()
      try { save() } finally { signal?.removeEventListener('abort', abort); if (active === own) active = null }
    }
    return record
  }
  const readRun = (id: string) => {
    const record = load<WorkflowRun>(runs, id).value
    if (record?.id !== id || !Array.isArray(record.steps) || record.steps.length > 8 || typeof record.note !== 'string' || !['running', 'succeeded', 'failed', 'interrupted'].includes(record.state) || (record.isolation !== undefined && (typeof record.isolation.repositoryRoot !== 'string' || !isAbsolute(record.isolation.repositoryRoot) || !/^[a-f0-9]{40,64}$/.test(record.isolation.baseRevision) || record.isolation.maxConcurrency !== 2)) || record.steps.some(step => typeof step?.command !== 'string' || typeof step.name !== 'string' || !['pending', 'starting', 'succeeded', 'failed', 'interrupted', 'skipped'].includes(step.state) || (step.worktree !== undefined && (typeof step.worktree.path !== 'string' || !isAbsolute(step.worktree.path) || !/^[a-f0-9]{40,64}$/.test(step.worktree.baseRevision) || typeof step.worktree.retained !== 'boolean' || (step.worktree.retainedBytes !== undefined && (!Number.isSafeInteger(step.worktree.retainedBytes) || step.worktree.retainedBytes < 0)) || (step.worktree.retainedEntries !== undefined && (!Number.isSafeInteger(step.worktree.retainedEntries) || step.worktree.retainedEntries < 0)) || typeof step.worktree.note !== 'string')))) throw Error('Workflow run is damaged. Original unchanged.')
    if (record.state === 'running' && active?.id !== id) return { ...record, state: 'interrupted' as const, note: 'No final workflow receipt is available in this process. Commands may have started. Nothing was automatically retried.', steps: record.steps.map(step => step.state === 'starting' ? { ...step, state: 'interrupted' as const } : step.state === 'pending' ? { ...step, state: 'skipped' as const } : step) }
    return record
  }
  return {
    prepare, runPrepared, // Internal scheduler capability only; neither is exposed over IPC.
    readiness: runner.readiness,
    read: (id: string) => read(id).value,
    list: (before = '') => page(definitions, before, id => read(id).value),
    save(input: { name: string; cwd: string; steps: WorkflowStep[]; mode?: WorkflowMode }) {
      if (!input || !label(input.name) || (input.mode !== undefined && !['serial', 'parallel-worktrees'].includes(input.mode)) || !Array.isArray(input.steps) || !input.steps.length || input.steps.length > 8 || (input.mode === 'parallel-worktrees' && input.steps.length < 2) || input.steps.some(step => !label(step?.name) || typeof step.command !== 'string')) throw Error('Name the workflow and valid steps (two to eight for isolated parallel work). No command was saved or run.')
      if (typeof input.cwd !== 'string' || !isAbsolute(input.cwd) || resolve(input.cwd) !== resolve(runner.context().cwd)) throw Error('Save workflows for the selected working folder.')
      if (input.steps.reduce((n, step) => n + step.command.length, 0) > 100_000) throw Error('Workflow exceeds 100,000 command characters. Nothing was shortened.')
      for (const step of input.steps) commandSpec(step.command)
      noLinkedPath(definitions); if (existsSync(definitions) && readdirSync(definitions).length >= 1000) throw Error('Workflow storage limit reached. Existing definitions were not removed.')
      const value: WorkflowDefinition = { id: newId(), name: input.name.trim(), cwd: resolve(input.cwd), platform: process.platform, steps: input.steps.map(step => ({ name: step.name.trim(), command: step.command })), at: new Date().toISOString(), archived: false, digest: '', ...(input.mode === 'parallel-worktrees' ? { mode: input.mode } : {}) }
      value.digest = digest(value); write(definitions, value.id, value, null); return value
    },
    archive(id: string, archived: boolean) {
      if (typeof archived !== 'boolean') throw Error('Choose an archive state.')
      const { value, bytes } = read(id); write(definitions, id, { ...value, archived }, bytes)
      if (archived && active?.definitionId === id) active.controller.abort('Workflow archived')
    },
    preview(owner: number, id: string): WorkflowReview {
      for (const [token, value] of tickets) if (value.expiresAt <= Date.now()) tickets.delete(token)
      if (tickets.size >= 20) throw Error('Too many pending workflow reviews.')
      const prepared = prepare(id), token = randomUUID(), expiresAt = Date.now() + 120_000
      tickets.set(token, { owner, expiresAt, prepared })
      return { token, workflow: prepared.definition, executions: prepared.capability.executions, expiresAt, ...(prepared.mode === 'parallel-worktrees' ? { isolation: prepared.capability.isolation } : {}), explanation: prepared.mode === 'parallel-worktrees' ? `${COMMAND_DISCLOSURE} This one-use approval creates detached checkouts of the displayed clean Git revision and runs at most two exact commands at once, one per checkout. Repository hooks, system/global Git config, fsmonitor and configured checkout filters are disabled or refused during app-owned Git setup. This is Git write isolation, not an OS/filesystem/network sandbox: commands can still write elsewhere. Changed checkouts are retained; clean unchanged ones are removed, and new batches refuse when 20 retained batches need attention or measured storage plus the checkout estimate would exceed 2 GB. The final Git/size census cannot prove no transient, ignored, external, network, or background-process effects occurred. Nothing is merged or pushed. Stop requested after 15 minutes or 8 MB bounded output across the batch. On failure, no later task starts, but an already-running sibling records its real result.` : `${COMMAND_DISCLOSURE} This approval covers the whole exact sequence, once. One shared work slot; stop at the first nonzero/incomplete result. Stop requested after 15 minutes or 8 MB total output, also bounded per command. No rollback and no automatic retry.` }
    },
    async decide(owner: number, token: string, decision: 'allow' | 'deny') {
      const ticket = tickets.get(token)
      if (!ticket || ticket.owner !== owner) throw Error('Unknown workflow review for this window.')
      tickets.delete(token)
      if (decision === 'deny') return { denied: true as const }
      if (decision !== 'allow' || ticket.expiresAt <= Date.now()) throw Error('Workflow review expired. Nothing was run.')
      return runPrepared(ticket.prepared, owner)
    },
    cancel() { const requested = !!active; active?.controller.abort('Owner requested stop'); return { requested, answer: requested ? 'Workflow stop requested; unfinished steps will not start. Completed changes are not rolled back.' : 'No workflow is active.' } },
    forget(owner: number) { for (const [token, value] of tickets) if (value.owner === owner) tickets.delete(token); if (active?.owner === owner) active.controller.abort('Owner window closed') },
    runs(before = '') { const result = page(runs, before, readRun); return { records: result.items, next: result.next, notice: result.notice } },
    readRun,
  }
}
export type WorkflowService = ReturnType<typeof createWorkflowService>
