import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Every prop a component destructures must actually be passed where it is
 * rendered.
 *
 * This matters more than it sounds. A missing prop is invisible: Vite builds
 * it without complaint, and a stubbed unit test that renders the component
 * with hand-written props will pass happily. The failure only appears in the
 * browser, as `undefined is not a function` on the one click nobody tried.
 *
 * It has already bitten this codebase — an `inference={inference}` meant for
 * ArtifactPanel landed on SubAgentPanel instead, because a text replacement
 * matched the earlier of two identical prop tails. Nothing failed. The setting
 * was simply ignored.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const app = readFileSync(join(root, 'App.jsx'), 'utf8')

/**
 * Call sites live in more than one file — Composer is rendered by Center,
 * Connectors by SettingsModal — so every source file is searched, not just
 * App.jsx. Props are passed down through whatever component owns the render.
 */
const sources = readdirSync(root, { recursive: true })
  .filter(name => /\.jsx?$/.test(name))
  .map(name => ({ file: name, text: readFileSync(join(root, name), 'utf8') }))

/**
 * A call like `<Composer {...composerProps} />` passes nothing by name, so a
 * naive check would report every prop as missing. When a spread is present the
 * parent's own call site is resolved too, one level up — enough for this
 * codebase, and it keeps the check from crying wolf on a pattern that is
 * working correctly.
 */
function spreadNames(call) {
  return [...call.matchAll(/\{\.\.\.([A-Za-z_$][\w$]*)\}/g)].map(match => match[1])
}

function propsFromCallSite(tag, depth = 0) {
  const site = findCallSite(tag)
  if (!site || depth > 2) return null
  const own = new Set(
    [...site.call.matchAll(/([A-Za-z_$][\w$]*)=\{/g)].map(match => match[1]),
  )
  for (const name of spreadNames(site.call)) {
    // Which component owns this render? Only top-level declarations count —
    // helpers nested inside a component would otherwise win, since they are
    // closer to the call. Matching at column zero excludes the indented ones.
    const before = site.text.slice(0, site.text.indexOf(site.call))
    const names = [...before.matchAll(/^(?:export\s+default\s+)?function\s+(\w+)\s*\(/gm)].map(match => match[1])
    const parent = names[names.length - 1]
    // The spread holds whatever the owning component was handed.
    if (parent && parent !== tag) {
      const inherited = propsFromCallSite(parent, depth + 1)
      if (inherited) for (const prop of inherited) own.add(prop)
    }
    own.add(name)
  }
  return own
}

function findCallSite(tag) {
  for (const { file, text } of sources) {
    const at = text.indexOf(`<${tag} `)
    if (at === -1) continue
    // Self-closing elements end in "/>" or "/>}" depending on whether the
    // parent is inside a JSX expression.
    const candidates = [text.indexOf('/>}', at), text.indexOf('/>', at)].filter(index => index !== -1)
    if (!candidates.length) continue
    const end = Math.min(...candidates)
    return { file, text, call: text.slice(at, end) }
  }
  return null
}

const COMPONENTS = [
  ['components/Center.jsx', 'Center'],
  ['components/SettingsModal.jsx', 'SettingsModal'],
  ['components/ArtifactPanel.jsx', 'ArtifactPanel'],
  ['components/SubAgentPanel.jsx', 'SubAgentPanel'],
  ['components/Composer.jsx', 'Composer'],
  ['components/Sidebar.jsx', 'Sidebar'],
  ['components/TodayView.jsx', 'TodayView'],
  ['components/VaultPanel.jsx', 'VaultPanel'],
  ['components/ModelSelector.jsx', 'ModelSelector'],
  ['components/ArtifactsLibrary.jsx', 'ArtifactsLibrary'],
  ['components/Connectors.jsx', 'Connectors'],
  ['components/AppsExtensionsModal.jsx', 'AppsExtensionsModal'],
  ['components/UserMenu.jsx', 'UserMenu'],
]

function declaredProps(file, tag) {
  const source = readFileSync(join(root, file), 'utf8')
  const match = source.match(new RegExp(`function ${tag}\\(\\{([^}]*)\\}`))
  if (!match) return null
  return match[1]
    .split(',')
    .map(part => part.trim().split('=')[0].trim())
    .filter(Boolean)
    .filter(name => !name.startsWith('...'))
}

/** Props that are optional by design — a component works fine without them. */
const OPTIONAL = new Set(['liveArtifacts', 'branchFamily', 'live', 'visionModel'])

for (const [file, tag] of COMPONENTS) {
  test(`${tag}: every declared prop is passed at its App.jsx call site`, () => {
    const props = declaredProps(file, tag)
    if (!props) return // component does not destructure; nothing to check

    const site = findCallSite(tag)
    assert.ok(site, `${tag} is never rendered anywhere in src/`)
    const passed = propsFromCallSite(tag)
    const missing = props.filter(name => !OPTIONAL.has(name) && !passed.has(name))
    assert.deepEqual(missing, [], `${tag} (rendered in ${site.file}) declares props that are never passed: ${missing.join(', ')}`)
  })
}

test('the inference setting reaches every component that generates text', () => {
  // If this drifts, the Performance panel silently stops doing anything.
  for (const tag of ['ArtifactPanel', 'SettingsModal']) {
    const site = findCallSite(tag)
    assert.ok(site, `${tag} is never rendered`)
    assert.equal(site.call.includes('inference={inference}'), true, `${tag} does not receive the inference setting`)
  }
  for (const hook of ['useSubAgents({', 'useChat({']) {
    const at = app.indexOf(hook)
    const call = app.slice(at, app.indexOf('})', at))
    assert.equal(call.includes('inference'), true, `${hook} does not receive the inference setting`)
  }
})

test('streamChat forwards inference options to Ollama', () => {
  const source = readFileSync(join(root, 'lib', 'ollama.js'), 'utf8')
  assert.match(source, /function streamChat\([^)]*inference/, 'streamChat must accept an inference argument')
  assert.match(source, /resolveInference\(inference\)/, 'streamChat must resolve the inference profile')
  // The hardcoded context this replaced must not come back.
  assert.doesNotMatch(source, /num_ctx: 4096/, 'num_ctx must come from the profile, not a literal')
})
