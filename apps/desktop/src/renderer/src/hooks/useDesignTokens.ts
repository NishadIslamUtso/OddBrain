import { useState } from 'react'
import { DEFAULT_DESIGN_SYSTEM, loadDesignTokens } from '@shared/lib/design-systems'

/**
 * The CSS custom properties for one design system, loaded on demand.
 *
 * Each token set is its own module, so only the chosen one is fetched — that is
 * why this is async at all. Failing to load them is not an error worth showing:
 * the artifact still renders, it just renders without the styling pass.
 */
export function useDesignTokens(id: string = DEFAULT_DESIGN_SYSTEM): string {
  // The sixteen sets ship in the bundle, so the load is a lookup now — the
  // hook keeps its shape so its callers do not change.
  const [tokens] = useState(() => loadDesignTokens(id) || '')
  return tokens
}
