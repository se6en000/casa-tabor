import test from 'node:test'
import assert from 'node:assert/strict'
import { plausibleDepartureIso, sanitizeStepTimeIso } from '../supabase/functions/_shared/event-time-sanity.mjs'

// Saturday's baseball game as stored in production: 12:30 EDT start, 25 min drive,
// and an AI-written departure dated 2020.
const start = '2026-09-26T16:30:00.000Z'
const end = '2026-09-26T18:30:00.000Z'

test('a departure shortly before the start is kept', () => {
  assert.equal(plausibleDepartureIso('2026-09-26T15:56:00Z', start, 29), '2026-09-26T15:56:00.000Z')
})

test('a wrong-year departure is replaced by start minus drive time', () => {
  assert.equal(plausibleDepartureIso('2020-09-26T16:15:00+00:00', start, 25), '2026-09-26T16:05:00.000Z')
})

test('a departure after the start, or garbage, falls back to drive time, or null without one', () => {
  assert.equal(plausibleDepartureIso('2026-09-26T17:00:00Z', start, 25), '2026-09-26T16:05:00.000Z')
  assert.equal(plausibleDepartureIso('soon', start, 25), '2026-09-26T16:05:00.000Z')
  assert.equal(plausibleDepartureIso('2020-01-01T00:00:00Z', start, null), null)
  assert.equal(plausibleDepartureIso(null, 'not a date', 25), null)
})

test('a departure that would arrive late is moved earlier to start minus drive time', () => {
  // As the model produced it for the real baseball game: leave 12:15 with a 20 min drive for a 12:30 start.
  assert.equal(plausibleDepartureIso('2026-09-26T16:15:00Z', start, 20), '2026-09-26T16:10:00.000Z')
})

test('a step time near the event is kept as is', () => {
  assert.equal(sanitizeStepTimeIso('2026-09-26T16:05:00Z', start, end), '2026-09-26T16:05:00.000Z')
})

test('a wrong-year step time keeps its clock time on the event day', () => {
  assert.equal(sanitizeStepTimeIso('2020-09-26T16:15:00Z', start, end), '2026-09-26T16:15:00.000Z')
})

test('a wrong-date step whose clock time fits the day before or after is moved there', () => {
  // Evening event crossing midnight UTC: a 00:30 UTC return belongs to the next UTC day.
  assert.equal(
    sanitizeStepTimeIso('2020-03-01T00:30:00Z', '2026-09-26T22:00:00Z', '2026-09-26T23:30:00Z'),
    '2026-09-27T00:30:00.000Z',
  )
})

test('an unparseable step time is dropped', () => {
  assert.equal(sanitizeStepTimeIso('about noon', start, end), null)
})
