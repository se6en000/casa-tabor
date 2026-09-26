import test from 'node:test'
import assert from 'node:assert/strict'
import { formatLocal, localNowLine } from '../supabase/functions/_shared/assistant-local-time.mjs'

// 2026-09-25: "where is Kelly doing yoga at 8 AM" at 8:48 PM Eastern was answered as
// "8 AM UTC, which is 4 AM local" — the prompt said "now" in UTC (already Saturday there)
// and never said which times were local. Now is stated in local words, with the offset.

test('now is said in the family\'s local words: Friday evening, not a UTC Saturday', () => {
  assert.equal(localNowLine('2026-09-26T00:48:01.000Z', '-04:00'), 'Friday, September 25, 2026, 8:48 PM (local time, UTC-04:00)')
})

test('an event time is shown in local time, with no zone left to guess', () => {
  assert.equal(formatLocal('2026-09-26T13:00:00+00:00', '-04:00'), 'Sat, Sep 26, 9:00 AM')
})

test('without an offset it falls back to Eastern daylight time, like the rest of the assistant', () => {
  assert.equal(formatLocal('2026-09-26T13:00:00Z'), 'Sat, Sep 26, 9:00 AM')
})

test('a caller that already sends local words (the QA sweep) keeps them as they are', () => {
  assert.equal(localNowLine('Friday, September 25, 2026 at 8:55 PM EDT', '2026-09-25T20:55:00-04:00'), 'Friday, September 25, 2026 at 8:55 PM EDT')
})

import { localizeTimestamps } from '../supabase/functions/_shared/assistant-local-time.mjs'

test('evidence text: every timestamp with a zone becomes local words (the yoga answer said "today, Friday" for Saturday 8 AM)', () => {
  const excerpt = 'Title: KT Yoga\nStarts: 2026-09-26T12:00:00+00:00\nEnds: 2026-09-26T13:00:00Z'
  assert.equal(localizeTimestamps(excerpt, '-04:00'), 'Title: KT Yoga\nStarts: Sat, Sep 26, 8:00 AM (local)\nEnds: Sat, Sep 26, 9:00 AM (local)')
})

test('dates without a time or zone are left alone (they are already calendar dates)', () => {
  assert.equal(localizeTimestamps('Due 2026-09-26; ref 2026-09-26T12:00', '-04:00'), 'Due 2026-09-26; ref 2026-09-26T12:00')
})

test('a confirmation card says when in words: "Sun, Sep 27 · 12 – 1 PM", never 2026-09-27T12:00:00-04:00', async () => {
  const { humanWhen } = await import('../supabase/functions/_shared/assistant-local-time.mjs')
  assert.equal(humanWhen('2026-09-27T12:00:00-04:00', '2026-09-27T13:00:00-04:00', '-04:00'), 'Sun, Sep 27 · 12 – 1 PM')
  assert.equal(humanWhen('2026-09-27T11:30:00-04:00', '2026-09-27T13:00:00-04:00', '-04:00'), 'Sun, Sep 27 · 11:30 AM – 1 PM')
  assert.equal(humanWhen('2026-09-27T16:00:00Z', null, '-04:00'), 'Sun, Sep 27 · 12 PM')
  assert.equal(humanWhen('2026-09-27', '2026-09-28', '-04:00', { allDay: true }), 'Sun, Sep 27 · all day')
  assert.equal(humanWhen('not a date', null, '-04:00'), 'not a date')
})
