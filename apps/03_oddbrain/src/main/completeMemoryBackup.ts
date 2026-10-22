/**
 * One coordinator for the two authoritative owner-data backup domains.
 * Creation runs synchronously on the Electron main thread, so app writes cannot
 * interleave between the Memmory_OB revision checks. Restore verifies both
 * nested manifests before creating a new, inactive profile folder.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { backupVault, restoreVault, verifyVaultBackup } from './vault/backup'
import { createAppDataBackup, restoreAppDataBackup, verifyAppDataBackup } from './appDataBackup'
import { hashRegularFileSync, readRegularFileSync } from './safeFile'

const MANIFEST = 'oddbrain-complete-memory-backup.json'
const VAULT_MANIFEST = 'oddbrain-backup.json'
const APP_DATA_MANIFEST = 'oddbrain-app-data-backup.json'
const LIMIT = 1_000_000

type Domain = {
  folder: 'vault' | 'app-data'
  manifest: string
  manifestBytes: number
  manifestSha256: string
  files: number
  bytes: number
}

export type CompleteMemoryManifest = {
  format: 'oddbrain-complete-memory-backup-v1'
  createdAt: string
  memmoryOb: { schema: 1; revision: number; package?: '@oddbrain/memmory-ob'; packageVersion?: '1.0.0' }
  domains: { vault: Domain; appData: Domain }
  externalFiles: {
    handling: 'excluded-unless-private-copy'
    included: string[]
    excluded: string[]
    restore: string
  }
  activation: 'review-required'
}

export type CompleteMemoryResult = {
  destination: string
  vaultFiles: number
  appDataFiles: number
  bytes: number
  revision: number
}

const durableExclusive = (path: string, value: unknown): void => {
  const descriptor = openSync(path, 'wx', 0o600)
  try { writeFileSync(descriptor, JSON.stringify(value, null, 2)); fsyncSync(descriptor) } finally { closeSync(descriptor) }
}

const inside = (root: string, candidate: string): boolean => {
  const rel = relative(resolve(root), resolve(candidate))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`))
}

const validDomain = (value: unknown, folder: Domain['folder'], manifest: string): value is Domain => {
  const domain = value as Domain
  return domain?.folder === folder && domain.manifest === manifest && Number.isSafeInteger(domain.manifestBytes) && domain.manifestBytes > 0 && typeof domain.manifestSha256 === 'string' && /^[a-f0-9]{64}$/.test(domain.manifestSha256) && Number.isSafeInteger(domain.files) && domain.files >= 0 && Number.isSafeInteger(domain.bytes) && domain.bytes >= 0
}

const readManifest = (source: string): { manifest: CompleteMemoryManifest; manifestHash: { bytes: number; sha256: string } } => {
  const top = readdirSync(source).sort()
  if (top.length !== 3 || top[0] !== 'app-data' || top[1] !== MANIFEST || top[2] !== 'vault') throw Error('The Complete Memory Backup root contains files not listed by its format.')
  const path = join(source, MANIFEST)
  const opened = readRegularFileSync(path, LIMIT)
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes)) as CompleteMemoryManifest
  if (manifest?.format !== 'oddbrain-complete-memory-backup-v1' || typeof manifest.createdAt !== 'string' || Number.isNaN(Date.parse(manifest.createdAt)) || manifest.memmoryOb?.schema !== 1 || (manifest.memmoryOb.package !== undefined && manifest.memmoryOb.package !== '@oddbrain/memmory-ob') || (manifest.memmoryOb.packageVersion !== undefined && manifest.memmoryOb.packageVersion !== '1.0.0') || (manifest.memmoryOb.package === undefined) !== (manifest.memmoryOb.packageVersion === undefined) || !Number.isSafeInteger(manifest.memmoryOb.revision) || manifest.memmoryOb.revision < 0 || !validDomain(manifest.domains?.vault, 'vault', VAULT_MANIFEST) || !validDomain(manifest.domains?.appData, 'app-data', APP_DATA_MANIFEST) || manifest.activation !== 'review-required' || manifest.externalFiles?.handling !== 'excluded-unless-private-copy' || !Array.isArray(manifest.externalFiles.included) || manifest.externalFiles.included.some(value => typeof value !== 'string' || value.length > 2_000) || !Array.isArray(manifest.externalFiles.excluded) || manifest.externalFiles.excluded.some(value => typeof value !== 'string' || value.length > 2_000) || typeof manifest.externalFiles.restore !== 'string' || manifest.externalFiles.restore.length > 4_000) throw Error('This is not a supported Complete Memory Backup.')
  const vaultManifest = join(source, manifest.domains.vault.folder, manifest.domains.vault.manifest)
  const appManifest = join(source, manifest.domains.appData.folder, manifest.domains.appData.manifest)
  hashRegularFileSync(vaultManifest, { bytes: manifest.domains.vault.manifestBytes, sha256: manifest.domains.vault.manifestSha256 })
  hashRegularFileSync(appManifest, { bytes: manifest.domains.appData.manifestBytes, sha256: manifest.domains.appData.manifestSha256 })
  return { manifest, manifestHash: hashRegularFileSync(path, { bytes: opened.bytes.length }) }
}

/** Fully verify every nested manifest and payload before a restore folder exists. */
export function verifyCompleteMemoryBackup(source: string): { manifest: CompleteMemoryManifest; manifestHash: { bytes: number; sha256: string } } {
  const read = readManifest(source)
  const vault = verifyVaultBackup(join(source, read.manifest.domains.vault.folder))
  if (!vault.ok) throw Error(`Vault domain failed verification: ${vault.answer}`)
  const appData = verifyAppDataBackup(join(source, read.manifest.domains.appData.folder))
  if (vault.count !== read.manifest.domains.vault.files || vault.bytes !== read.manifest.domains.vault.bytes || appData.files !== read.manifest.domains.appData.files || appData.bytes !== read.manifest.domains.appData.bytes) throw Error('A backup domain no longer matches the Complete Memory manifest.')
  return read
}

