import assert from 'node:assert/strict'
import test from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { addEventToCaches } from '../src/lib/eventAggregateCache.ts'

// 2026-09-24: creating a reminder showed up instantly in the calendar's stacking
// view (fed by useRollingEvents, a range-windowed query addEventToCaches already
// pushed new rows into) but not on the living-canvas homepage -- Today's Schedule's
// reminder merge, Tomorrow's Schedule's reminder merge, and Today's To-Dos are ALL
// sourced from useAllReminders (queryKey ['events', 'all-reminders']), an unbounded,
// unrouted query addEventToCaches never touched. It fell back entirely to the
// realtime-debounced invalidation (800-1200ms jitter, plus real network time) --
// a real, user-visible "not immediate" gap. Updates/deletes were already fine
// (applyEventAggregatePatch/evictEventFromAllCaches use setQueriesData with a plain-
// array-aware patcher, which reaches this cache shape too); only creation had the gap.

function makeReminder(overrides = {}) {
  return {
    id: 'new-reminder-1',
    title: 'Pick up Photobook for Liv',
    event_type: 'reminder',
    start_time: '2026-09-24T19:30:00.000Z',
    end_time: '2026-09-24T19:45:00.000Z',
    all_day: false,
    status: 'confirmed',
    members: [],
    ...overrides,
  }
}

test('a newly created reminder is pushed into the loaded useAllReminders cache immediately', () => {
  const qc = new QueryClient()
  qc.setQueryData(['events', 'all-reminders'], [
    { id: 'existing-1', title: 'Existing reminder', start_time: '2026-09-24T10:00:00.000Z' },
  ])

  addEventToCaches(qc, makeReminder())

  const after = qc.getQueryData(['events', 'all-reminders'])
  assert.ok(Array.isArray(after))
  assert.equal(after.length, 2)
  assert.ok(after.some((e) => e.id === 'new-reminder-1'))
})

test('is idempotent -- calling it twice for the same reminder does not duplicate it', () => {
  const qc = new QueryClient()
  qc.setQueryData(['events', 'all-reminders'], [])
  addEventToCaches(qc, makeReminder())
  addEventToCaches(qc, makeReminder())
  const after = qc.getQueryData(['events', 'all-reminders'])
  assert.equal(after.length, 1)
})

test('a real event (not a reminder) does not get pushed into useAllReminders', () => {
  const qc = new QueryClient()
  qc.setQueryData(['events', 'all-reminders'], [])
  addEventToCaches(qc, makeReminder({ id: 'evt-1', event_type: 'event' }))
  const after = qc.getQueryData(['events', 'all-reminders'])
  assert.equal(after.length, 0)
})

test('leaves an unloaded (undefined) useAllReminders cache alone rather than creating a bad shape', () => {
  const qc = new QueryClient()
  addEventToCaches(qc, makeReminder())
  const after = qc.getQueryData(['events', 'all-reminders'])
  assert.equal(after, undefined)
})
