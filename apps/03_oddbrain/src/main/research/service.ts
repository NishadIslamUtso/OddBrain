import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TRANSCRIPT_ID } from '../../shared/lib/transcripts'
import {
  MAX_SOURCE_LINKS,
  pageTitle,
  planSourceUrls,
  sourceUrlProblem,
  validSourceCheckRecord,
  type SourceCheckEntry,
  type SourceCheckRecord,
} from '../../shared/lib/sourceCheck'
import { noLinkedPath } from '../engine/configTransaction'

const CHAT_ID = /^[a-zA-Z0-9_.:-]{1,256}$/
const RECEIPT_ID = /^\d{13}-[a-f0-9-]{36}$/
const TEXT_TYPES = /^(text\/html|application\/xhtml\+xml|text\/plain|text\/markdown|application\/json|application\/ld\+json|text\/xml|application\/xml)$/
const DISCLOSURE = 'OddBrain will open these exact https addresses once from this machine, without your cookies, saved app keys or account credentials. Each result records the status, content type, size and SHA-256 of the bytes read. A receipt is not proof that the model read the page or that the page supports the claim; pages can change or answer differently for you.'

export type SourceCheckPreview = { token: string; urls: string[]; refused: Array<{ url: string; reason: string }>; expiresAt: number; explanation: string }

type Pending = { owner: number; urls: string[]; refused: Array<{ url: string; reason: string }>; transcriptId: string; chatId: string; questionStart: string; expiresAt: number }

/**
 * Check the links a reply already wrote. App-owned egress, one review per batch,
 * sequential requests with a per-page deadline and a bounded read.
 */
