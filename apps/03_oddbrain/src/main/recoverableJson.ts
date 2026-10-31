import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, existsSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { readRegularFileSync } from './safeFile'

const MAX_SMALL_STORE = 8_000_000

function atomic(file: string, data: string | Buffer): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${randomUUID()}.tmp`
  let descriptor: number | null = null
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    writeFileSync(descriptor, data); fsyncSync(descriptor); closeSync(descriptor); descriptor = null
    renameSync(temporary, file)
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

function boundedBytes(file: string): Buffer {
  return readRegularFileSync(file, MAX_SMALL_STORE).bytes
}

function bounded(file: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(boundedBytes(file))
}

function preserveDamaged(file: string, bytes: Buffer): void {
  const recovery = `${file}.damaged-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`
  if (!existsSync(recovery)) atomic(recovery, bytes)
}

/** Atomic replace plus one complete prior generation. No key is silently removed. */
export function writeRecoverableJson(file: string, value: unknown): void {
  const text = `${JSON.stringify(value, null, 2)}\n`
  if (Buffer.byteLength(text) > MAX_SMALL_STORE) throw Error('Store exceeds the 8 MB recovery limit. Nothing was shortened or replaced.')
  if (existsSync(file)) atomic(`${file}.previous`, bounded(file))
  atomic(file, text)
}

/** Recover only from an exact complete prior generation; preserve damaged bytes beside it. */
export function readRecoverableJson<T>(file: string, validate: (value: unknown) => T, fallback: T): { value: T; recovered: boolean } {
  if (!existsSync(file)) return { value: fallback, recovered: false }
  try { return { value: validate(JSON.parse(bounded(file))), recovered: false } }
  catch (failure) {
    const previous = `${file}.previous`
    if (!existsSync(previous)) throw failure
    // Refuse recovery of attacker-sized/non-regular current files. Their bytes
    // stay untouched; bounded ordinary damage is copied exactly before repair.
    const damaged = boundedBytes(file)
    const prior = bounded(previous), value = validate(JSON.parse(prior))
    preserveDamaged(file, damaged)
    atomic(file, prior)
    return { value, recovered: true }
  }
}
