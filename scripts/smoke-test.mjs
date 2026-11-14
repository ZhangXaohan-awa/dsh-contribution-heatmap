/**
 * Bundle smoke test: exercises the Host half of the plugin end to end against a
 * stubbed Cordis context, then reads back the aggregated snapshot through the
 * route it registers.
 *
 * It runs with plain Node (`node scripts/smoke-test.mjs`), needs no DSH
 * installation, and points `DSH_HOME` at a throwaway directory so it never
 * touches real contribution history.
 */

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sandboxHome = await mkdtemp(join(tmpdir(), 'dsh-heatmap-smoke-'))
process.env.DSH_HOME = sandboxHome

const results = []
const check = (name, fn) => {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error })
  }
}

try {
  const plugin = await import(new URL('../index.js', import.meta.url).href)

  check('exports inject = [tools]', () => {
    assert.deepEqual(plugin.inject, ['tools'])
  })
  check('exports an apply function', () => {
    assert.equal(typeof plugin.apply, 'function')
  })

  // --- stub Cordis context -------------------------------------------------
  const handlers = new Map()
  const routes = new Map()

  const ctx = {
    on(name, callback) {
      if (!handlers.has(name)) handlers.set(name, [])
      handlers.get(name).push(callback)
      return () => {}
    },
    effect(fn) {
      const disposer = fn()
      return () => { if (typeof disposer === 'function') disposer() }
    },
    get(name) {
      return name === 'webServer' ? webServer : undefined
    },
  }

  const webServer = {
    register(descriptor) {
      routes.set(descriptor.path, descriptor)
      return () => routes.delete(descriptor.path)
    },
  }

  plugin.apply(ctx)

  check('registers the stats route', () => {
    assert.deepEqual([...routes.keys()], ['/contribution-heatmap/stats.json'])
  })
  check('subscribes to tools/result and session/event', () => {
    assert.ok(handlers.get('tools/result')?.length)
    assert.ok(handlers.get('session/event')?.length)
  })

  const emit = async (name, ...args) => {
    for (const handler of handlers.get(name) ?? []) await handler(...args)
  }
  const tool = async (name, args, { isError = false } = {}) =>
    emit('tools/result', { name, arguments: args }, { isError })

  // --- tool accounting -----------------------------------------------------
  await tool('write', { path: 'a.js', content: 'one\ntwo\nthree' })
  await tool('edit', { path: 'a.js', old_string: 'one', new_string: 'one\nplus' })
  await tool('apply_patch', { patch: '--- a/x\n+++ b/x\n@@\n-old\n+new' })
  await tool('web_search', { query: 'cordis' })
  await tool('web_fetch', { url: 'https://example.com' })
  await tool('bash', { command: 'git commit -m "feat: ship"' })
  await tool('bash', { command: 'git commit && git commit-tree' })
  await tool('bash', { command: "echo 'git commit: not really'" })
  await tool('bash', { command: 'git status' })
  await tool('write', { path: 'b.js', content: 'nope' }, { isError: true })

  // --- token accounting ----------------------------------------------------
  const usageEvent = (seq, totalTokens) => [
    { id: 'session-1' },
    { type: 'assistant/message', seq, time: Date.now(), data: { usage: { totalTokens } } },
  ]
  await emit('session/event', ...usageEvent(1, 1000))
  await emit('session/event', ...usageEvent(1, 1000)) // duplicate must be ignored
  await emit('session/event', { id: 'session-1' }, { type: 'assistant/message', seq: 2, data: {} })

  // --- snapshot through the registered route ------------------------------
  const descriptor = routes.get('/contribution-heatmap/stats.json')
  const snapshot = await (await descriptor.resource({ method: 'GET' })).json()

  check('counts write + edit + apply_patch lines', () => {
    assert.equal(snapshot.totals.ops, 3)
    assert.equal(snapshot.totals.lines, 3 + 2 + 5)
  })
  check('counts one search per successful web call', () => {
    assert.equal(snapshot.totals.searches, 2)
  })
  check('counts real git commit only', () => {
    assert.equal(snapshot.totals.commits, 2)
  })
  check('records tokens once per session:seq', () => {
    assert.equal(snapshot.totals.tokens, 1000)
  })
  check('keys the snapshot by local day', () => {
    const now = new Date()
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    assert.ok(snapshot.days[key], `missing ${key}`)
    assert.equal(snapshot.days[key].lines, 10)
  })
  check('lists the current year first', () => {
    assert.equal(snapshot.years[0], new Date().getFullYear())
  })
  const rejected = await descriptor.resource({ method: 'POST' })
  check('route rejects non-GET', () => {
    assert.equal(rejected.status, 405)
  })
  const headOnly = await descriptor.resource({ method: 'HEAD' })
  const headText = await headOnly.text()
  check('HEAD answers without a body', () => {
    assert.equal(headText, '')
  })

  // --- persistence ---------------------------------------------------------
  await new Promise((resolve) => setTimeout(resolve, 1300))
  const stored = JSON.parse(await readFile(join(sandboxHome, 'contribution-heatmap', 'activity.json'), 'utf8'))
  check('store has version 2 and the collected days', () => {
    assert.equal(stored.version, 2)
    assert.equal(Object.keys(stored.days).length, 1)
  })
} finally {
  await rm(sandboxHome, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
for (const result of results) {
  console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.name}`)
  if (!result.ok) console.log(`     ${result.error?.message ?? result.error}`)
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
