import type { ReactNode } from 'react'
/** Shared border, surface and scale for the real composer and its miniature.
 * All native event/model/attachment logic stays in Composer.tsx. */
export default function ComposerSurface({ children }: { children: ReactNode }) {
  return <div className="ob-composer-surface">{children}</div>
}
