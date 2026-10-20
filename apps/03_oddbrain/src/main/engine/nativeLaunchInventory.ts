import { createHash } from 'node:crypto'
import { lstatSync, readdirSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import type { EngineId } from '../../shared/lib/engine'
import { scanTextHazards } from '../../shared/lib/textHazards'
import { configBytes, noLinkedPath } from './configTransaction'

export type NativeLaunchFile = {
  path: string
  scope: 'workspace' | 'user'
  kind: 'connector' | 'rules' | 'hooks' | 'settings' | 'task-config'
  bytes: number
  sha256: string
  textHazards: number
}
export type NativeLaunchInventory = {
  engine: EngineId
  workspace: string
  digest: string
  files: NativeLaunchFile[]
  missing: string[]
  warnings: string[]
  complete: boolean
  connectorFiles: number
  ruleFiles: number
  hookFiles: number
}

const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const kindOf = (path: string): NativeLaunchFile['kind'] => {
  const normalized = path.replaceAll('\\', '/')
  if (/(?:^|\/)(?:\.mcp\.json|mcp_config\.json|\.claude\.json)$/i.test(normalized)) return 'connector'
  if (/(?:^|\/)\.git\/(?:hooks\/|config$)|(?:^|\/)\.husky\//i.test(normalized)) return 'hooks'
  if (/(?:^|\/)(?:CLAUDE|AGENTS|GEMINI)\.md$|(?:^|\/)(?:\.claude|\.agents|\.gemini)\/rules\//i.test(normalized)) return 'rules'
  if (/(?:^|\/)\.vscode\/(?:tasks|launch)\.json$|(?:^|\/)package\.json$/i.test(normalized)) return 'task-config'
  return 'settings'
}
const relativeLabel = (path: string, root: string, scope: 'workspace' | 'user') => `${scope}:${relative(root, path).replaceAll('\\', '/') || basename(path)}`

/** Read-only, bounded, no-follow inventory of declarations a native engine or
 * nearby developer tooling may execute when a folder activates. It inventories
 * declarations, not runtime-loaded tools, shell startup, authentication or use. */
export function inspectNativeLaunch(engine: EngineId, workspace: string, home: string): NativeLaunchInventory {
  const root = resolve(workspace), user = resolve(home), files: NativeLaunchFile[] = [], missing: string[] = [], warnings: string[] = [], evidence: unknown[] = []
  let total = 0, visited = 0, walkedEntries = 0, complete = true, omittedWarnings = 0
  const MAX_FILES = 256, MAX_ENTRIES = 2_000, MAX_TOTAL = 8_000_000, MAX_DEPTH = 5, MAX_WARNINGS = 64
  const warn = (message: string) => {
    const bounded = message.length <= 1_800 ? message : `${message.slice(0, 1_800)}… [display shortened; exact file evidence remains bound to the inventory fingerprint]`
    if (warnings.length < MAX_WARNINGS) warnings.push(bounded); else omittedWarnings++
  }
  const read = (path: string, scope: 'workspace' | 'user', requiredLabel?: string) => {
    const label = relativeLabel(path, scope === 'workspace' ? root : user, scope)
    try {
      const bytes = configBytes(path)
      if (bytes === null) { if (requiredLabel) { missing.push(requiredLabel); evidence.push([label, 'missing']) }; return }
      if (++visited > MAX_FILES || total + bytes.length > MAX_TOTAL) { complete = false; warn('Native launch inventory reached its 256-file or 8 MB limit.'); evidence.push([label, 'limit']); return }
      total += bytes.length
      let hazards = 0
      try { hazards = scanTextHazards(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).total } catch { /* Binary hook/support files remain hashed exactly. */ }
      const item = { path, scope, kind: kindOf(path), bytes: bytes.length, sha256: sha(bytes), textHazards: hazards } as const
      files.push(item); evidence.push([label, item.kind, item.bytes, item.sha256, hazards])
    } catch (error) {
      complete = false
      const linked = /symlink/i.test((error as Error).message)
      warn(`${label}: ${linked ? 'linked path was not followed' : 'could not be read within the inventory limits'}.`)
      evidence.push([label, linked ? 'linked' : 'unreadable'])
    }
  }
  const walk = (directory: string, scope: 'workspace' | 'user', depth = 0) => {
    const label = relativeLabel(directory, scope === 'workspace' ? root : user, scope)
    try {
      noLinkedPath(directory)
      const stat = lstatSync(directory)
      if (!stat.isDirectory()) { complete = false; warn(`${label}: expected a directory; it was not scanned.`); evidence.push([label, 'not-directory']); return }
      if (depth > MAX_DEPTH) { complete = false; warn(`${label}: rule or hook directory exceeded the depth limit.`); evidence.push([label, 'depth-limit']); return }
      for (const name of readdirSync(directory).sort()) {
        walkedEntries++
        if (visited >= MAX_FILES || walkedEntries > MAX_ENTRIES || total >= MAX_TOTAL) { complete = false; warn('Native launch inventory reached its 256-file, 2,000-entry or 8 MB limit.'); return }
        const path = join(directory, name)
        let entry
        try { entry = lstatSync(path) } catch {
          const changed = relativeLabel(path, scope === 'workspace' ? root : user, scope)
          complete = false; warn(`${changed} changed during inventory.`); evidence.push([changed, 'changed']); continue
        }
        if (entry.isSymbolicLink()) { complete = false; warn(`${relativeLabel(path, scope === 'workspace' ? root : user, scope)}: link was not followed.`); evidence.push([relativeLabel(path, scope === 'workspace' ? root : user, scope), 'linked']); continue }
        if (entry.isDirectory()) walk(path, scope, depth + 1)
        else if (entry.isFile()) read(path, scope)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') { evidence.push([label, 'missing-directory']); return }
      complete = false; warn(`${label}: directory could not be inventoried without following links.`); evidence.push([label, 'unreadable-directory'])
    }
  }

  const commonWorkspace = [
    '.mcp.json', '.agents/mcp_config.json', '.claude/settings.json', '.claude/settings.local.json', '.gemini/settings.json',
    'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.vscode/tasks.json', '.vscode/launch.json', 'package.json', '.git/config',
  ]
  for (const name of commonWorkspace) read(join(root, name), 'workspace', name)
  for (const name of ['.claude/rules', '.agents/rules', '.gemini/rules', '.git/hooks', '.husky']) walk(join(root, name), 'workspace')
  const userFiles = engine === 'claude-code'
    ? ['.claude.json', '.claude/settings.json', '.claude/settings.local.json', '.claude/CLAUDE.md']
    : ['.gemini/config/mcp_config.json', '.gemini/settings.json', '.gemini/GEMINI.md']
  for (const name of userFiles) read(join(user, name), 'user', name)
  walk(join(user, engine === 'claude-code' ? '.claude/rules' : '.gemini/rules'), 'user')
  if (files.some(file => file.textHazards)) warn('One or more inventoried text files contain invisible or direction-changing characters. Exact bytes were not changed.')
  if (omittedWarnings) warnings.push(`${omittedWarnings.toLocaleString()} additional inventory warning(s) were omitted from display; their observations remain bound to the fingerprint.`)
  const digest = sha(JSON.stringify([engine, root, evidence, complete]))
  return {
    engine, workspace: root, digest, files, missing, warnings: [...new Set(warnings)], complete,
    connectorFiles: files.filter(file => file.kind === 'connector').length,
    ruleFiles: files.filter(file => file.kind === 'rules').length,
    hookFiles: files.filter(file => file.kind === 'hooks').length,
  }
}

export function nativeLaunchSummary(value: NativeLaunchInventory): string {
  const sensitive = value.files
  const lines = [
    `Folder: ${value.workspace}`,
    `Observed and fingerprinted ${value.files.length} configuration file(s), including ${value.connectorFiles} connector, ${value.ruleFiles} rule/instruction and ${value.hookFiles} Git hook/config file(s).`,
    `Inventory fingerprint: ${value.digest}`,
    ...sensitive.slice(0, 18).map(file => `${file.kind}: ${file.path}${file.textHazards ? ` · ${file.textHazards} invisible-text warning(s)` : ''}`),
    ...(sensitive.length > 18 ? [`${sensitive.length - 18} additional execution-relevant file(s) are included in the fingerprint.`] : []),
    ...value.warnings.slice(0, 18),
    ...(value.warnings.length > 18 ? [`${value.warnings.length - 18} additional warning(s) are retained in the receipt but omitted from this dialog.`] : []),
    'This is a bounded declaration inventory, not proof of what the native engine will load, authenticate, contact or execute.',
  ]
  return lines.join('\n')
}
