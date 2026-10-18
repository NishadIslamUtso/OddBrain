import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { askShellPath, enginePathSync, fallbackPrepend, mergePath } from '../src/main/engine/enginePath'
import { pdfSafeName } from '../src/shared/lib/artifacts'

const read = (rel: string): string => readFileSync(join(import.meta.dirname ?? 'tests', '..', rel), 'utf8')

/**
 * What was taken from the claudereverse study, as CODE with its own spine:
 * real PATH resolution, the quick window, find in the transcript, the
 * artifact pop-out + PDF — and the OddBrain rename. Each pinned here.
 */
test("the app asks the user's shell for the real PATH, with the old prepend as fallback", async () => {
  // unix: marker-delimited, motd-proof
  const unix = await askShellPath('linux', { SHELL: '/bin/zsh' }, (_cmd, _args, done) => done(null, 'motd noise\n__OB_PATH__/home/x/.local/bin:/usr/bin\n'))
  assert.equal(unix, '/home/x/.local/bin:/usr/bin')
  // failure → null (never blocks, never throws)
  const dead = await askShellPath('linux', {}, (_cmd, _args, done) => done(new Error('no shell'), ''))
  assert.equal(dead, null)
  // windows: registry truth through PowerShell
  const win = await askShellPath('win32', { SystemRoot: 'C:\\Windows' }, (_cmd, _args, done) => done(null, 'C:\\Windows;C:\\npm'))
  assert.equal(win, 'C:\\Windows;C:\\npm')

  // merge: app folders first, case-insensitive dedupe on Windows
  const merged = mergePath(['C:\\npm'], 'C:\\Windows;C:\\npm', 'C:\\Windows', 'win32')
  assert.equal(merged.toLowerCase(), 'c:\\npm;c:\\windows')
  const mergedUnix = mergePath(['/app/bin', '/x'], '/x:/usr/bin', '/usr/bin:/y', 'linux')
  assert.equal(mergedUnix, '/app/bin:/x:/usr/bin:/y')

  // the sync getter never blocks: cache or the honest fallback
  const env = { APPDATA: 'C:\\Users\\x\\AppData\\Roaming', USERPROFILE: 'C:\\Users\\x', PATH: 'C:\\Windows' }
  const fallback = enginePathSync('win32', env)
  const parts = fallback.split(';')
  assert.equal(parts[0], fallbackPrepend('win32', env)[0], 'the old prepend still LEADS the fallback')
  assert.equal(parts[parts.length - 1], 'C:\\Windows', 'the inherited PATH trails it')
  assert.equal(fallbackPrepend('linux', { HOME: '/h' })[0], '/h/.local/bin')
})

test('the quick window is a smaller door into the ONE send path, not a second engine', () => {
  const main = read('src/main/index.ts')
  const app = read('src/renderer/src/App.tsx')
  assert.match(app, /has\('quick'\)\) return <QuickMode \/>/, 'the renderer renders the quick surface only in a quick window')
  assert.match(app, /void engine\.send\(prompt\)/, 'the quick surface sends through the engine store — the one send path')
  const preload = read('src/preload/index.ts')
  assert.match(preload, /'quick:shortcut'/, 'the hotkey is a setting, movable in the UI')
})

test('find in the conversation: an overlay that never mutates the React tree', () => {
  const bar = read('src/renderer/src/components/FindBar.tsx')
  assert.match(bar, /CSS\.highlights/, 'matches are painted with the Custom Highlight API')
  assert.doesNotMatch(bar, /innerHTML/, 'no DOM surgery on the transcript')
  assert.match(bar, /data-find-root/, 'the search is scoped to the conversation root')
  assert.match(bar, /'Escape'/, 'Escape closes')
  const chat = read('src/renderer/src/components/ChatView.tsx')
  assert.match(chat, /data-find-root/, 'the transcript marks its scroller as the find root')
  const globals = read('src/renderer/src/styles/globals.css')
  assert.match(globals, /::highlight\(ob-find\)/, 'the highlight colour ships in the stylesheet')
})

test('an artifact can leave the chat: its own window, and a PDF in the vault', () => {
  const main = read('src/main/index.ts')
  const preview = read('src/renderer/src/components/ArtifactPreview.tsx')
  assert.match(preview, /artifactWindow\.popout/, 'the preview offers its own window')
  assert.match(preview, /artifactWindow\.savePdf/, 'and Save as PDF')
})

test('the app is OddBrain now — identity, installer, fuses', () => {
  const titleBar = read('src/renderer/src/components/TitleBar.tsx')
  assert.match(titleBar, />OddBrain</, 'the title bar carries the new name')
  const builder = read('electron-builder.yml')
  assert.match(builder, /productName: OddBrain/)
  assert.match(builder, /artifactName: OddBrain-Setup-\$\{version\}\.exe/)
  // Fuses are build config: the hook must be wired and the script must flip
  // the three abuse fuses on the packaged binary.
  assert.match(builder, /afterPack: scripts\/apply-fuses\.cjs/, 'the fuse hook is wired into the build')
  // The name the person SEES outside the app too: the Start Menu shortcut and
  // the package metadata. The shortcut once still said the old name while
  // every window said the new one.
  assert.match(builder, /shortcutName: OddBrain/, 'the installed shortcut is OddBrain')
  assert.doesNotMatch(builder, /AI ASSistant/, 'the builder config carries no old name')
  const pkg = JSON.parse(readFileSync(join(import.meta.dirname ?? 'tests', '..', 'package.json'), 'utf8')) as { description?: string }
  assert.match(pkg.description ?? '', /OddBrain/, 'the package description is OddBrain')
  const vault = read('src/main/vault/service.ts')
  assert.match(vault, /oddbrain-artifact-/, 'the export zip carries the product name')
  const fuses = read('scripts/apply-fuses.cjs')
  assert.match(fuses, /FuseV1Options\.RunAsNode\]: false/, 'fuses: no Node-eval backdoor')
  assert.match(fuses, /EnableNodeOptionsEnvironmentVariable\]: false/, 'fuses: no NODE_OPTIONS')
  assert.match(fuses, /EnableNodeCliInspectArguments\]: false/, 'fuses: no --inspect')
  // the old name survives NOWHERE in shipped source
  const walk = (dir: string): string[] => {
    const out: string[] = []
    for (const entry of readdirRecursive(dir)) out.push(entry)
    return out
  }
  const files = [
    ...walk('src/main'),
    ...walk('src/renderer'),
    ...walk('src/preload'),
    ...walk('src/shared'),
  ]
  const offenders = files.filter((f) => /\.(ts|tsx|css|html)$/.test(f) && read(f).includes('AI ASSistant'))
  assert.deepEqual(offenders, [], 'no source file still claims the old name')
})

import { readdirSync, statSync } from 'node:fs'
function readdirRecursive(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...readdirRecursive(full))
    else out.push(full)
  }
  return out
}

test('the PDF file name a Windows disk accepts', () => {
  assert.equal(pdfSafeName('My/Awful: Title?'), 'My Awful Title')
  assert.equal(pdfSafeName('   '), 'artifact')
  assert.ok(pdfSafeName('x'.repeat(200)).length <= 60)
})
