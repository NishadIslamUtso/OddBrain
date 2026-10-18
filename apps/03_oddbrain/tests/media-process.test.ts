// @vitest-environment node
import { test, expect } from 'vitest'
import { runMediaCommand } from '../src/main/media/process'
test('decoder children use argv without shell expansion and strip credentials/Node injection flags', async () => {
  process.env.ODDBRAIN_FIXTURE_API_KEY = 'fixture-secret'
  try {
    const result = await runMediaCommand(process.execPath, ['-e', 'console.log(JSON.stringify([process.argv[1],process.env.ODDBRAIN_FIXTURE_API_KEY]))', 'a & b; $(echo bad)'], new AbortController().signal)
    expect(JSON.parse(result.toString())).toEqual(['a & b; $(echo bad)', null])
  } finally { delete process.env.ODDBRAIN_FIXTURE_API_KEY }
})
test('bounded decoder child exits on timeout, cancellation and output overflow', async () => {
  const signal = new AbortController()
  const pending = runMediaCommand(process.execPath, ['-e', 'setInterval(()=>{},100)'], signal.signal)
  signal.abort(); await expect(pending).rejects.toThrow(/Cancelled/)
  await expect(runMediaCommand(process.execPath, ['-e', 'setInterval(()=>{},100)'], new AbortController().signal, 30)).rejects.toThrow(/time limit/)
  await expect(runMediaCommand(process.execPath, ['-e', 'console.log("x".repeat(10000))'], new AbortController().signal, 2000, 100)).rejects.toThrow(/size limit/)
})
