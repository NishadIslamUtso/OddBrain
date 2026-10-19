import { ORGANIZER_SYSTEM, type MemoryAction, type MemoryView } from '../../shared/lib/memoryWorkspace'
import type { MemoryStore } from './workspace'
export function createMemoryOrganizer(options: {
  store: () => MemoryStore; busy: () => boolean; configuration: () => string;
  run: (system: string, prompt: string, preferences: { model: string; allowExternal: boolean }, signal: AbortSignal) => Promise<{ text: string; model: string }>;
  intervalMs?: number
}) {
  let active: AbortController | null = null, disposed = false, status = 'Waiting for new sources', lastFailure = '', pausedConfiguration = ''
  async function pump() {
    if (active || disposed || options.busy()) return
    let store: MemoryStore
    try { store = options.store() } catch (e) { lastFailure = (e as Error).message; return }
    const prefs = store.read().preferences
    if (!prefs.enabled) { status = 'Organizer paused'; return }
    const signature = options.configuration()
    // A transport failure pauses this vault/configuration, not every vault.
    const configuration = JSON.stringify([store.root, signature, prefs])
    if (pausedConfiguration === configuration) return
    const state = store.discover(), job = state.jobs.find(j => j.state === 'queued')
    if (!job) { status = state.jobs.some(j => j.state === 'blocked') ? 'Some sources need attention' : 'No new text waiting'; return }
    // Finish fallible preflight before taking the active-operation lease.
    const privacy = store.privacyFingerprint(), root = store.root, preferences = JSON.stringify(prefs)
    const controller = new AbortController(); active = controller; status = 'Preparing interpretations'; lastFailure = ''
    const valid = () => {
      try {
        return !disposed && !options.busy() && options.configuration() === signature && options.store().root === root && store.privacyFingerprint() === privacy && JSON.stringify(store.read().preferences) === preferences
      } catch { return false }
    }
    const gate = setInterval(() => { try { if (!valid()) controller.abort() } catch { controller.abort() } }, 200)
    try {
      const text = store.evidence(job.source)
      let result: { text: string; model: string }
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(90000)])
      try {
        result = await options.run(ORGANIZER_SYSTEM, JSON.stringify({ source: job.source, text, attachment_notice: 'Attachments are retained as sources but their contents were not analyzed by this text organizer.' }), prefs, signal)
        // The transport may ignore abort and return after its deadline.
        signal.throwIfAborted()
      } catch (e) {
        if (!controller.signal.aborted && valid()) pausedConfiguration = configuration
        throw e
      }
      if (controller.signal.aborted || !valid()) return
      store.complete(job.id, result.text, result.model)
      status = 'Interpretations ready for your review'
    } catch (error) {
      if (!controller.signal.aborted && valid()) { pausedConfiguration = configuration; lastFailure = (error as Error).message; store.fail(job.id, lastFailure); status = 'Source needs attention' }
    } finally { clearInterval(gate); if (active === controller) active = null }
  }
  const timer = setInterval(() => { void pump().catch(e => { lastFailure = String(e.message || e) }) }, options.intervalMs ?? 10000)
  timer.unref?.()
  const read = (): MemoryView => { const store = options.store(); return { ...store.read(), desktop: true, running: !!active, status: lastFailure || status, root: store.root } }
  return {
    read,
    act(action: MemoryAction): MemoryView { if (action.type === 'preferences') active?.abort(); if (action.type === 'preferences' || action.type === 'retry') { pausedConfiguration = ''; lastFailure = '' } options.store().act(action); return read() },
    async run(): Promise<MemoryView> { pausedConfiguration = ''; options.store().discover(); await pump(); return read() },
    cancel() { active?.abort() },
    dispose() { disposed = true; clearInterval(timer); active?.abort() },
  }
}
