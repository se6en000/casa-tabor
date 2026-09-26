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
