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

test('misspelled weekday and relative-day words still resolve as temporal evidence', () => {
  // Bug found via a 50-scenario "harder phrasing" benchmark: exact-match regexes
  // for weekday names and today/tomorrow/tonight have zero typo tolerance, so a
  // real day reference that's just misspelled ("tommorow", "Frdiay", "Wendsday",
  // "Satuday") produces NO temporal evidence at all -- indistinguishable from the
  // user never having mentioned a day -- triggering an unnecessary "what date
  // should I use?" for something a human reader would understand immediately.
  const now = { now: new Date('2026-09-10T23:55:00.000Z'), utcOffset: '-04:00' } // Thursday
  const cases = [
    ['Shedule a dentist apointment for tommorow at 2pm.', '2026-09-11'],
    ['Add a hair cut appointmnet for Frdiay at 10am.', '2026-09-11'],
    ['Put a meetign on for Wendsday at 3.', '2026-09-16'],
    ['Book a vet vist for Satuday at 1pm.', '2026-09-12'],
  ]
  for (const [text, expectedDate] of cases) {
    const evidence = extractUserTemporalEvidence({ id: 'u1', role: 'user', content: text }, now)
    assert.ok(evidence, text)
    assert.equal(evidence.rangeStart, expectedDate, text)
  }
})

test('typo-correction for weekday names does not misfire on unrelated real words', () => {
  const now = { now: new Date('2026-09-10T23:55:00.000Z'), utcOffset: '-04:00' }
  // "sundry" is one edit from "sunday", and "night" is two edits from "tonight"
  // (found via a scratch collision sweep during development, not a hypothetical)
  // -- both are real, common-enough English words that must not get corrected
  // into a false day/relative-day match.
  const sundry = extractUserTemporalEvidence(
    { id: 'u1', role: 'user', content: 'Add a sundry collection of odds and ends to the notes.' },
    now,
  )
  assert.equal(sundry, null)
  const night = extractUserTemporalEvidence(
    { id: 'u2', role: 'user', content: 'The moon was full last night.' },
    now,
  )
  assert.equal(night, null)
})

test('a mealtime/bedtime phrase does not override an explicit weekday mentioned in the same message', () => {
  // Bug: relativeRange checked "at noon/lunch/dinner/bedtime" before ever
  // checking for an explicit weekday, so "Saturday at noon" (or any weekday
  // combined with a mealtime word) resolved to TODAY instead of the stated
  // weekday -- even with perfectly correct spelling, unrelated to the typo fix
  // above. Confirmed live: this caused a real request ("vet visit for next
  // Tuesday at noon") to have its correctly-resolved date rejected as a
  // "mismatch" against evidence that had silently collapsed to today.
  const now = { now: new Date('2026-09-10T23:55:00.000Z'), utcOffset: '-04:00' } // Thursday
  const cases = [
    ['Book a vet visit for Saturday at noon.', '2026-09-12'],
    ['Schedule lunch with Sarah on Monday at lunchtime.', '2026-09-14'],
    // "next Tuesday" here means the Tuesday after the nearest one (Sep 22, not
    // Sep 15) -- this file's existing, consistent convention for "next X"
    // elsewhere (always +7 on top of the nearest occurrence), unrelated to this
    // fix; not asserting a stance on whether that convention itself is ideal.
    ['Put dinner on for next Tuesday at dinnertime.', '2026-09-22'],
  ]
  for (const [text, expectedDate] of cases) {
    const evidence = extractUserTemporalEvidence({ id: 'u1', role: 'user', content: text }, now)
    assert.ok(evidence, text)
    assert.equal(evidence.rangeStart, expectedDate, text)
  }
  // The mealtime/bedtime fallback must still work as a last resort when there's
  // truly no other day reference -- "let's do lunch at noon" alone means today.
  const noOtherSignal = extractUserTemporalEvidence(
    { id: 'u2', role: 'user', content: "Let's do lunch at noon." },
    now,
  )
  assert.equal(noOtherSignal.rangeStart, '2026-09-10')
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
