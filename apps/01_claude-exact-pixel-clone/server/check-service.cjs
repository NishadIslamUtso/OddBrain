const path = require('node:path')
async function main() {
  const mode = process.argv[2]
  const port = mode === 'vault' ? 8765 : 11434
  const endpoint = mode === 'vault' ? '/health' : '/api/tags'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2500)
  try {
    const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Port ${port}: HTTP ${response.status}`)
    const data = await response.json()
    if (mode === 'vault') {
      const expected = path.resolve(process.env.AI_BRAIN_VAULT || path.join(__dirname, '../../../vault/AI-Brain'))
      if (!data.ok || !data.message?.includes('AI ASSistant') || path.resolve(data.vault || '') !== expected) throw new Error('Port 8765 belongs to a different vault/service. Close its terminal, then start this branch again.')
      console.log(`Canonical vault ready: ${data.vault}`)
    } else {
      if (!Array.isArray(data.models)) throw new Error('This is not an Ollama model service.')
      if (mode === 'model' && !data.models.some(model => model.name === 'qwen2.5:3b')) throw new Error('qwen2.5:3b was not found in the existing Ollama installation. No model will be downloaded automatically.')
      console.log(mode === 'model' ? 'Existing qwen2.5:3b found.' : 'Existing Ollama is running.')
    }
  } finally { clearTimeout(timer) }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
