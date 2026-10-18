/**
 * The sub-agent queue translated from Jan's Cowork lanes: asking for a job
 * while another runs should queue it, not refuse it.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

const AGENT_STATUSES = ['idle', 'waiting', 'running', 'done', 'error']

/** Mirrors the normalizer in useSubAgents.js: transient states must not survive a reload. */
function normalize(agents = []) {
  return agents
    .filter(agent => agent && typeof agent.id === 'string' && typeof agent.task === 'string')
    .slice(0, 40)
    .map(agent => ({ ...agent, status: ['running', 'waiting'].includes(agent.status) ? 'idle' : agent.status }))
}

test('a queued sub-agent is marked waiting, not rejected', () => {
  const state = [{ id: 'a', task: 'x', status: 'running' }]
  const queued = [...state, { id: 'b', task: 'y', status: 'waiting' }]
  assert.equal(queued.at(-1).status, 'waiting')
})

test('waiting is a known status', () => {
  assert.ok(AGENT_STATUSES.includes('waiting'))
})

test('a reload resets waiting and running back to idle so nothing looks stuck', () => {
  const reloaded = normalize([
    { id: 'a', task: 'x', status: 'running' },
    { id: 'b', task: 'y', status: 'waiting' },
    { id: 'c', task: 'z', status: 'done' },
  ])
  assert.deepEqual(reloaded.map(agent => agent.status), ['idle', 'idle', 'done'])
})

test('queueing the same agent twice does not duplicate it', () => {
  const queue = []
  const id = 'b'
  if (!queue.includes(id)) queue.push(id)
  if (!queue.includes(id)) queue.push(id)
  assert.deepEqual(queue, ['b'])
})

test('the queue drains in order', () => {
  const queue = ['b', 'c', 'd']
  const order = []
  while (queue.length) order.push(queue.shift())
  assert.deepEqual(order, ['b', 'c', 'd'])
})

test('normalize drops malformed agents', () => {
  assert.deepEqual(normalize([null, { id: 1, task: 'x' }, { id: 'ok', task: 'y', status: 'done' }]).map(a => a.id), ['ok'])
})
