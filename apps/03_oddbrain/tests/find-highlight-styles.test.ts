import { describe, expect, it } from 'vitest'
import { FIND_HIGHLIGHT_STYLES } from '../src/renderer/src/lib/findHighlightStyles'

describe('Find Highlight API styles', () => {
  it('keeps both named ranges painted with the existing selection colors', () => {
    expect(FIND_HIGHLIGHT_STYLES).toContain('::highlight(ob-find)')
    expect(FIND_HIGHLIGHT_STYLES).toContain('background-color: rgba(224, 164, 74, 0.35)')
    expect(FIND_HIGHLIGHT_STYLES).toContain('::highlight(ob-find-current)')
    expect(FIND_HIGHLIGHT_STYLES).toContain('background-color: rgba(224, 164, 74, 0.75)')
    expect(FIND_HIGHLIGHT_STYLES).toContain('color: #141417')
  })
})
