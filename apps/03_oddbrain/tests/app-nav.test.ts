import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AppNav from '../src/renderer/src/components/AppNav'

describe('desktop navigation presentation', () => {
  it('shows a truthful pending-approval count on Chat when one exists', () => {
    const html = renderToStaticMarkup(
      createElement(AppNav, { view: 'chat', onView: () => undefined, waiting: 2 }),
    )

    expect(html).toContain('aria-label="2 approvals waiting"')
    expect(html).toContain('>2</span>')
  })

  it('does not render a count when no approvals are waiting', () => {
    const html = renderToStaticMarkup(
      createElement(AppNav, { view: 'chat', onView: () => undefined, waiting: 0 }),
    )

    expect(html).not.toContain('approvals waiting')
  })

  it('supports the reference horizontal tab treatment', () => {
    const html = renderToStaticMarkup(
      createElement(AppNav, { view: 'projects', onView: () => undefined, horizontal: true }),
    )

    expect(html).toContain('class="ob-horizontal-nav"')
    expect(html).toContain('class="ob-nav-tab is-current"')
  })
})
