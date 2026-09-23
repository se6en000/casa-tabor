import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  EVENTS_CACHE_BUSTER,
  EVENTS_CACHE_MAX_AGE_MS,
  shouldPersistQuery,
} from '../src/lib/eventsCachePersister.ts'

// 2026-09-23: calendar resilience (stale-while-revalidate). On reload, React
// Query should rehydrate the calendar's last-known data from IndexedDB
// instantly (no network wait) while the real fetch reconciles in the
// background -- so a backend hiccup (like tonight's cron-collision incident)
// shows "the same thing it showed before, then updates a few seconds later"
// instead of a blank skeleton. Scoped to ONLY the events-range queries
// (week/rolling/month), not the whole app's query cache -- settings,
// grocery, ai_conversations etc. are never written to this persisted store.

test('only events-range queries are persisted, not the rest of the app', () => {
  assert.equal(shouldPersistQuery({ queryKey: ['events', 'week', '2026-09-22T00:00:00.000Z'] }), true)
  assert.equal(shouldPersistQuery({ queryKey: ['events', 'rolling', '2026-09-22T00:00:00.000Z'] }), true)
  assert.equal(shouldPersistQuery({ queryKey: ['events', 'month', '2026-09-01T00:00:00.000Z'] }), true)
  for (const key of [
    ['event-details', 'abc'],
    ['settings'],
    ['ai_conversations'],
    ['grocery_items'],
    ['event-transportation-plans'],
    ['saved_places'],
  ]) {
    assert.equal(shouldPersistQuery({ queryKey: key }), false, `${JSON.stringify(key)} must not be persisted`)
  }
})

test('the cache buster is a real version string, not left empty (must be bumped whenever the persisted event shape changes)', () => {
  assert.equal(typeof EVENTS_CACHE_BUSTER, 'string')
  assert.ok(EVENTS_CACHE_BUSTER.length > 0)
})

test('a bounded max age exists so a very old persisted cache is discarded outright, not just treated as stale', () => {
  assert.equal(typeof EVENTS_CACHE_MAX_AGE_MS, 'number')
  // must be bounded (not Infinity/absurdly large) and at least a few hours
  // (the point is surviving a reload during a backend hiccup, not showing
  // week-old data as if it were current)
  assert.ok(EVENTS_CACHE_MAX_AGE_MS >= 1000 * 60 * 60 * 6)
  assert.ok(EVENTS_CACHE_MAX_AGE_MS <= 1000 * 60 * 60 * 24 * 3)
})

test('the persister uses a dedicated IndexedDB store, not sharing a key namespace with anything else', () => {
  const source = readFileSync(new URL('../src/lib/eventsCachePersister.ts', import.meta.url), 'utf8')
  assert.match(source, /createStore\(/)
  assert.match(source, /createAsyncStoragePersister/)
})

test('App wires PersistQueryClientProvider with the scoped persister, buster and max age', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /PersistQueryClientProvider/)
  assert.match(app, /persister:\s*eventsCachePersister/)
  assert.match(app, /buster:\s*EVENTS_CACHE_BUSTER/)
  assert.match(app, /maxAge:\s*EVENTS_CACHE_MAX_AGE_MS/)
  assert.match(app, /shouldDehydrateQuery:\s*shouldPersistQuery/)
})
