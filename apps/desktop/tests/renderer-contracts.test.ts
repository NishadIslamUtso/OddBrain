// Replaces the parked JSX regex-based props/wiring checks with the compiler's
// actual module resolution, symbol binding and required-prop checks over this app.
import { beforeAll, test, expect } from 'vitest'
import ts from 'typescript'
import { resolve } from 'node:path'
let diagnostics: readonly ts.Diagnostic[] = []
beforeAll(() => {
  const file = resolve('tsconfig.json')
  const loaded = ts.readConfigFile(file, ts.sys.readFile)
  const config = ts.parseJsonConfigFileContent(loaded.config, ts.sys, process.cwd())
  const program = ts.createProgram(config.fileNames, config.options)
  diagnostics = ts.getPreEmitDiagnostics(program)
}, 30000)
const messages = (items: readonly ts.Diagnostic[]) => items.map(item => `${item.file?.fileName}: ${ts.flattenDiagnosticMessageText(item.messageText, '\n')}`)
test('renderer and main module imports and symbols resolve', () => {
  expect(messages(diagnostics.filter(d => [2304, 2307, 2552, 2686].includes(d.code)))).toEqual([])
})
test('real JSX call sites satisfy required props, signatures and types', () => {
  expect(messages(diagnostics.filter(d => [2322, 2345, 2739, 2741, 2769].includes(d.code)))).toEqual([])
})
test('remaining compiler diagnostics are not silently ignored', () => { expect(messages(diagnostics)).toEqual([]) })
