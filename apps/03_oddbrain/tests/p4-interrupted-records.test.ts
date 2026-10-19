// NOT RUN; app recordings are not complete native history.
import { expect, test } from 'vitest'
import { mkdtempSync, appendFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createTurnArchive } from '../src/main/turnArchive'
import { transcriptMarkdown } from '../src/shared/lib/transcripts'
test('interrupted suffix remains in raw export while parsed transcript refuses success', () => {
  const root = mkdtempSync(join(tmpdir(), 'p4-record-'))
  try {
    const archive = createTurnArchive(root), id = archive.begin({ prompt: 'full prompt '.repeat(1000), engine: 'claude-code', model: '', workspace: '', pictures: 0 })
    archive.append(id, { kind: 'delta', text: 'partial response' })
    appendFileSync(join(root, id + '.ndjson'), '{"event":')
    expect(archive.read(id).state).toBe('interrupted'); expect(archive.raw(id).content.endsWith('{"event":')).toBe(true)
    expect(transcriptMarkdown(archive.read(id))).toContain('not a native-session import')
    expect(archive.read(id).prompt).toBe('full prompt '.repeat(1000))
  } finally { rmSync(root, { recursive: true, force: true }) }
})