export function createSourceChecks(options: {
  root: string
  fetchImpl?: typeof fetch
  deadlineMs?: number
  maxBytes?: number
  now?: () => number
}) {
  const deadline = options.deadlineMs ?? 10_000, maxBytes = options.maxBytes ?? 512_000, now = options.now ?? Date.now
  if (!Number.isSafeInteger(deadline) || deadline < 1 || deadline > 30_000) throw Error('Invalid source-check deadline.')
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2_000_000) throw Error('Invalid source-check size limit.')
  const request = options.fetchImpl ?? fetch
  const pending = new Map<string, Pending>()

  const folder = (transcriptId: string) => {
    if (!TRANSCRIPT_ID.test(transcriptId)) throw Error('Invalid transcript identifier.')
    noLinkedPath(options.root)
    return join(options.root, transcriptId)
  }
  const check = async (url: string): Promise<SourceCheckEntry> => {
    const checkedAt = new Date(now()).toISOString()
    let response: Response
    try {
      response = await request(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(deadline),
        headers: { accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,application/json;q=0.8,*/*;q=0.1', 'user-agent': 'OddBrain source check' },
      })
    } catch (error) {
      const message = (error as Error).name === 'TimeoutError' ? `No answer within ${Math.round(deadline / 1000)} seconds.` : `The request failed: ${(error as Error).message}`
      return { url, checkedAt, state: 'unreachable', reason: message }
    }
    const finalUrl = response.url || url
    const problem = sourceUrlProblem(finalUrl)
    const refuse = async (reason: string, status?: number) => {
      await response.body?.cancel().catch(() => undefined)
      return { url, checkedAt, state: 'refused' as const, ...(status === undefined ? {} : { status }), ...(status === undefined ? {} : { finalUrl }), reason }
    }
    if (problem) return refuse(`The server redirected somewhere that is not checked: ${problem}`)
    if (!response.ok) return { url, checkedAt, state: 'unreachable' as const, status: response.status, finalUrl, reason: `The server answered ${response.status}.` }
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!TEXT_TYPES.test(mime)) return refuse(`The answer is ${mime || 'an undeclared type'}, not a readable text page. Nothing was read.`, response.status)
    const declared = Number(response.headers.get('content-length') || 0)
    if (Number.isFinite(declared) && declared > maxBytes) return refuse(`The page declares ${declared} bytes, above the ${maxBytes}-byte read limit.`, response.status)
    const chunks: Buffer[] = []
    let size = 0
    try {
      const reader = response.body?.getReader()
      if (!reader) throw Error('The response carried no body.')
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        size += next.value.byteLength
        if (size > maxBytes) { await reader.cancel().catch(() => undefined); throw Error(`The page grew past the ${maxBytes}-byte read limit.`) }
        chunks.push(Buffer.from(next.value))
      }
    } catch (error) {
      return refuse((error as Error).message, response.status)
    }
    const bytes = Buffer.concat(chunks)
    if (!bytes.length) return refuse('The page returned an empty body.', response.status)
    return {
      url, checkedAt, state: 'retrieved', status: response.status, finalUrl, mime, bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      title: mime === 'application/json' ? '' : pageTitle(bytes.toString('utf8')),
    }
  }

  return {
    /** Prepare the exact review. No request happens here. */
    preview(owner: number, input: { transcriptId: string; chatId: string; questionStart: string; urls: unknown }): SourceCheckPreview {
      const transcriptId = typeof input?.transcriptId === 'string' ? input.transcriptId : ''
      if (!TRANSCRIPT_ID.test(transcriptId)) throw Error('A saved transcript record is required before sources can be checked.')
      const chatId = typeof input?.chatId === 'string' ? input.chatId : ''
      if (chatId && !CHAT_ID.test(chatId)) throw Error('Invalid conversation identifier.')
      const questionStart = String(input?.questionStart ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
      for (const [key, ticket] of pending) if (ticket.expiresAt <= now()) pending.delete(key)
      if ([...pending.values()].filter(ticket => ticket.owner === owner).length >= 5) throw Error('Too many unreviewed source checks. Finish or close one first.')
      const { urls, refused } = planSourceUrls(input?.urls)
      if (!urls.length) throw Error(refused.length ? 'Every link was refused. Nothing will be requested.' : 'There are no links to check.')
      const token = randomUUID(), expiresAt = now() + 120_000
      pending.set(token, { owner, urls, refused, transcriptId, chatId, questionStart, expiresAt })
      return { token, urls, refused, expiresAt, explanation: DISCLOSURE }
    },
    async decide(owner: number, token: string, decision: 'allow' | 'deny') {
      const ticket = pending.get(token)
      if (!ticket) throw Error('That source check expired or was already used. Nothing was requested.')
      if (ticket.owner !== owner) throw Error('That source check belongs to another window. Nothing was requested.')
      pending.delete(token)
      if (ticket.expiresAt <= now()) throw Error('That source check expired. Nothing was requested.')
      if (decision === 'deny') return { denied: true as const, answer: 'Source check denied. No address was requested.' }
      if (decision !== 'allow') throw Error('Explicit approval is required before any address is requested.')
      const entries: SourceCheckEntry[] = []
      for (const url of ticket.urls) entries.push(await check(url))
      for (const refused of ticket.refused) entries.push({ url: refused.url, checkedAt: new Date(now()).toISOString(), state: 'refused', reason: refused.reason })
      const record: SourceCheckRecord = {
        id: `${Date.now()}-${randomUUID()}`,
        transcriptId: ticket.transcriptId,
        chatId: ticket.chatId,
        at: new Date(now()).toISOString(),
        questionStart: ticket.questionStart,
        entries,
      }
      const dir = folder(record.transcriptId)
      mkdirSync(options.root, { recursive: true, mode: 0o700 })
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      writeFileSync(join(dir, record.id + '.json'), JSON.stringify(record), { flag: 'wx', mode: 0o600 })
      return { denied: false as const, record }
    },
    /** Saved receipts for one record, newest first. A comparison to a file on disk is not a network request. */
    read(transcriptId: string): { records: SourceCheckRecord[]; notice: string } {
      const dir = folder(transcriptId)
      let files: string[]
      try { files = readdirSync(dir).filter(name => name.endsWith('.json') && RECEIPT_ID.test(name.slice(0, -5))).sort().reverse() }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { records: [], notice: '' }; throw error }
      const records: SourceCheckRecord[] = []
      let damaged = false
      for (const name of files.slice(0, 5)) {
        try {
          const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(join(dir, name))))
          if (!validSourceCheckRecord(value) || value.id !== name.slice(0, -5) || value.transcriptId !== transcriptId) throw Error()
          records.push(value)
        } catch { damaged = true }
      }
      return { records, notice: damaged ? 'Some source-check receipts could not be read. Their original files have not been changed.' : '' }
    },
    dismiss(owner: number, token: string) {
      const ticket = pending.get(token)
      if (ticket?.owner === owner) pending.delete(token)
    },
    limits: { deadline, maxBytes, links: MAX_SOURCE_LINKS },
  }
}
