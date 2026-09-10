import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyCalendarTemporalEvidence,
  extractUserTemporalEvidence,
  resolvePastRelativeCreateRollover,
  validateCalendarTemporalProvenance,
} from '../supabase/functions/_shared/assistant-temporal-evidence.mjs'

const OPTIONS = {
  now: new Date('2026-08-13T16:00:00.000Z'),
  utcOffset: '-04:00',
}

test('undated user ideas do not inherit assistant-authored calendar dates', () => {
  const evidence = classifyCalendarTemporalEvidence([
    { id: 'u1', role: 'user', content: 'I want to plan my anniversary weekend.' },
    { id: 'a1', role: 'assistant', content: 'Let us use Saturday, August 15.' },
    { id: 'u2', role: 'user', content: 'Yes.' },
  ], {
    start: '2026-08-15T11:00:00-04:00',
    end: '2026-08-15T13:00:00-04:00',
  }, OPTIONS)

  assert.equal(evidence.status, 'missing')
  assert.equal(evidence.allowed, false)
  assert.equal(evidence.sourceMessageId, null)
})

test('a proposed event outside the latest user-authored trip range is blocked', () => {
  const evidence = classifyCalendarTemporalEvidence([
    { id: 'u1', role: 'user', content: 'Create event for hotel the Plymouth from 8/28-8/30.' },
    { id: 'a1', role: 'assistant', content: 'How about Superblue on Saturday, August 15?' },
    { id: 'u2', role: 'user', content: 'Yes.' },
  ], {
    start: '2026-08-15T11:00:00-04:00',
    end: '2026-08-15T13:00:00-04:00',
  }, OPTIONS)

  assert.equal(evidence.status, 'mismatch')
  assert.equal(evidence.allowed, false)
  assert.equal(evidence.sourceMessageId, 'u1')
  assert.equal(evidence.rangeStart, '2026-08-28')
  assert.equal(evidence.rangeEnd, '2026-08-30')
})

test('a proposed event inside an explicit user-authored range is grounded', () => {
  const evidence = classifyCalendarTemporalEvidence([
    { id: 'u1', role: 'user', content: 'Our Miami trip is August 28 through August 30, 2026.' },
    { id: 'u2', role: 'user', content: 'Add Casa Tua on Saturday night.' },
  ], {
    start: '2026-08-29T19:00:00-04:00',
    end: '2026-08-29T20:00:00-04:00',
  }, OPTIONS)

  assert.equal(evidence.status, 'grounded')
  assert.equal(evidence.allowed, true)
  assert.equal(evidence.resolutionKind, 'explicit_range')
  assert.equal(evidence.requiresExactDateConfirmation, true)
})

test('relative weekdays resolve deterministically and require exact-date confirmation', () => {
  const evidence = extractUserTemporalEvidence({
    id: 'u1',
    role: 'user',
    content: 'Schedule dinner Saturday at 7 PM.',
  }, OPTIONS)

  assert.equal(evidence.rangeStart, '2026-08-15')
  assert.equal(evidence.rangeEnd, '2026-08-15')
  assert.equal(evidence.resolutionKind, 'relative')
  assert.equal(evidence.requiresExactDateConfirmation, true)
})

test('executor provenance validation rejects timestamps outside the grounded range', () => {
  const result = validateCalendarTemporalProvenance({
    rangeStart: '2026-08-28',
    rangeEnd: '2026-08-30',
    resolutionKind: 'explicit_range',
    sourceText: 'August 28 through August 30',
  }, {
    start: '2026-08-15T11:00:00-04:00',
    end: '2026-08-15T13:00:00-04:00',
  }, OPTIONS)

  assert.deepEqual(result, {
    valid: false,
    reason: 'proposed_range_mismatch',
  })
})

test('dayparts and days-from-now are deterministic relative date evidence', () => {
  const daypart = extractUserTemporalEvidence({
    id: 'u-daypart',
    role: 'user',
    content: 'Remind me this morning to call the doctor.',
  }, OPTIONS)
  const offset = extractUserTemporalEvidence({
    id: 'u-offset',
    role: 'user',
    content: 'Remind me four days from now to check the schedule.',
  }, OPTIONS)

  assert.equal(daypart.rangeStart, '2026-08-13')
  assert.equal(offset.rangeStart, '2026-08-17')
  assert.equal(daypart.resolutionKind, 'relative')
  assert.equal(offset.resolutionKind, 'relative')
})

test('a relative "today" resolution whose time has already passed rolls to the next day', () => {
  // Bug: "Schedule a call with the bank today at 8am." asked at 7pm the same day
  // passed the date-evidence check fine (the DATE really is today, matching the
  // evidence in the text) and silently created a start time ~11 hours in the past.
  // classifyCalendarTemporalEvidence only validates the date is grounded, not that
  // the resulting timestamp is still in the future -- this closes that gap.
  const now = new Date('2026-09-10T23:25:00.000Z') // 7:25 PM local at -04:00
  const evidence = { resolutionKind: 'relative', rangeStart: '2026-09-10', rangeEnd: '2026-09-10' }
  const rollover = resolvePastRelativeCreateRollover(
    { start: '2026-09-10T08:00:00-04:00', end: '2026-09-10T09:00:00-04:00' },
    evidence,
    { now },
  )
  assert.deepEqual(rollover, {
    start: '2026-09-11T08:00:00-04:00',
    end: '2026-09-11T09:00:00-04:00',
  })
})

test('rollover is a no-op when the resolved time is still in the future, or the resolution is not relative', () => {
  const now = new Date('2026-09-10T23:25:00.000Z')
  assert.equal(
    resolvePastRelativeCreateRollover(
      { start: '2026-09-11T08:00:00-04:00', end: '2026-09-11T09:00:00-04:00' },
      { resolutionKind: 'relative' },
      { now },
    ),
    null,
    'future relative time',
  )
  assert.equal(
    resolvePastRelativeCreateRollover(
      { start: '2026-09-10T08:00:00-04:00', end: '2026-09-10T09:00:00-04:00' },
      { resolutionKind: 'explicit_date' },
      { now },
    ),
    null,
    'explicitly-typed past date is left alone -- may be intentionally historical',
  )
  assert.equal(
    resolvePastRelativeCreateRollover(
      { start: 'not-a-date', end: 'not-a-date' },
      { resolutionKind: 'relative' },
      { now },
    ),
    null,
    'unparseable start',
  )
})

test('rollover works on the start_time/end_time key convention too, and preserves each side\'s own offset', () => {
  const now = new Date('2026-09-10T23:25:00.000Z')
  const rollover = resolvePastRelativeCreateRollover(
    { start_time: '2026-09-10T08:00:00-04:00', end_time: '2026-09-10T09:30:00-04:00' },
    { resolutionKind: 'relative' },
    { now },
  )
  assert.deepEqual(rollover, {
    start: '2026-09-11T08:00:00-04:00',
    end: '2026-09-11T09:30:00-04:00',
  })
})
