import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isMap, parseDocument } from 'yaml'
import { configBytes, commitConfigs, preserveConfig } from '../engine/configTransaction'
import { unifiedDiff } from '../../shared/lib/changeReview'
import type { McpReview } from '../../shared/lib/mcpReview'

const sha = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
const decode = (bytes: Buffer | null): string => new TextDecoder('utf-8', { fatal: true }).decode(bytes || new Uint8Array())
const cleanPath = (value: string): string => value.replaceAll('\\', '/')

type Receipt = {
  format: 'oddbrain-goose-memory-adapter-v1'
  configPath: string
  configBlockSha256: string
  adapterSha256: string
  adapterPath: string
  skillSha256?: string
  skillPath?: string
  cataloguePath: string
  chatsPath: string
  vaultPath?: string
  installedAt: string
}

type Scope = {
  authority: string
  bundleSource: string
  bundleTarget: string
  skillSource: string
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
  skillTarget: string
  skillBefore: Buffer | null
  skillAfter: string
  receiptBefore: Buffer | null
  receiptAfter: string
  changed: boolean
}

const yamlString = (value: string): string => JSON.stringify(value)
const extensionBlock = (adapter: string, catalogue: string, chats: string, vault: string): string => [
  '  memory_ob:',
  '    type: stdio',
  '    name: memory_ob',
  '    display_name: Memory_OB',
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
  '      - memory_ob_status',
  '      - memory_ob_search',
  '      - memory_ob_project',
  '      - memory_ob_evidence',
  '      - memory_ob_propose',
].join('\n') + '\n'

const readReceipt = (bytes: Buffer | null): Receipt | null => {
  if (!bytes) return null
  const value = JSON.parse(decode(bytes)) as Receipt
  if (value?.format !== 'oddbrain-goose-memory-adapter-v1' || typeof value.configPath !== 'string' || typeof value.configBlockSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.configBlockSha256) || typeof value.adapterSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.adapterSha256) || typeof value.adapterPath !== 'string' || (value.skillPath !== undefined && typeof value.skillPath !== 'string') || (value.skillSha256 !== undefined && !/^[a-f0-9]{64}$/.test(value.skillSha256)) || typeof value.cataloguePath !== 'string' || typeof value.chatsPath !== 'string' || (value.vaultPath !== undefined && typeof value.vaultPath !== 'string') || typeof value.installedAt !== 'string') throw Error('The Goose adapter ownership receipt is damaged. Nothing was replaced.')
  return value
}

