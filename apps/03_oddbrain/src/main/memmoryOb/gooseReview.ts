import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isMap, parseDocument } from 'yaml'
import { configBytes, commitConfigs, preserveConfig } from '../engine/configTransaction'
import { unifiedDiff } from '../../shared/lib/changeReview'
import type { McpReview } from '../../shared/lib/mcpReview'

const sha = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
const decode = (bytes: Buffer | null): string => new TextDecoder('utf-8', { fatal: true }).decode(bytes || new Uint8Array())
const cleanPath = (value: string): string => value.replaceAll('\\', '/')

type Receipt = {
  format: 'oddbrain-goose-memmory-adapter-v1'
  configPath: string
  configBlockSha256: string
  adapterSha256: string
  adapterPath: string
  cataloguePath: string
  chatsPath: string
  vaultPath?: string
  installedAt: string
}

type Scope = {
  authority: string
  bundleSource: string
  bundleTarget: string
  receiptPath: string
  catalogueRoot: string
  chatsRoot: string
  vaultRoot: string
}

type Ticket = {
  expiresAt: number
  authority: string
  configPath: string
  configBefore: Buffer
  configAfter: string
  adapterBefore: Buffer | null
  adapterAfter: string
  receiptBefore: Buffer | null
  receiptAfter: string
  changed: boolean
}

const yamlString = (value: string): string => JSON.stringify(value)
const extensionBlock = (adapter: string, catalogue: string, chats: string, vault: string): string => [
  '  memmory_ob:',
  '    type: stdio',
  '    name: memmory_ob',
  '    display_name: Memmory_OB',
  '    enabled: true',
  '    cmd: node',
  '    args:',
  `      - ${yamlString(adapter)}`,
  '      - --catalogue',
  `      - ${yamlString(catalogue)}`,
  '      - --chats',
  `      - ${yamlString(chats)}`,
  '      - --vault',
  `      - ${yamlString(vault)}`,
  '    env_keys: []',
  '    envs: {}',
  '    timeout: 30',
  '    available_tools:',
  '      - memmory_ob_status',
  '      - memmory_ob_search',
  '      - memmory_ob_project',
].join('\n') + '\n'

const readReceipt = (bytes: Buffer | null): Receipt | null => {
  if (!bytes) return null
  const value = JSON.parse(decode(bytes)) as Receipt
  if (value?.format !== 'oddbrain-goose-memmory-adapter-v1' || typeof value.configPath !== 'string' || typeof value.configBlockSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.configBlockSha256) || typeof value.adapterSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.adapterSha256) || typeof value.adapterPath !== 'string' || typeof value.cataloguePath !== 'string' || typeof value.chatsPath !== 'string' || (value.vaultPath !== undefined && typeof value.vaultPath !== 'string') || typeof value.installedAt !== 'string') throw Error('The Goose adapter ownership receipt is damaged. Nothing was replaced.')
  return value
}

