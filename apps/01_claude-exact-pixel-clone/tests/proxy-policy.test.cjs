const test = require('node:test')
const assert = require('node:assert/strict')
const { protectLocalApi } = require('../server/proxy-policy.cjs')
function request(url, method = 'GET', headers = {}) {
  let status = 200, body = '', forwarded = false
  protectLocalApi({ url, method, headers }, { writeHead(code) { status = code }, end(value) { body = value } }, () => { forwarded = true })
  return { status, body, forwarded }
}
test('proxy supports only the local driver endpoints', () => {
  assert.equal(request('/api/ollama/tags').forwarded, true)
  assert.equal(request('/api/vault/context?q=blue').forwarded, true)
  assert.equal(request('/src/main.jsx').forwarded, true)
  assert.equal(request('/api/ollama/pull', 'POST', { 'content-type': 'application/json' }).status, 403)
  assert.equal(request('/api/ollama/delete', 'DELETE').status, 403)
  assert.equal(request('/api/vault/arbitrary-path').status, 403)
})
test('ordinary local and preview same-origin JSON writes pass the boundary', () => {
  for (const host of ['127.0.0.1:5173', '5173-test.e2b.app']) {
    assert.equal(request('/api/ollama/chat', 'POST', { host, origin: `https://${host}`, 'content-type': 'application/json' }).forwarded, true)
  }
})
test('cross-origin and opaque-origin requests do not get forwarded', () => {
  for (const origin of ['https://evil.example', 'null']) assert.equal(request('/api/vault/capture', 'POST', { host: '127.0.0.1:5173', origin, 'content-type': 'application/json' }).status, 403)
})
test('form CSRF and non-JSON writes are rejected', () => {
  for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) assert.equal(request('/api/ollama/chat', 'POST', { 'content-type': contentType }).status, 415)
})

test('environment overrides remain loopback-only and contain no credentials', () => {
  const { localTarget } = require('../server/proxy-policy.cjs')
  assert.equal(localTarget('http://127.0.0.1:18765', 'VAULT_API_URL'), 'http://127.0.0.1:18765')
  assert.equal(localTarget('http://localhost:11434', 'OLLAMA_API_URL'), 'http://localhost:11434')
  for (const target of ['https://cloud.example', 'http://user:secret@127.0.0.1:11434', 'file:///etc/passwd']) assert.throws(() => localTarget(target, 'OLLAMA_API_URL'), /loopback/)
})
