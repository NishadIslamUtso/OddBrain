/**
 * wiring.test.js — catches the "imports nothing" class of bug.
 *
 * A missing import is invisible to the bundler and to every unit test that
 * stubs the module, but it throws ReferenceError the first time a user sends
 * a message. This walks every source file and proves that each identifier it
 * calls is imported, declared locally, or a known global.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(new URL('../src', import.meta.url).pathname)

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.jsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const GLOBALS = new Set([
  // language + browser
  'Array', 'Object', 'String', 'Number', 'Boolean', 'JSON', 'Math', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'BigInt', 'Intl', 'Reflect', 'Proxy',
  'Uint8Array', 'Uint32Array', 'Int32Array', 'Float64Array', 'ArrayBuffer', 'DataView', 'TextEncoder', 'TextDecoder',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'queueMicrotask',
  'console', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'location', 'history',
  'fetch', 'Request', 'Response', 'Headers', 'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData', 'Image',
  'AbortController', 'Event', 'CustomEvent', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'structuredClone', 'crypto', 'atob', 'btoa', 'alert', 'confirm', 'prompt', 'performance', 'process', 'require',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'DOMParser', 'XMLSerializer', 'Node', 'Element', 'HTMLElement',
  'getComputedStyle', 'matchMedia', 'scrollTo', 'focus', 'blur', 'execCommand', 'getSelection', 'createRange',
  // JSX / build-time
  'jsx', 'jsxs', 'Fragment', 'React',
  // common callbacks passed as parameters (declared in destructuring we may miss)
  'it', 'describe', 'before', 'after', 'beforeEach', 'afterEach',
  // language keywords that are syntactically followed by '('
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'try', 'catch', 'finally',
  'return', 'throw', 'typeof', 'new', 'delete', 'void', 'in', 'of', 'instanceof', 'await', 'yield',
  'function', 'class', 'extends', 'super', 'this', 'import', 'export', 'as', 'from', 'with',
  'let', 'const', 'var', 'async', 'static', 'get', 'set', 'null', 'undefined', 'true', 'false',
])

/** Names this file brings into scope. */
function declaredNames(text) {
  const names = new Set()
  // import { a, b as c } / import a from / import * as ns
  for (const m of text.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    const clause = m[1]
    const braced = /\{([\s\S]*)\}/.exec(clause)
    if (braced) for (const part of braced[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim()
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
    }
    const def = clause.replace(/\{[\s\S]*\}/, '').replace(/\*\s*as\s+/, '').replace(/,/g, '').trim()
    if (/^[A-Za-z_$][\w$]*$/.test(def)) names.add(def)
  }
  // declarations
  for (const m of text.matchAll(/\b(?:function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  // Destructured bindings and params: {a, b} , [a, b] , (a, b).
  // This pass matches only groups with NO nesting inside. A wider match would
  // start at the `{` of `{items.map(([Icon, label], i) => …` and swallow the
  // inner array, losing `Icon` — which is a binding the JSX check below needs.
  for (const m of text.matchAll(/[{([]\s*([^{}()[\]]*?)\s*[)}\]]/g)) {
    for (const part of m[1].split(',')) {
      const name = part.split(':').pop().split('=')[0].trim().replace(/^\.\.\./, '').replace(/^[^\w$]+/, '')
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
    }
  }
  // destructured bindings and params: {a, b} , [a, b] , (a, b)
  for (const m of text.matchAll(/[{([]\s*([^)}\]]{0,400}?)\s*[)}\]]/g)) {
    for (const part of m[1].split(',')) {
      const name = part.split(':').pop().split('=')[0].trim().replace(/^\.\.\./, '').replace(/^[^\w$]+/, '')
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
    }
  }
  return names
}

/** Identifiers invoked as name( — excluding member calls like obj.name( */
function calledNames(text) {
  const names = new Set()
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // block comments
    .replace(/^\s*\/\/.*$/gm, ' ')           // line comments
    // String and template contents are not code: "rotate(" must not look like a call.
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    // Regex literals look like divisions, so only strip them where a regex can
    // legally start: after an operator, a comma, a colon or `return`.
    .replace(/([=(,:;!&|?+\-*/%]|\breturn|\btypeof|\bcase)\s*\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\n\\])+\/[gimsuy]*/g, '$1 /*re*/')
    // JSX text nodes are prose: "Found the issue in validateToken()" is not a call.
    .replace(/>([^<>{}]+)</g, '><')
  for (const m of stripped.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[2])
  return names
}

/**
 * Components used in JSX, e.g. <ClaudeMark size={28} />.
 *
 * This is the check that was missing. A component reference is not a function
 * call in source — `<Foo />` compiles to `jsx(Foo, …)` at build time — so an
 * identifier check that only looks for `name(` never sees it. Vite does not
 * error either, because it just emits the reference and lets the runtime deal
 * with it. The result is a blank page with "Foo is not defined" and a green
 * build, which is exactly what happened when ClaudeMark was renamed to
 * BrainMark in two places and missed in a third.
 */
function jsxComponentNames(text) {
  const names = new Set()
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    // A tag-looking string like '<div className="x">' is prose, not JSX.
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
  for (const m of stripped.matchAll(/<\/?([A-Z][\w.]*)/g)) {
    // <Foo.Bar /> resolves the Foo binding, not Foo.Bar.
    names.add(m[1].split('.')[0])
  }
  return names
}

const files = walk(SRC)

test('source tree is not empty', () => {
  assert.ok(files.length > 15, `expected a real source tree, found ${files.length} files`)
})

for (const file of files) {
  const rel = path.relative(path.resolve(SRC, '..'), file)
  test(`${rel} calls only identifiers it can resolve`, () => {
    const text = fs.readFileSync(file, 'utf8')
    const known = declaredNames(text)
    const unknown = [...calledNames(text)].filter(name => name.length > 1 && !known.has(name) && !GLOBALS.has(name))
    assert.deepEqual(unknown, [], `${rel} calls ${unknown.join(', ')} which is not imported, declared, or global`)
  })

  test(`${rel} renders only components it can resolve`, () => {
    const text = fs.readFileSync(file, 'utf8')
    const known = declaredNames(text)
    const unknown = [...jsxComponentNames(text)].filter(name => !known.has(name) && !GLOBALS.has(name))
    assert.deepEqual(unknown, [], `${rel} renders ${unknown.join(', ')} which is not imported, declared, or global`)
  })
}

test('every relative import resolves to a file that exists', () => {
  const broken = []
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(file), m[1])
      if (!fs.existsSync(target)) broken.push(`${path.relative(SRC, file)} -> ${m[1]}`)
    }
  }
  assert.deepEqual(broken, [])
})

test('every named import is actually exported by its module', () => {
  const broken = []
  const exportsOf = new Map()
  const collectExports = file => {
    if (exportsOf.has(file)) return exportsOf.get(file)
    const text = fs.readFileSync(file, 'utf8')
    const names = new Set()
    for (const m of text.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
    for (const m of text.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim()
        if (name) names.add(name)
      }
    }
    if (/export\s+default/.test(text)) names.add('default')
    exportsOf.set(file, names)
    return names
  }
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(file), m[2])
      if (!fs.existsSync(target)) continue
      const available = collectExports(target)
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim()
        if (name && !available.has(name)) broken.push(`${path.relative(SRC, file)} imports { ${name} } from ${m[2]}`)
      }
    }
  }
  assert.deepEqual(broken, [])
})
