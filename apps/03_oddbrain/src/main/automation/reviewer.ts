import { boundedResponse } from '../network/boundedResponse'
import type { CloudClient } from '../cloud/client'
import type { EngineSettings } from '../../shared/lib/engine'
import type { Permissions } from '../../shared/lib/permissions'
import { parseCloudModel } from '../../shared/lib/providers'
import { isRemoteModel } from '../../shared/lib/ollama'
import { REVIEW_SYSTEM, reviewEvidence, type AutomationPreferences, type ReviewerModel, type ReviewTask } from '../../shared/lib/automation'

/** No subprocess, engine session, tool dispatcher, approval or hook is in this
 * transport. Model output is returned only as text; it cannot become actions. */
export function createTextReviewer(options: {
  permissions: () => Permissions
  cloudAllowed?: () => boolean
  cloud: () => CloudClient | null
  engine: () => EngineSettings
  fetchImpl?: typeof fetch
}) {
  const request = options.fetchImpl || fetch
  function door(engine: EngineSettings, allowExternal: boolean): string {
    const url = new URL(engine.baseUrl || 'http://localhost:11434')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('The reviewer needs a plain HTTP(S) model endpoint.')
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && options.cloudAllowed?.() === false) throw Error('External model inference is off in Agent access.')
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !allowExternal) throw Error('External review is off. Choose a loopback/local reviewer or explicitly allow external review.')
    return url.href.replace(/\/$/, '')
  }
  async function json(url: string, init: RequestInit, signal: AbortSignal): Promise<Record<string, any>> {
    const reply = await request(url, { ...init, signal, redirect: 'error' })
    if (!reply.ok) throw Error(`Reviewer endpoint answered ${reply.status}.`)
    const text = await boundedResponse(reply, 2_000_000, 'Reviewer endpoint returned an oversized response.')
    return JSON.parse(text)
  }
  function chosen(task: ReviewTask, prefs: AutomationPreferences): string {
    if (prefs.reviewModel) return prefs.reviewModel
    if (task.engine.cloudProvider === 'anthropic') return task.engine.model.startsWith('anthropic/') ? task.engine.model : 'anthropic/' + task.engine.model
    if (task.engine.cloudProvider === 'native' || !task.engine.model) throw Error('Choose an installed local or saved-key reviewer. The native engine login has no verified tool-free review channel.')
    if (task.engine.id !== 'claude-code') throw Error('Choose an installed local or saved-key reviewer. agy has no verified tool-free review channel; its agent is never used as a report-only reviewer.')
    return task.engine.model
  }
  async function complete(task: ReviewTask, prefs: AutomationPreferences, signal: AbortSignal, messages: Array<{ role: 'system' | 'user'; content: string }>, maxTokens: number, clipped: boolean) {
      const model = chosen(task, prefs), provider = parseCloudModel(model)
      if (provider) {
        if (options.cloudAllowed?.() === false) throw Error('Cloud inference is off in Agent access. No review was sent.')
        if (!prefs.allowExternalReview) throw Error('Cloud review is off. Choose a local reviewer or explicitly allow external review.')
        const cloud = options.cloud()
        if (!cloud) throw Error('The saved-key reviewer is not available.')
        // Existing client enforces key presence and fresh Agent access permissions.
        // buildChatRequest sends NO tools and this consumer never dispatches output.
        let text = ''
        for await (const record of cloud.stream({ model, messages, maxTokens, signal })) {
          if (record.error) throw Error(record.error)
          text += record.message?.content || ''
          if (text.length > 16000) throw Error('Reviewer exceeded its report limit.')
        }
        if (!text.trim()) throw Error('The reviewer returned no report.')
        return { text, model, clipped: clipped }
      }
      if (!options.permissions().local) throw Error('Local inference is switched off in Agent access. No review was sent.')
      const base = door(task.engine, prefs.allowExternalReview)
      const catalog = await json(base + '/api/tags', {}, signal)
      const installed = (Array.isArray(catalog.models) ? catalog.models : []).find((m: Record<string, unknown>) => m.name === model || m.model === model)
      if (!installed) throw Error('The selected reviewer model is not installed at this endpoint. No task text was sent.')
      if (isRemoteModel(model, installed) && options.cloudAllowed?.() === false) throw Error('Cloud inference is off in Agent access. No review was sent.')
      if (isRemoteModel(model, installed) && !prefs.allowExternalReview) throw Error('The selected model is remote. External review is off; no task text was sent.')
      const metadata = await json(base + '/api/show', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model }) }, signal)
      if (isRemoteModel(model, metadata) && options.cloudAllowed?.() === false) throw Error('Cloud inference is off in Agent access. No review was sent.')
      if (isRemoteModel(model, metadata) && !prefs.allowExternalReview) throw Error('This model runs elsewhere. External review is off; no task text was sent.')
      const data = await json(base + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages, stream: false, think: false, options: { num_ctx: maxTokens > 768 ? 8192 : 4096, num_predict: maxTokens, temperature: 0 } }) }, signal)
      if (data.error) throw Error(String(data.error))
      if (data.message?.tool_calls?.length || data.tool_calls?.length) throw Error('The reviewer returned a tool request. Nothing was executed.')
      if (data.done !== true) throw Error('The review did not finish. Partial text is not a verdict.')
      const text = String(data.message?.content || data.response || '').trim()
      if (!text || text.length > 16000) throw Error('The reviewer returned an empty or oversized report.')
      return { text, model, clipped: clipped }
  }
  return {
    async models(prefs: AutomationPreferences): Promise<ReviewerModel[]> {
      const signal = AbortSignal.timeout(5000), engine = options.engine()
      const models: ReviewerModel[] = []
      try {
        const data = await json(door(engine, prefs.allowExternalReview) + '/api/tags', {}, signal)
        for (const m of Array.isArray(data.models) ? data.models : []) if (typeof m.name === 'string') models.push({ name: m.name, label: m.name, external: isRemoteModel(m.name, m) })
      } catch { /* The provider list may still be available. Actual calls report errors. */ }
      const client = options.cloud()
      if (client && prefs.allowExternalReview) {
        const result = await client.models()
        for (const m of result.models) models.push({ name: m.name, label: m.name, external: true })
      }
      return models
    },
    async run(task: ReviewTask, prefs: AutomationPreferences, signal: AbortSignal): Promise<{ text: string; model: string; clipped: boolean }> {
      const evidence = reviewEvidence(task)
      return complete(task, prefs, signal, [{ role: 'system', content: REVIEW_SYSTEM }, { role: 'user', content: evidence.prompt }], 768, evidence.clipped)
    },
    async organize(system: string, prompt: string, preferences: { model: string; allowExternal: boolean }, signal: AbortSignal) {
      if (prompt.length > 18000 || system.length > 6000) throw Error('Organizer batch exceeds its context budget. Nothing was sent.')
      const task: ReviewTask = { id: 'memory', engine: { ...options.engine() }, automatic: true, at: new Date().toISOString(), prompt: '', answer: '' }
      const prefs: AutomationPreferences = { autoKeep: true, autoReview: false, allowCloudInference: options.cloudAllowed?.() !== false, reviewModel: preferences.model, allowExternalReview: preferences.allowExternal }
      return complete(task, prefs, signal, [{ role: 'system', content: system }, { role: 'user', content: prompt }], 2048, false)
    },
  }
}