export function createCompleteMemoryBackup(input: {
  vaultRoot: string
  appDataRoot: string
  destination: string
  rendererPreferences: Record<string, string>
  revisionBefore: number
  revisionAfter: () => number
}): CompleteMemoryResult {
  if (inside(input.vaultRoot, input.destination) || inside(input.appDataRoot, input.destination)) throw Error('Choose a Complete Memory Backup destination outside the live vault and app-data folders.')
  if (existsSync(input.destination)) throw Error('Complete backup destination already exists. Nothing was replaced.')
  mkdirSync(input.destination, { recursive: false, mode: 0o700 })
  try {
    const vault = backupVault(input.vaultRoot, join(input.destination, 'vault'))
    if (!vault.ok) throw Error(`Vault backup failed: ${vault.answer}`)
    const appData = createAppDataBackup(input.appDataRoot, join(input.destination, 'app-data'), input.rendererPreferences)
    const finalRevision = input.revisionAfter()
    if (finalRevision !== input.revisionBefore) throw Error('Memmory_OB changed during backup. Nothing is reported complete; pause changes and retry.')
    const vaultManifest = hashRegularFileSync(join(input.destination, 'vault', VAULT_MANIFEST))
    const appManifest = hashRegularFileSync(join(input.destination, 'app-data', APP_DATA_MANIFEST))
    const manifest: CompleteMemoryManifest = {
      format: 'oddbrain-complete-memory-backup-v1',
      createdAt: new Date().toISOString(),
      memmoryOb: { schema: 1, revision: finalRevision, package: '@oddbrain/memmory-ob', packageVersion: '1.0.0' },
      domains: {
        vault: { folder: 'vault', manifest: VAULT_MANIFEST, manifestBytes: vaultManifest.bytes, manifestSha256: vaultManifest.sha256, files: vault.count, bytes: vault.bytes },
        appData: { folder: 'app-data', manifest: APP_DATA_MANIFEST, manifestBytes: appManifest.bytes, manifestSha256: appManifest.sha256, files: appData.files, bytes: appData.bytes },
      },
      externalFiles: {
        handling: 'excluded-unless-private-copy',
        included: ['Attachment Center private copies and retained native-turn originals selected by the app-data manifest'],
        excluded: ['Use-in-place files, unselected external files, installed engines/models, credentials, access grants and pairing secrets'],
        restore: 'Reconnect or re-authorize excluded external files after reviewing the restored inactive profile; no permission is silently recreated.',
      },
      activation: 'review-required',
    }
    durableExclusive(join(input.destination, MANIFEST), manifest)
    verifyCompleteMemoryBackup(input.destination)
    return { destination: input.destination, vaultFiles: vault.count, appDataFiles: appData.files, bytes: vault.bytes + appData.bytes, revision: finalRevision }
  } catch (error) {
    try { rmSync(input.destination, { recursive: true, force: true }) } catch { throw Error('Complete backup failed and its incomplete folder could not be removed. Do not use that folder as a backup.') }
    throw error
  }
}

export function restoreCompleteMemoryBackup(source: string, destination: string): CompleteMemoryResult {
  if (inside(source, destination)) throw Error('Choose a restore destination outside the Complete Memory Backup folder.')
  // This reads and hashes every listed payload before destination is created.
  const verified = verifyCompleteMemoryBackup(source)
  if (existsSync(destination)) throw Error('Restore destination already exists. Nothing was replaced.')
  mkdirSync(destination, { recursive: false, mode: 0o700 })
  try {
    const vault = restoreVault(join(source, 'vault'), join(destination, 'vault'))
    if (!vault.ok) throw Error(`Vault restore failed: ${vault.answer}`)
    const appData = restoreAppDataBackup(join(source, 'app-data'), join(destination, 'app-data-profile'))
    durableExclusive(join(destination, 'ACTIVATION-REVIEW.json'), {
      format: 'oddbrain-complete-memory-restored-v1',
      createdAt: new Date().toISOString(),
      sourceManifest: { file: MANIFEST, bytes: verified.manifestHash.bytes, sha256: verified.manifestHash.sha256 },
      memmoryObRevision: verified.manifest.memmoryOb.revision,
      memmoryObPackage: verified.manifest.memmoryOb.package ? `${verified.manifest.memmoryOb.package}@${verified.manifest.memmoryOb.packageVersion}` : 'legacy embedded schema 1',
      liveProfileChanged: false,
      activation: 'review-required',
      vault: 'vault',
      appDataProfile: 'app-data-profile',
      note: 'This verified restored copy is inactive. Review it before choosing either restored folder in OddBrain; activation is a separate owner decision.',
    })
    return { destination, vaultFiles: vault.count, appDataFiles: appData.files, bytes: vault.bytes + appData.bytes, revision: verified.manifest.memmoryOb.revision }
  } catch (error) {
    try { rmSync(destination, { recursive: true, force: true }) } catch { throw Error('Restore failed and its incomplete new profile could not be removed. Live OddBrain data is unchanged.') }
    throw error
  }
}