/** Patch only extensions.memory_ob. All unrelated YAML bytes remain exact. */
function patchConfig(before: string, block: string, receipt: Receipt | null, configPath: string): { after: string; oldBlock: string } {
  const document = parseDocument(before, { keepSourceTokens: true, strict: true, uniqueKeys: true })
  if (document.errors.length) throw Error(`Goose config YAML needs repair before OddBrain can add the adapter: ${document.errors[0].message}`)
  if (document.contents !== null && !isMap(document.contents)) throw Error('Goose config must have a top-level YAML map. Nothing was changed.')
  const root = document.contents
  const extensionsPair = root?.items.find(pair => String((pair.key as { value?: unknown } | null)?.value ?? pair.key) === 'extensions')
  let existingPair: any = null, insertion = before.length
  if (extensionsPair) {
    if (!isMap(extensionsPair.value) || (extensionsPair.value as any).flow) throw Error('Goose extensions must use the documented block-map form before OddBrain can make a byte-preserving change.')
    existingPair = extensionsPair.value.items.find((pair: any) => String(pair?.key?.value ?? pair?.key) === 'memory_ob') || null
    insertion = extensionsPair.value.range?.[2]
    if (!Number.isSafeInteger(insertion)) throw Error('Goose extensions have no safe insertion boundary. Nothing was changed.')
  }
  if (existingPair) {
    const keyStart = existingPair.key?.range?.[0], end = existingPair.value?.range?.[2]
    if (!Number.isSafeInteger(keyStart) || !Number.isSafeInteger(end)) throw Error('The existing Memory_OB extension has no safe replacement boundary.')
    const start = before.lastIndexOf('\n', keyStart - 1) + 1
    const oldBlock = before.slice(start, end)
    if (!receipt || receipt.configPath !== configPath || receipt.configBlockSha256 !== sha(oldBlock)) throw Error('Goose already has an unowned or edited memory_ob extension. OddBrain refused to replace it; review it in Goose first.')
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
  const extension = document.getIn(['extensions', 'memory_ob']) as any
  if (!extension || typeof extension.toJSON !== 'function') throw Error('The prepared Goose config did not retain the Memory_OB extension.')
  const value = extension.toJSON()
  if (value?.type !== 'stdio' || value?.name !== 'memory_ob' || value?.enabled !== true || value?.cmd !== 'node' || !Array.isArray(value.args) || value.args.length !== 7 || !Array.isArray(value.available_tools) || value.available_tools.join('|') !== 'memory_ob_status|memory_ob_search|memory_ob_project|memory_ob_evidence|memory_ob_propose') throw Error('The prepared Goose extension changed shape during YAML parsing.')
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
      if (!source.length || source.length > 5_000_000) throw Error('The bundled Memory_OB MCP adapter is missing or exceeds its 5 MB package limit. Run the complete OddBrain build first.')
      const adapterAfter = new TextDecoder('utf-8', { fatal: true }).decode(source), adapterHash = sha(source)
      const skillSource = readFileSync(current.skillSource)
      if (!skillSource.length || skillSource.length > 512_000) throw Error('The bundled Memory_OB Goose skill is missing or exceeds its 512 KB limit. Run the complete OddBrain build first.')
      const skillAfter = new TextDecoder('utf-8', { fatal: true }).decode(skillSource), skillHash = sha(skillSource)
      const skillTarget = join(dirname(configPath), 'skills', 'memory-ob-memory', 'SKILL.md')
      const adapterBefore = configBytes(current.bundleTarget), skillBefore = configBytes(skillTarget)
      const receiptBefore = configBytes(current.receiptPath), prior = readReceipt(receiptBefore)
      if (prior && (prior.adapterPath !== current.bundleTarget || prior.cataloguePath !== current.catalogueRoot || prior.chatsPath !== current.chatsRoot || (prior.vaultPath !== undefined && prior.vaultPath !== current.vaultRoot) || (prior.skillPath !== undefined && prior.skillPath !== skillTarget))) throw Error('The Goose adapter paths changed since its ownership receipt. Nothing was silently replaced; review the receipt and storage layout manually.')
      // A file at an owned target may be absent (create), equal to the new
      // bundle (unchanged), or match the prior receipt hash (reviewed upgrade).
      // Anything else is unowned and is never overwritten.
      const verifyOwned = (before: Buffer | null, priorHash: string | undefined, newHash: string, label: string): void => {
        if (!before || sha(before) === newHash) return
        if (priorHash && sha(before) === priorHash) return
        throw Error(`The ${label} path holds a file this receipt does not own. Nothing was replaced; inspect that file manually.`)
      }
      verifyOwned(adapterBefore, prior?.adapterSha256, adapterHash, 'versioned Goose adapter')
      verifyOwned(skillBefore, prior?.skillSha256, skillHash, 'Memory_OB Goose skill')
      const block = extensionBlock(cleanPath(current.bundleTarget), cleanPath(current.catalogueRoot), cleanPath(current.chatsRoot), cleanPath(current.vaultRoot))
      const patched = patchConfig(decode(configBefore), block, prior, configPath)
      verifyPatchedConfig(patched.after)
      const receipt: Receipt = {
        format: 'oddbrain-goose-memory-adapter-v1', configPath, configBlockSha256: sha(block), adapterSha256: adapterHash,
        adapterPath: current.bundleTarget, skillPath: skillTarget, skillSha256: skillHash,
        cataloguePath: current.catalogueRoot, chatsPath: current.chatsRoot, vaultPath: current.vaultRoot, installedAt: new Date(now()).toISOString(),
      }
      const receiptAfter = `${JSON.stringify(receipt, null, 2)}\n`
      const fileLine = (before: Buffer | null, afterHash: string, bytes: number): string => before && sha(before) === afterHash
        ? `Already matches.\nSHA-256 ${afterHash}\n`
        : before
          ? `Replace owned file.\nOld SHA-256 ${sha(before)}\nNew SHA-256 ${afterHash}\n`
          : `Create file.\nBytes ${bytes.toLocaleString()}\nSHA-256 ${afterHash}\n`
      const changed = patched.after !== decode(configBefore) || !adapterBefore || sha(adapterBefore) !== adapterHash || !skillBefore || sha(skillBefore) !== skillHash || !receiptBefore
      const token = randomUUID(), expiresAt = now() + 5 * 60_000
      tickets.set(token, { expiresAt, authority: current.authority, configPath, configBefore, configAfter: patched.after, adapterBefore, adapterAfter, skillTarget, skillBefore, skillAfter, receiptBefore, receiptAfter, changed })
      return {
        token, expiresAt,
        changes: [
          { path: `${configPath}#extensions.memory_ob`, diff: unifiedDiff(patched.oldBlock, block, 'extensions.memory_ob') },
          { path: current.bundleTarget, diff: `Bundled read-only adapter (${(adapterBefore && sha(adapterBefore) === adapterHash) ? 'unchanged' : 'update'}). ${fileLine(adapterBefore, adapterHash, source.length)}` },
          { path: skillTarget, diff: (skillBefore && sha(skillBefore) === skillHash) ? `Memory_OB Goose skill already matches.\nSHA-256 ${skillHash}\n` : unifiedDiff(skillBefore ? decode(skillBefore) : '', skillAfter, 'memory-ob-memory/SKILL.md') },
          { path: current.receiptPath, diff: unifiedDiff(receiptBefore ? decode(receiptBefore) : '', receiptAfter, 'goose-adapter-receipt.json') },
        ],
        explanation: changed
          ? 'Adds one read-only stdio extension to the chosen Goose config without changing unrelated YAML bytes, and installs the memory-ob-memory skill beside it in Goose’s skills folder. The extension exposes status, bounded exact search, Project counts and SHA-256 evidence verification; it has no write, confirmation, deletion, permission or Send tool. The skill binds the answering model to OddBrain’s authority order and evidence rules. Both install in one reviewed allow. The adapter reads OddBrain’s existing stores directly and works at Goose’s extension layer, independent of the selected MCP-capable model provider.'
          : 'The reviewed Goose Memory_OB adapter, skill and receipt already match this bundle.',
      }
    },
    decide(token: string, decision: 'allow' | 'deny'): { ok: boolean; answer: string } {
      const ticket = tickets.get(token); tickets.delete(token)
      if (!ticket || ticket.expiresAt <= now()) return { ok: false, answer: 'That Goose adapter review expired. Nothing was changed.' }
      if (decision !== 'allow') return { ok: true, answer: 'Goose adapter changes denied. Nothing was changed.' }
      const current = scope()
      if (ticket.authority !== current.authority) return { ok: false, answer: 'OddBrain storage or adapter authority changed after review. Review again; nothing was changed.' }
      if (!ticket.changed) return { ok: true, answer: 'Goose already has the reviewed read-only Memory_OB adapter.' }
      const currentConfig = configBytes(ticket.configPath)
      if (!currentConfig || !currentConfig.equals(ticket.configBefore)) return { ok: false, answer: 'The chosen Goose config changed since this preview. Review again; nothing was changed.' }
      let backup = ''
      try {
        backup = preserveConfig(ticket.configPath, ticket.configBefore)
        commitConfigs([
          { path: current.bundleTarget, text: ticket.adapterAfter, expected: ticket.adapterBefore },
          { path: ticket.skillTarget, text: ticket.skillAfter, expected: ticket.skillBefore },
          { path: ticket.configPath, text: ticket.configAfter, expected: ticket.configBefore },
          { path: current.receiptPath, text: ticket.receiptAfter, expected: ticket.receiptBefore },
        ])
        return { ok: true, answer: `Installed the read-only Memory_OB adapter, its memory-ob-memory skill and the updated Goose config in one transaction. Original Goose config preserved at ${backup}. Restart Goose or start a new session, then verify the four memory_ob tools and that the model follows the memory skill’s evidence rules. Stock Goose Memory remains unchanged until measured parity.` }
      } catch (error) {
        return { ok: false, answer: `${(error as Error).message} ${backup ? `The original config backup remains at ${backup}.` : 'No completed adapter installation is reported.'}` }
      }
    },
    cancel(): void { tickets.clear() },
  }
}