/** Patch only extensions.memmory_ob. All unrelated YAML bytes remain exact. */
function patchConfig(before: string, block: string, receipt: Receipt | null, configPath: string): { after: string; oldBlock: string } {
  const document = parseDocument(before, { keepSourceTokens: true, strict: true, uniqueKeys: true })
  if (document.errors.length) throw Error(`Goose config YAML needs repair before OddBrain can add the adapter: ${document.errors[0].message}`)
  if (document.contents !== null && !isMap(document.contents)) throw Error('Goose config must have a top-level YAML map. Nothing was changed.')
  const root = document.contents
  const extensionsPair = root?.items.find(pair => String((pair.key as { value?: unknown } | null)?.value ?? pair.key) === 'extensions')
  let existingPair: any = null, insertion = before.length
  if (extensionsPair) {
    if (!isMap(extensionsPair.value) || (extensionsPair.value as any).flow) throw Error('Goose extensions must use the documented block-map form before OddBrain can make a byte-preserving change.')
    existingPair = extensionsPair.value.items.find((pair: any) => String(pair?.key?.value ?? pair?.key) === 'memmory_ob') || null
    insertion = extensionsPair.value.range?.[2]
    if (!Number.isSafeInteger(insertion)) throw Error('Goose extensions have no safe insertion boundary. Nothing was changed.')
  }
  if (existingPair) {
    const keyStart = existingPair.key?.range?.[0], end = existingPair.value?.range?.[2]
    if (!Number.isSafeInteger(keyStart) || !Number.isSafeInteger(end)) throw Error('The existing Memmory_OB extension has no safe replacement boundary.')
    const start = before.lastIndexOf('\n', keyStart - 1) + 1
    const oldBlock = before.slice(start, end)
    if (!receipt || receipt.configPath !== configPath || receipt.configBlockSha256 !== sha(oldBlock)) throw Error('Goose already has an unowned or edited memmory_ob extension. OddBrain refused to replace it; review it in Goose first.')
    return { after: before.slice(0, start) + block + before.slice(end), oldBlock }
  }
  if (receipt) throw Error('The Goose adapter receipt expects an extension that is no longer present. Nothing was recreated automatically.')
  if (!extensionsPair) {
    const separator = before && !before.endsWith('\n') ? '\n' : ''
    return { after: `${before}${separator}extensions:\n${block}`, oldBlock: '' }
  }
  const separator = insertion > 0 && before[insertion - 1] !== '\n' ? '\n' : ''
  return { after: before.slice(0, insertion) + separator + block + before.slice(insertion), oldBlock: '' }
}

function verifyPatchedConfig(text: string): void {
  const document = parseDocument(text, { strict: true, uniqueKeys: true })
  if (document.errors.length) throw Error(`The prepared Goose config is not valid YAML: ${document.errors[0].message}`)
  const extension = document.getIn(['extensions', 'memmory_ob']) as any
  if (!extension || typeof extension.toJSON !== 'function') throw Error('The prepared Goose config did not retain the Memmory_OB extension.')
  const value = extension.toJSON()
  if (value?.type !== 'stdio' || value?.name !== 'memmory_ob' || value?.enabled !== true || value?.cmd !== 'node' || !Array.isArray(value.args) || value.args.length !== 7 || !Array.isArray(value.available_tools) || value.available_tools.join('|') !== 'memmory_ob_status|memmory_ob_search|memmory_ob_project') throw Error('The prepared Goose extension changed shape during YAML parsing.')
}

