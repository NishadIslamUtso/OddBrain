import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { configBytes, commitConfigs, noLinkedPath } from '../engine/configTransaction'
import type { ApprovalSigner } from './approvalSigner'
import type { WorkflowService } from './service'
import type { ScheduleInput, ScheduleRecord, ScheduleEvent, ScheduleReview } from '../../shared/lib/schedules'
const ID = /^\d{13}-[a-f0-9-]{36}$/
type Stored = ScheduleRecord & { fingerprint: string; lastOutcome?: 'claimed' | 'succeeded' | 'failed' | 'interrupted' }
const GRACE = 60_000
/** App-process scheduler, not an OS daemon. Signed state and durable slot claims
 * precede execution. Missed work is not caught up, and uncertainty pauses runs. */
export function createWorkflowScheduler(options: { root: string; workflows: WorkflowService; signer: ApprovalSigner; now?: () => number; busy?: () => boolean; intervalMs?: number }) {
  const now = options.now || Date.now, defs = join(options.root, 'schedules'), events = join(options.root, 'inbox'), claims = join(options.root, 'claims')
  const id = () => `${now()}-${randomUUID()}`
  const path = (folder: string, key: string) => { if (!ID.test(key)) throw Error('Invalid schedule identifier.'); const file = join(folder, key + '.json'); noLinkedPath(file); return file }
  let timer: ReturnType<typeof setInterval> | undefined, ticking = false, disposed = false, recovered = false, halted = false, notice = ''
  let running: { scheduleId: string; controller: AbortController } | null = null
  const quarantined = new Map<string, string>()
  const tickets = new Map<string, { owner: number; input: ScheduleInput; fingerprint: string; digest: string; expiresAt: number; replacement?: Buffer }>()
  const publicRecord = (value: Stored): ScheduleRecord => { const { fingerprint: _fingerprint, lastOutcome: _lastOutcome, ...visible } = value; return visible }
  const read = (key: string) => {
    const bytes = configBytes(path(defs, key)); if (!bytes) throw Error('Schedule is missing.')
    const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!envelope || typeof envelope.signature !== 'string' || !options.signer.verify(JSON.stringify(envelope.value), envelope.signature)) throw Error('Schedule authorization could not be verified. It was not executed or repaired.')
    const value = envelope.value as Stored
    if (value?.id !== key || !ID.test(value.workflowId) || typeof value.workflowName !== 'string' || !/^[a-f0-9]{64}$/.test(value.workflowDigest) || !/^[a-f0-9]{64}$/.test(value.fingerprint) || !Number.isSafeInteger(value.intervalMs) || value.intervalMs < 300_000 || value.intervalMs > 30 * 86400000 || !Number.isSafeInteger(value.nextAt) || !['enabled', 'paused', 'needs-review'].includes(value.state) || typeof value.note !== 'string') throw Error('Unsupported schedule state. No run was started.')
    return { value, bytes }
  }
  const save = (value: Stored, expected: Buffer | null) => commitConfigs([{ path: path(defs, value.id), text: JSON.stringify({ value, signature: options.signer.sign(JSON.stringify(value)) }), expected }])
  const keys = (folder: string) => { noLinkedPath(folder); return existsSync(folder) ? readdirSync(folder).filter(file => ID.test(file.slice(0, -5)) && file.endsWith('.json')).map(file => file.slice(0, -5)).sort() : [] }
  const readEvent = (key: string) => {
    const bytes = configBytes(path(events, key)); if (!bytes) throw Error('Inbox record is missing.')
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as ScheduleEvent
    if (value?.id !== key || !ID.test(value.scheduleId) || typeof value.workflowName !== 'string' || typeof value.note !== 'string' || !Number.isSafeInteger(value.dueAt) || !['claimed', 'succeeded', 'failed', 'interrupted', 'missed', 'blocked'].includes(value.state) || typeof value.acknowledged !== 'boolean') throw Error('Inbox record is damaged. Original retained.')
    return { value, bytes }
  }
  const event = (schedule: Stored, dueAt: number, state: ScheduleEvent['state'], note: string) => {
    const value: ScheduleEvent = { id: id(), scheduleId: schedule.id, workflowName: schedule.workflowName, dueAt, at: new Date(now()).toISOString(), state, note, acknowledged: false }
    commitConfigs([{ path: path(events, value.id), text: JSON.stringify(value), expected: null }]); return value
  }
  const changeEvent = (value: ScheduleEvent) => { const previous = readEvent(value.id); commitConfigs([{ path: path(events, value.id), text: JSON.stringify({ ...value, acknowledged: previous.value.acknowledged || value.acknowledged }), expected: previous.bytes }]) }
  const slotPath = (scheduleId: string, dueAt: number) => { if (!ID.test(scheduleId) || !Number.isSafeInteger(dueAt)) throw Error('Invalid schedule slot.'); const file = join(claims, `${scheduleId}-${dueAt}.json`); noLinkedPath(file); return file }
  const advance = (schedule: Stored, time: number) => schedule.nextAt + (Math.floor((time - schedule.nextAt) / schedule.intervalMs) + 1) * schedule.intervalMs
  const pauseUncertain = (schedule: Stored, bytes: Buffer, why: string) => { save({ ...schedule, state: 'needs-review', note: why }, bytes); event(schedule, schedule.lastSlot || schedule.nextAt, 'blocked', why) }
  const recover = () => {
    if (recovered) return; recovered = true
    for (const key of keys(defs)) {
      try {
        const { value, bytes } = read(key)
        if (value.state !== 'enabled') continue
        if (value.lastSlot !== undefined) {
          const claim = configBytes(slotPath(value.id, value.lastSlot))
          const slot = claim ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(claim)) : null
          if (!slot || value.lastOutcome !== 'succeeded') { pauseUncertain(value, bytes, 'A previous slot has no confirmed final result. It may have started; automatic execution is paused for review.'); continue }
        }
        if (configBytes(slotPath(value.id, value.nextAt))) { pauseUncertain(value, bytes, 'A due slot already has a durable claim. Its outcome needs review; it will not be replayed.'); continue }
        if (value.nextAt <= now()) {
          event(value, value.nextAt, 'missed', 'This slot was overdue at app startup. Nothing was replayed; the next future slot was selected.')
          save({ ...value, nextAt: advance(value, now()), note: 'Missed startup slots were not replayed.' }, bytes)
        }
      } catch (error) { notice = (error as Error).message; quarantined.set(key, notice) }
    }
  }
  const tick = async () => {
    if (disposed || ticking || halted) return
    ticking = true
    try {
      recover()
      for (const key of keys(defs)) {
        if (disposed) break
        if (quarantined.has(key)) continue
        let item: ReturnType<typeof read>
        try { item = read(key) } catch (error) { notice = (error as Error).message; quarantined.set(key, notice); continue }
        const schedule = item.value
        if (schedule.state !== 'enabled') continue
        if (schedule.lastSlot !== undefined && schedule.lastOutcome !== 'succeeded') { pauseUncertain(schedule, item.bytes, 'Previous slot has no confirmed successful outcome. Future work is paused for review.'); continue }
        if (schedule.nextAt > now()) continue
        if (configBytes(slotPath(schedule.id, schedule.nextAt))) { pauseUncertain(schedule, item.bytes, 'This slot was already claimed. Inspect its earlier result before approving future work.'); continue }
        if (now() - schedule.nextAt > GRACE) {
          event(schedule, schedule.nextAt, 'missed', 'The app was busy, asleep or unavailable beyond the one-minute grace period. Missed slots were skipped, not replayed.')
          save({ ...schedule, nextAt: advance(schedule, now()), note: 'Missed slot; next future slot retained.' }, item.bytes); continue
        }
        const ready = options.workflows.readiness()
        if (options.busy?.() || ready.busy) continue
        if (!ready.allowed) { pauseUncertain(schedule, item.bytes, ready.explanation || 'Command access is no longer allowed. Review again before enabling this schedule.'); continue }
        let prepared: ReturnType<WorkflowService['prepare']>
        try {
          prepared = options.workflows.prepare(schedule.workflowId, true)
          if (prepared.definition.digest !== schedule.workflowDigest || prepared.capability.stableFingerprint !== schedule.fingerprint) throw Error('Workflow, folder, OS shell, environment or permissions changed after recurring approval.')
        } catch (error) { pauseUncertain(schedule, item.bytes, (error as Error).message); continue }
        const claimFile = slotPath(schedule.id, schedule.nextAt)
        if (configBytes(claimFile)) { pauseUncertain(schedule, item.bytes, 'This due slot already has a durable claim. It will not be dispatched twice.'); continue }
        const receipt = event(schedule, schedule.nextAt, 'claimed', 'Slot claimed before execution. This is not proof of completion.')
        let claimBytes = Buffer.from(JSON.stringify({ eventId: receipt.id, state: 'claimed' }))
        commitConfigs([{ path: claimFile, text: claimBytes.toString(), expected: null }])
        const current: Stored = { ...schedule, nextAt: schedule.nextAt + schedule.intervalMs, lastSlot: schedule.nextAt, lastOutcome: 'claimed', note: 'Claimed slot; execution result pending.' }
        save(current, item.bytes) // Advance BEFORE starting any command; no destructive retry.
        const own = { scheduleId: schedule.id, controller: new AbortController() }; running = own
        try {
          const result = await options.workflows.runPrepared(prepared, -1, { scheduleId: schedule.id, dueAt: schedule.nextAt }, own.controller.signal, runId => {
            receipt.runId = runId; changeEvent(receipt)
          })
          receipt.runId = result.id; receipt.state = result.state === 'running' ? 'interrupted' : result.state; receipt.note = result.note; changeEvent(receipt)
          const text = JSON.stringify({ eventId: receipt.id, state: result.state, runId: result.id })
          commitConfigs([{ path: claimFile, text, expected: claimBytes }]); claimBytes = Buffer.from(text)
          const latest = read(schedule.id)
          save({ ...latest.value, lastRunId: result.id, lastOutcome: result.state === 'running' ? 'interrupted' : result.state, state: latest.value.state === 'paused' ? 'paused' : result.state === 'succeeded' ? 'enabled' : 'needs-review', note: result.state === 'succeeded' ? 'Previous sequence exited zero. This is not independent task certification.' : 'Previous execution failed or was interrupted. Re-enable only through a fresh recurring review.' }, latest.bytes)
        } catch (error) {
          receipt.state = 'interrupted'; receipt.note = 'Workflow handoff or receipt is uncertain. No automatic retry. ' + ((error as Error).message || '')
          try { changeEvent(receipt); const latest = read(schedule.id); save({ ...latest.value, state: 'needs-review', lastOutcome: 'interrupted', note: receipt.note }, latest.bytes) } catch { quarantined.set(schedule.id, receipt.note); notice = 'Schedule receipt could not be saved. The claimed slot remains non-replayable; inspect original records.' }
        } finally { if (running === own) running = null }
      }
    } catch (error) { halted = true; notice = 'Automatic scheduling stopped after a storage/control failure. No automatic retry. ' + (error as Error).message }
    finally { ticking = false }
  }
  return {
    tick,
    start() { try { recover() } catch (error) { halted = true; notice = (error as Error).message }; if (!timer) { timer = setInterval(() => { void tick() }, options.intervalMs ?? 5000); timer.unref() } },
    dispose() { disposed = true; if (timer) clearInterval(timer); running?.controller.abort('App is closing') },
    list() { recover(); const items: ScheduleRecord[] = []; for (const key of keys(defs)) { try { items.push(quarantined.has(key) ? { ...publicRecord(read(key).value), state: 'needs-review', note: quarantined.get(key)! } : publicRecord(read(key).value)) } catch (error) { notice = (error as Error).message } }; return { items, notice } },
    preview(owner: number, raw: ScheduleInput): ScheduleReview {
      recover(); if (halted) throw Error('Scheduling halted after a storage/control failure. Inspect records and restart the app after repair before enabling new work.'); options.signer.available()
      if (!raw || !ID.test(raw.workflowId) || !Number.isSafeInteger(raw.intervalMinutes) || raw.intervalMinutes < 5 || raw.intervalMinutes > 43200 || !Number.isSafeInteger(raw.firstAt) || raw.firstAt < now() + 5000 || raw.firstAt > now() + 366 * 86400000) throw Error('Choose an interval of 5 minutes to 30 days and a future first run within one year.')
      for (const [token, entry] of tickets) if (entry.expiresAt <= now()) tickets.delete(token)
      if (tickets.size >= 20) throw Error('Too many pending recurring reviews.')
      const replacement = raw.replaceId ? read(raw.replaceId) : undefined
      if (replacement && (replacement.value.state === 'needs-review' || replacement.value.lastOutcome === 'claimed' || replacement.value.lastOutcome === 'interrupted') && raw.acknowledgeUncertainty !== true) throw Error('Inspect earlier uncertain work and acknowledge it before enabling future slots.')
      if (!raw.replaceId && keys(defs).some(key => { try { const value = read(key).value; return value.workflowId === raw.workflowId && value.state === 'enabled' } catch { return false } })) throw Error('This workflow already has an enabled schedule. Review a change to that schedule instead of creating a duplicate.')
      const prepared = options.workflows.prepare(raw.workflowId, true), token = randomUUID(), expiresAt = now() + 120_000, input = structuredClone(raw)
      tickets.set(token, { owner, input, fingerprint: prepared.capability.stableFingerprint, digest: prepared.definition.digest, expiresAt, replacement: replacement?.bytes })
      return { token, expiresAt, input, workflow: prepared.definition, executions: prepared.capability.executions, explanation: 'Recurring OS execution, not a one-time command approval. This exact sequence may run automatically while the app process is running, including with windows closed. It does not run while the app is quit. The approved working folder must remain selected. Runs may start up to one minute late; older/missed slots are skipped. Changed definition, shell, environment or access pauses execution. Referenced scripts are not audited or pinned and can change. Nonzero/incomplete results pause future runs. Unfinished claims never replay after restart. No OS sandbox, automatic rollback or guarantee all descendants exited.' }
    },
    decide(owner: number, token: string, decision: 'allow' | 'deny') {
      const ticket = tickets.get(token)
      if (halted) throw Error('Scheduling is halted. No recurring approval was applied.')
      if (!ticket || ticket.owner !== owner) throw Error('Unknown schedule review for this window.')
      tickets.delete(token)
      if (decision === 'deny') return { denied: true as const }
      if (decision !== 'allow' || ticket.expiresAt <= now() || ticket.input.firstAt <= now()) throw Error('Schedule review expired or its first slot passed. Nothing was enabled.')
      const prepared = options.workflows.prepare(ticket.input.workflowId, true)
      if (prepared.definition.digest !== ticket.digest || prepared.capability.stableFingerprint !== ticket.fingerprint) throw Error('Recurring execution authority changed. Review again.')
      if (!ticket.input.replaceId && keys(defs).length >= 100) throw Error('Schedule capacity reached. Existing schedules were not evicted.')
      const prior = ticket.input.replaceId ? read(ticket.input.replaceId) : undefined
      if (prior && (!ticket.replacement || !prior.bytes.equals(ticket.replacement))) throw Error('The schedule changed during review. Nothing was replaced.')
      if (!prior && keys(defs).some(key => { try { const value = read(key).value; return value.workflowId === ticket.input.workflowId && value.state === 'enabled' } catch { return false } })) throw Error('An enabled schedule was added during review. A duplicate was not created.')
      const value: Stored = { id: prior?.value.id || id(), workflowId: ticket.input.workflowId, workflowName: prepared.definition.name, workflowDigest: ticket.digest, fingerprint: ticket.fingerprint, intervalMs: ticket.input.intervalMinutes * 60000, nextAt: ticket.input.firstAt, at: new Date(now()).toISOString(), state: 'enabled', note: 'Explicit recurring approval saved. No command was run by saving it.' }
      if (prior) {
        const text = JSON.stringify({ value, signature: options.signer.sign(JSON.stringify(value)) })
        commitConfigs([{ path: path(join(options.root, 'revisions'), id()), text: prior.bytes.toString('utf8'), expected: null }, { path: path(defs, value.id), text, expected: prior.bytes }])
      } else save(value, null)
      quarantined.delete(value.id)
      return publicRecord(value)
    },
    pause(key: string) {
      if (running?.scheduleId === key) running.controller.abort('Schedule paused')
      try { const current = read(key); save({ ...current.value, state: 'paused', note: 'Paused by owner. Fresh recurring review is required to enable a new schedule.' }, current.bytes) }
      catch (error) { quarantined.set(key, 'Pause persistence failed; no further automatic runs in this process. Inspect original records.'); throw error }
    },
    forget(owner: number) { for (const [token, entry] of tickets) if (entry.owner === owner) tickets.delete(token) },
    inbox(before = '') {
      if (before && !ID.test(before)) throw Error('Invalid inbox cursor.')
      const ids = keys(events).reverse().filter(key => !before || key < before), items: ScheduleEvent[] = []; let warning = ''
      for (const key of ids.slice(0, 20)) { try { const value = readEvent(key).value; items.push(value.state === 'claimed' && running?.scheduleId !== value.scheduleId ? { ...value, state: 'interrupted', note: 'A claimed slot has no confirmed result in this process. No automatic retry.' } : value) } catch { warning = 'Some inbox records could not be read. Originals are unchanged.' } }
      return { items, next: ids.length > 20 ? ids[19] : '', notice: warning || notice }
    },
    acknowledge(key: string) { const entry = readEvent(key); commitConfigs([{ path: path(events, key), text: JSON.stringify({ ...entry.value, acknowledged: true }), expected: entry.bytes }]) },
  }
}
