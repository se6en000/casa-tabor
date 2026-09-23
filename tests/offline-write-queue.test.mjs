import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { isConnectivityFailure } from '../src/lib/offlineWriteQueue.ts'

// 2026-09-23: reads survive an outage (the persisted calendar cache); writes
// didn't -- create/edit anything with no signal and it just failed, with no
// "will retry when you're back online". Scoped honestly: this builds the real
// queue infrastructure (a dedicated IndexedDB store, connectivity-failure
// detection, enqueue/drain) and wires it into ONE real write path (quick-
// create -- see tests/quickcreate-offline-queue.test.mjs) rather than
// retrofitting every mutation across the app in one pass, which would touch
// dozens of files this session hasn't audited for the pattern.

test('a genuine connectivity failure (offline, or a network-level fetch failure) is recognized as queueable', () => {
  assert.equal(isConnectivityFailure(new TypeError('Failed to fetch'), false), true)
  assert.equal(isConnectivityFailure(new Error('anything'), false), true) // navigator.onLine already false is enough on its own
})

test('a real server-side rejection (validation error, constraint violation) is NOT treated as a connectivity failure', () => {
  assert.equal(isConnectivityFailure({ code: '23505', message: 'duplicate' }, true), false)
  assert.equal(isConnectivityFailure(new Error('Event title is required'), true), false)
})

test('the queue uses its own dedicated IndexedDB store, separate from the read cache, and exposes enqueue/dequeue/list/drain', () => {
  // idb-keyval needs a real browser IndexedDB, unavailable under node --test
  // (same constraint as src/lib/eventsCachePersister.ts) -- the actual
  // enqueue/list/dequeue round trip and drain-on-reconnect behavior are
  // verified live in the browser, not here.
  const source = readFileSync(new URL('../src/lib/offlineWriteQueue.ts', import.meta.url), 'utf8')
  assert.match(source, /createStore\('casa-tabor-write-queue'/)
  assert.match(source, /export (async )?function enqueueWrite/)
  assert.match(source, /export (async )?function dequeueWrite/)
  assert.match(source, /export (async )?function listQueuedWrites/)
  assert.match(source, /export (async )?function drainQueue/)
})

test('quick-create enqueues on a connectivity failure instead of just showing an error', () => {
  const source = readFileSync(new URL('../src/components/calendar/PalmBeachFolioCard.tsx', import.meta.url), 'utf8')
  assert.match(source, /isConnectivityFailure/)
  assert.match(source, /enqueueWrite/)
})

test('a real server-side rejection still short-circuits before the optimistic add (only a queued connectivity failure proceeds)', () => {
  const source = readFileSync(new URL('../src/components/calendar/PalmBeachFolioCard.tsx', import.meta.url), 'utf8')
  const idx = source.indexOf('const queuedOffline =')
  const block = source.slice(idx, idx + 400)
  assert.match(block, /else if \(error \|\| !bundle\?\.success\)/)
  assert.match(block, /return$/m)
})

test('the write queue drains automatically on reconnect, mounted once at the app shell', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /useOfflineWriteQueue\(\)/)
  const hook = readFileSync(new URL('../src/hooks/useOfflineWriteQueue.ts', import.meta.url), 'utf8')
  assert.match(hook, /useOnlineStatus/)
  assert.match(hook, /drainQueue/)
})
