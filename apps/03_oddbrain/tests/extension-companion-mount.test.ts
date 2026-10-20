// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'

const source = readFileSync(resolve(process.cwd(), '../../extension/content-scripts/companion.js'), 'utf8')
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
afterEach(() => { delete (globalThis as any).__oddCompanion; vi.restoreAllMocks() })

test('the companion tolerates a missing document root and a concurrent retry without null append or duplicate hosts', async () => {
  document.documentElement.remove()
  const roots: ShadowRoot[] = [], attach = Element.prototype.attachShadow
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (options: ShadowRootInit) { const root = attach.call(this, options); roots.push(root); return root })
  Object.assign(globalThis, {
    OddAppearance: { apply: () => ({}) },
    chrome: {
      extension: { inIncognitoContext: false },
      runtime: { sendMessage: async (message: any) => message.type === 'ob-site-access' ? { allowed: true } : message.type === 'ob-research' ? { ok: true, packet: 'CITED_PACKET', sources: [{ id: '[S1]' }], notices: [] } : { ok: true }, onMessage: { addListener: () => {} } },
      storage: { local: { get: async (defaults: any) => ({ ...defaults, companionEnabled: true }) }, onChanged: { addListener: () => {} } },
    },
  })
  expect(() => (0, eval)(source)).not.toThrow()
  await tick()
  const html = document.createElement('html'), body = document.createElement('body'), input = document.createElement('textarea')
  input.value = 'Existing draft'; input.setSelectionRange(input.value.length, input.value.length)
  body.append(input); html.append(body); document.append(html)
  input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  await tick(); await tick()
  expect(document.querySelectorAll('[data-oddbrain="companion"]')).toHaveLength(1)
  expect(roots).toHaveLength(1)
  expect(roots[0].textContent).toContain('OddBrain')
  ;([...roots[0].querySelectorAll('button')].find(button => button.textContent === 'OddBrain') as HTMLButtonElement).click(); await tick()
  const search = roots[0].querySelector('input') as HTMLInputElement; search.value = 'orchard'
  ;([...roots[0].querySelectorAll('button')].find(button => button.textContent === 'Build cited packet') as HTMLButtonElement).click(); await tick(); await tick()
  expect(input.value).toBe('Existing draft')
  ;([...roots[0].querySelectorAll('button')].find(button => button.textContent === 'Insert cited packet') as HTMLButtonElement).click()
  expect(input.value).toBe('Existing draft\n\nCITED_PACKET')
})
