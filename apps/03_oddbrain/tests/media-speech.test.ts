import { describe, expect, it } from 'vitest'
import { speechChunks, speakableText } from '../src/shared/lib/media'

describe('speakableText', () => {
  it('drops the syntax a voice should not pronounce', () => {
    const spoken = speakableText('## Done\n\nThat is **bold**, `inline code`, a [link](https://example.com) and ![a chart](x.png).')
    expect(spoken).toBe('Done That is bold, inline code, a link and a chart.')
    expect(spoken).not.toMatch(/[*`#[\]]/)
  })

  it('keeps code as words instead of silently skipping it', () => {
    const spoken = speakableText('Run this:\n\n```sh\nnpm test\n```\n\nThen check the exit code.')
    expect(spoken).toContain('npm test')
    expect(spoken).not.toContain('```')
  })

  it('turns a table into a sentence and not a run of pipes', () => {
    const spoken = speakableText('| File | State |\n| --- | --- |\n| a.ts | green |')
    expect(spoken).not.toContain('|')
    expect(spoken).not.toContain('---')
    expect(spoken).toContain('a.ts')
  })

  it('leaves ordinary prose exactly as written', () => {
    expect(speakableText('The build passed at 09:15, and nothing failed.')).toBe('The build passed at 09:15, and nothing failed.')
  })

  it('keeps decimals, versions and snake_case identifiers intact', () => {
    const spoken = speakableText('It allows 1.5 GB per file and runs RUNTIME_ZIP_LIMITS on v2.1.300 builds, _really_.')
    expect(spoken).toBe('It allows 1.5 GB per file and runs RUNTIME_ZIP_LIMITS on v2.1.300 builds, really.')
  })

  it('returns an empty string for an empty reply rather than a lone space', () => {
    expect(speakableText('\n\n')).toBe('')
  })
})

describe('speechChunks', () => {
  it('splits at sentence ends and adds no words', () => {
    const text = 'One thing happened. A second thing followed! Did a third? Yes.'
    const chunks = speechChunks(text, 40)
    expect(chunks.join(' ')).toBe(text)
    expect(chunks.every(chunk => chunk.length <= 40)).toBe(true)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('does not split a decimal into two spoken numbers', () => {
    expect(speechChunks('The file is 1.5 GB and the build is v2.1.300 today.', 180)).toEqual(['The file is 1.5 GB and the build is v2.1.300 today.'])
  })

  it('never returns an empty chunk', () => {
    expect(speechChunks('   ')).toEqual([])
    expect(speechChunks('One. Two. Three.', 60).every(chunk => chunk.length > 0)).toBe(true)
  })

  it('packs short sentences together instead of one utterance per full stop', () => {
    const chunks = speechChunks('Yes. No. Maybe. Fine.', 180)
    expect(chunks).toEqual(['Yes. No. Maybe. Fine.'])
  })

  it('breaks a long unpunctuated run without cutting a word in half', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ')
    const chunks = speechChunks(long, 60)
    expect(chunks.length).toBeGreaterThan(2)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(60)
      expect(chunk.startsWith('word')).toBe(true)
      expect(chunk.endsWith(' ') ? false : true).toBe(true)
    }
    expect(chunks.join(' ')).toBe(long)
  })

  it('hard-splits a single token longer than the limit rather than dropping it', () => {
    const url = 'https://example.com/' + 'a'.repeat(120)
    const chunks = speechChunks(url, 40)
    expect(chunks.join('')).toBe(url)
    expect(chunks.every(chunk => chunk.length <= 40)).toBe(true)
  })

  it('refuses a limit that would cut every sentence to nonsense', () => {
    expect(() => speechChunks('text', 10)).toThrow(/at least 40/)
  })
})
