import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// public/blank-recovery.js: if the app never draws (a stale cached script left the kiosk
// blank on 2026-09-25), clear the service worker and caches and reload, at most once per 5 min.
function run({ children = 0, lastRecovery = null, now = 1_000_000 } = {}) {
  const calls = { unregistered: 0, deleted: [], reloads: 0 }
  let timer
  const store = new Map(lastRecovery == null ? [] : [['casa-blank-recovery-at', String(lastRecovery)]])
  const context = {
    document: { getElementById: () => ({ childElementCount: children }) },
    setTimeout: (fn) => { timer = fn },
    sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    navigator: { serviceWorker: { getRegistrations: async () => [{ unregister: async () => { calls.unregistered += 1 } }] } },
    caches: { keys: async () => ['casa-tabor-shell-v1'], delete: async (k) => { calls.deleted.push(k) } },
    location: { reload: () => { calls.reloads += 1 } },
    Date: { now: () => now },
    Promise,
  }
  context.window = context
  vm.runInNewContext(readFileSync('public/blank-recovery.js', 'utf8'), context)
  return { fire: async () => { timer(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)) }, calls, store }
}

test('a wall that never drew clears the worker and caches, then reloads', async () => {
  const r = run({ children: 0 })
  await r.fire()
  assert.deepEqual(r.calls, { unregistered: 1, deleted: ['casa-tabor-shell-v1'], reloads: 1 })
})

test('a wall that drew is left alone', async () => {
  const r = run({ children: 1 })
  await r.fire()
  assert.deepEqual(r.calls, { unregistered: 0, deleted: [], reloads: 0 })
})

test('it never loops: a recovery in the last 5 minutes means it waits', async () => {
  const r = run({ children: 0, lastRecovery: 1_000_000 - 60_000 })
  await r.fire()
  assert.equal(r.calls.reloads, 0)
})
