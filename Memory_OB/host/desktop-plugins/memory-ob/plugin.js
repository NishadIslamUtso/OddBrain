// Memory_OB — thin Hermes Desktop shell.
//
// Mounts the Memory_OB screens in a dockable pane. The markup is fetched
// through this plugin's own authenticated bridge (`ctx.rest`) and mounted with
// `srcDoc`, because an iframe cannot carry the dashboard session token and so
// may not load the backend's `/ui` page directly.
//
// The host's theme values, read here and handed over as query parameters;
// the backend inlines them, since a srcdoc document has no query string
// of its own.
//
// The host calls its surfaces --ui-bg-* (chrome / sidebar / primary …), not
// --ui-background, so each entry maps a host variable to the name the UI's
// stylesheet expects. Reading a name the host does not define yields an
// empty string, which is skipped — the UI keeps its own fallback.
//
// Rules this file obeys:
//   - imports limited to @hermes/plugin-sdk and react*
//   - jsx() calls, not JSX — loaded uncompiled
//   - theme variables only; the app's background is never touched

import { jsx } from 'react/jsx-runtime'
import { useEffect, useState } from 'react'

const UI_HTML = '/ui-html'

/** Host variable -> the name the UI stylesheet reads. */
const THEME_VARS = [
  ['--ui-bg-chrome', 'background'],
  ['--ui-bg-sidebar', 'background-sidebar'],
  ['--ui-bg-secondary', 'background-secondary'],
  ['--ui-bg-elevated', 'background-elevated'],
  ['--ui-stroke-secondary', 'stroke-secondary'],
  ['--ui-stroke-tertiary', 'stroke-tertiary'],
  ['--ui-text-primary', 'text-primary'],
  ['--ui-text-secondary', 'text-secondary'],
  ['--ui-text-tertiary', 'text-tertiary'],
  ['--ui-text-quaternary', 'text-quaternary'],
  ['--ui-accent', 'accent'],
]

/** The host's theme as query parameters (empty when the app has none set). */
function themeQuery() {
  try {
    const cs = getComputedStyle(document.documentElement)
    const parts = []
    for (const [hostName, uiName] of THEME_VARS) {
      const value = cs.getPropertyValue(hostName).trim()
      if (value) parts.push(uiName + '=' + encodeURIComponent(value))
    }
    return parts.length ? '?' + parts.join('&') : ''
  } catch {
    return ''
  }
}

const FRAME_STYLE = {
  width: '100%',
  height: '100%',
  border: 'none',
  background: 'transparent',
  display: 'block',
}

function MemoryOBPage({ ctx }) {
  const [html, setHtml] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    ctx
      .rest(UI_HTML + themeQuery())
      .then((res) => {
        if (alive && res && typeof res.html === 'string') setHtml(res.html)
        else if (alive) setFailed(true)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  if (failed) {
    return jsx('div', {
      style: { padding: '16px', fontSize: '12px', color: 'var(--ui-text-secondary)' },
      children: 'Memory_OB is unavailable. Check that the Memory_OB engine is running.',
    })
  }

  if (!html) {
    return jsx('div', {
      style: { padding: '16px', fontSize: '12px', color: 'var(--ui-text-tertiary)' },
      children: 'Loading Memory_OB…',
    })
  }

  return jsx('iframe', { srcDoc: html, title: 'Memory_OB', style: FRAME_STYLE })
}

export default {
  id: 'memory_ob',
  name: 'Memory_OB',
  register(ctx) {
    ctx.register({
      id: 'page',
      area: 'routes',
      data: { path: '/memory-ob' },
      render: () => jsx(MemoryOBPage, { ctx }),
    })

    ctx.register({
      id: 'nav',
      area: 'sidebar.nav',
      data: { path: '/memory-ob', label: 'Memory_OB', codicon: 'project' },
    })
  },
}