export function createGooseMemoryReview(scope: () => Scope, now = Date.now) {
  const tickets = new Map<string, Ticket>()
  return {
    preview(configPath: string): McpReview {
      for (const [token, ticket] of tickets) if (ticket.expiresAt <= now()) tickets.delete(token)
      if (tickets.size >= 5) throw Error('Too many pending Goose adapter reviews. Deny one or wait for expiry.')
      const current = scope(), configBefore = configBytes(configPath)
      if (!configBefore) throw Error('Choose Goose’s existing config.yaml. Start Goose once first if it has not created one.')
      const source = readFileSync(current.bundleSource)
      if (!source.length || source.length > 5_000_000) throw Error('The bundled Memmory_OB MCP adapter is missing or exceeds its 5 MB package limit. Run the complete OddBrain build first.')
      const adapterAfter = new TextDecoder('utf-8', { fatal: true }).decode(source), adapterHash = sha(source)
      const adapterBefore = configBytes(current.bundleTarget)
      if (adapterBefore && sha(adapterBefore) !== adapterHash) throw Error('The versioned Goose adapter path contains different bytes. Nothing was replaced; inspect that file manually.')
      const receiptBefore = configBytes(current.receiptPath), prior = readReceipt(receiptBefore)
      if (prior && (prior.adapterPath !== current.bundleTarget || prior.cataloguePath !== current.catalogueRoot || prior.chatsPath !== current.chatsRoot || (prior.vaultPath !== undefined && prior.vaultPath !== current.vaultRoot) || prior.adapterSha256 !== adapterHash)) throw Error('The Goose adapter paths or bundle changed since its ownership receipt. Install a reviewed new adapter version instead of silently replacing it.')
      const block = extensionBlock(cleanPath(current.bundleTarget), cleanPath(current.catalogueRoot), cleanPath(current.chatsRoot), cleanPath(current.vaultRoot))
      const patched = patchConfig(decode(configBefore), block, prior, configPath)
      verifyPatchedConfig(patched.after)
      const receipt: Receipt = {
        format: 'oddbrain-goose-memmory-adapter-v1', configPath, configBlockSha256: sha(block), adapterSha256: adapterHash,
        adapterPath: current.bundleTarget, cataloguePath: current.catalogueRoot, chatsPath: current.chatsRoot, vaultPath: current.vaultRoot, installedAt: new Date(now()).toISOString(),
      }
      const receiptAfter = `${JSON.stringify(receipt, null, 2)}\n`, changed = patched.after !== decode(configBefore) || !adapterBefore || !receiptBefore
      const token = randomUUID(), expiresAt = now() + 5 * 60_000
      tickets.set(token, { expiresAt, authority: current.authority, configPath, configBefore, configAfter: patched.after, adapterBefore, adapterAfter, receiptBefore, receiptAfter, changed })
      return {
        token, expiresAt,
        changes: [
          { path: `${configPath}#extensions.memmory_ob`, diff: unifiedDiff(patched.oldBlock, block, 'extensions.memmory_ob') },
          { path: current.bundleTarget, diff: adapterBefore ? `Bundled read-only adapter already matches.\nSHA-256 ${adapterHash}\n` : `Create bundled read-only adapter.\nBytes ${source.length.toLocaleString()}\nSHA-256 ${adapterHash}\n` },
          { path: current.receiptPath, diff: unifiedDiff(receiptBefore ? decode(receiptBefore) : '', receiptAfter, 'goose-adapter-receipt.json') },
        ],
        explanation: changed
          ? 'Adds one read-only stdio extension to the chosen Goose config without changing unrelated YAML bytes. It exposes status, bounded exact confirmed-memory/raw-chat search and Project counts; it has no write, confirmation, deletion, permission or Send tool. The adapter reads OddBrain’s existing stores directly and works at Goose’s extension layer, independent of the selected MCP-capable model provider.'
          : 'The reviewed Goose Memmory_OB adapter already matches this bundle, config block and receipt.',
      }
    },
    decide(token: string, decision: 'allow' | 'deny'): { ok: boolean; answer: string } {
      const ticket = tickets.get(token); tickets.delete(token)
      if (!ticket || ticket.expiresAt <= now()) return { ok: false, answer: 'That Goose adapter review expired. Nothing was changed.' }
      if (decision !== 'allow') return { ok: true, answer: 'Goose adapter changes denied. Nothing was changed.' }
      const current = scope()
      if (ticket.authority !== current.authority) return { ok: false, answer: 'OddBrain storage or adapter authority changed after review. Review again; nothing was changed.' }
      if (!ticket.changed) return { ok: true, answer: 'Goose already has the reviewed read-only Memmory_OB adapter.' }
      let backup = ''
      try {
        backup = preserveConfig(ticket.configPath, ticket.configBefore)
        commitConfigs([
          { path: current.bundleTarget, text: ticket.adapterAfter, expected: ticket.adapterBefore },
          { path: ticket.configPath, text: ticket.configAfter, expected: ticket.configBefore },
          { path: current.receiptPath, text: ticket.receiptAfter, expected: ticket.receiptBefore },
        ])
        return { ok: true, answer: `Installed the read-only Memmory_OB adapter and updated the chosen Goose config. Original Goose config preserved at ${backup}. Restart Goose or start a new session, then verify the three memmory_ob tools. Stock Goose Memory remains unchanged until measured parity.` }
      } catch (error) {
        return { ok: false, answer: `${(error as Error).message} ${backup ? `The original config backup remains at ${backup}.` : 'No completed adapter installation is reported.'}` }
      }
    },
    cancel(): void { tickets.clear() },
  }
}
