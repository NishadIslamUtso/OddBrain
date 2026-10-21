import test from 'node:test'
import assert from 'node:assert/strict'
import { protectLocalApi, localTarget } from '../src/main/api/guard'

/**
 * The boundary in front of the local services.
 *
 * Moved here from the old app's `tests/proxy-policy.test.cjs`, where the same
 * rules guarded a Vite proxy. The subject moved into the main process; the rules
 * did not change, and neither did these assertions.
 *
 * One addition: the preview-origin case is switched on in the test itself rather
 * than depending on an environment variable being set by whoever runs it.
 */

function request(
  url: string,
  method = 'GET',
  headers: Record<string, string> = {}
): { status: number; body: string; forwarded: boolean } {
  headers = { host: '127.0.0.1:41979', ...headers }
  let status = 200
  let body = ''
  let forwarded = false
  protectLocalApi(
    { url, method, headers },
    {
      writeHead(code: number) {
        status = code
      },
      end(value?: string) {
        body = value || ''
      },
    },
    () => {
      forwarded = true
    }
  )
  return { status, body, forwarded }
}

test('the boundary supports only the local driver endpoints', () => {
  assert.equal(request('/api/ollama/tags').forwarded, true)
  assert.equal(request('/api/vault/context?q=blue').forwarded, true)
  assert.equal(request('/src/main.tsx').forwarded, true, 'the app itself is not the API')
  assert.equal(
    request('/api/ollama/pull', 'POST', { 'content-type': 'application/json' }).status,
    403,
    'downloading a model is not a browser operation'
  )
  assert.equal(request('/api/ollama/delete', 'DELETE').status, 403)
  assert.equal(request('/api/vault/arbitrary-path').status, 403)
})

test('ordinary local and preview same-origin JSON writes pass the boundary', () => {
  const wasSet = process.env.ALLOW_PREVIEW_ORIGINS
  for (const host of ['127.0.0.1:5173', '5173-test.e2b.app']) {
    // The preview origin is only trusted when it is switched on explicitly.
    process.env.ALLOW_PREVIEW_ORIGINS = host.endsWith('.e2b.app') ? '1' : wasSet
    const result = request('/api/ollama/chat', 'POST', {
      host,
      origin: `https://${host}`,
      'content-type': 'application/json',
    })
    assert.equal(result.forwarded, true, `${host} should be allowed`)
  }
  if (wasSet === undefined) delete process.env.ALLOW_PREVIEW_ORIGINS
  else process.env.ALLOW_PREVIEW_ORIGINS = wasSet
})

test('cross-origin, opaque-origin and DNS-rebinding requests do not get forwarded', () => {
  for (const origin of ['https://evil.example', 'null']) {
    const result = request('/api/vault/capture', 'POST', {
      host: '127.0.0.1:5173',
      origin,
      'content-type': 'application/json',
    })
    assert.equal(result.status, 403, `${origin} must not reach a local service`)
  }
  const rebound = request('/api/vault/files', 'GET', {
    host: 'attacker-controlled.example:41979',
    origin: 'http://attacker-controlled.example:41979',
  })
  assert.equal(rebound.status, 403)
  assert.equal(rebound.forwarded, false, 'a same-origin DNS name that resolves to loopback is still hostile')
  assert.equal(request('/api/vault/files', 'GET', { host: '' }).forwarded, false, 'HTTP API requests need an authority')
})

test('form CSRF and non-JSON writes are rejected', () => {
  for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
    const result = request('/api/ollama/chat', 'POST', { 'content-type': contentType })
    assert.equal(result.status, 415, `${contentType} must not be accepted`)
  }
})

test('service targets stay on loopback and carry no credentials', () => {
  assert.equal(localTarget('http://127.0.0.1:18765', 'VAULT_API_URL'), 'http://127.0.0.1:18765')
  assert.equal(localTarget('http://localhost:11434', 'OLLAMA_API_URL'), 'http://localhost:11434')
  for (const target of [
    'https://cloud.example',
    'http://user:secret@127.0.0.1:11434',
    'file:///etc/passwd',
  ]) {
    assert.throws(() => localTarget(target, 'OLLAMA_API_URL'), /loopback/)
  }
})
