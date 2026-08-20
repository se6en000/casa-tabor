import assert from 'node:assert/strict'
import test from 'node:test'

process.env.TZ = 'America/New_York'

import {
  extractUserTemporalEvidence,
  validateCalendarTemporalProvenance,
} from '../supabase/functions/_shared/assistant-temporal-evidence.mjs'

import {
  formatEventSpan,
  buildCreatePreviewCopy,
} from '../src/utils/aiConfirmPreview.ts'

test('temporal provenance: extracts multi-day weekday range from natural conversational text', () => {
  const wednesday = new Date('2026-08-19T12:00:00-04:00') // Wednesday Aug 19, 2026
  const evidence = extractUserTemporalEvidence(
    { role: 'user', id: 'msg-1', content: 'Hotel stay from Saturday 3pm to Sunday 11am' },
    { now: wednesday, utcOffset: '-04:00' },
  )

  assert.ok(evidence, 'Should extract evidence')
  assert.equal(evidence.rangeStart, '2026-08-22', 'Start should be upcoming Saturday Aug 22')
  assert.equal(evidence.rangeEnd, '2026-08-23', 'End should be upcoming Sunday Aug 23')
  assert.equal(evidence.resolutionKind, 'relative')
})

test('temporal provenance: extracts multi-day Friday through Sunday weekend trip', () => {
  const wednesday = new Date('2026-08-19T12:00:00-04:00')
  const evidence = extractUserTemporalEvidence(
    { role: 'user', id: 'msg-2', content: 'Weekend trip to Orlando Friday through Sunday' },
    { now: wednesday, utcOffset: '-04:00' },
  )

  assert.ok(evidence)
  assert.equal(evidence.rangeStart, '2026-08-21', 'Start should be Friday Aug 21')
  assert.equal(evidence.rangeEnd, '2026-08-23', 'End should be Sunday Aug 23')
})

test('temporal provenance: extracts explicit multi-day month range', () => {
  const now = new Date('2026-08-19T12:00:00-04:00')
  const evidence = extractUserTemporalEvidence(
    { role: 'user', id: 'msg-3', content: 'The Plymouth South Beach Aug 29 - Aug 30' },
    { now, utcOffset: '-04:00' },
  )

  assert.ok(evidence)
  assert.equal(evidence.rangeStart, '2026-08-29')
  assert.equal(evidence.rangeEnd, '2026-08-30')
  assert.equal(evidence.resolutionKind, 'explicit_range')
})

test('temporal provenance: validates proposed multi-day check-in/out timestamps', () => {
  const provenance = {
    rangeStart: '2026-08-29',
    rangeEnd: '2026-08-30',
    sourceText: 'The Plymouth South Beach Aug 29 - Aug 30',
    resolutionKind: 'explicit_range',
  }

  const validProposed = {
    start: '2026-08-29T15:00:00-04:00', // Saturday 3:00 PM
    end: '2026-08-30T11:00:00-04:00',   // Sunday 11:00 AM
  }

  const result = validateCalendarTemporalProvenance(provenance, validProposed, { utcOffset: '-04:00' })
  assert.equal(result.valid, true)
  assert.equal(result.reason, null)
})

test('formatEventSpan: multi-day timed range displays start date/time and end date/time', () => {
  const span = formatEventSpan({
    start_time: '2026-08-29T15:00:00-04:00',
    end_time: '2026-08-30T11:00:00-04:00',
    all_day: false,
  })

  assert.equal(span, 'Sat, Aug 29 · 3:00 PM → Sun, Aug 30 · 11:00 AM')
})

test('formatEventSpan: single-day timed range displays single date with start and end times', () => {
  const span = formatEventSpan({
    start_time: '2026-08-29T15:00:00-04:00',
    end_time: '2026-08-29T17:00:00-04:00',
    all_day: false,
  })

  assert.equal(span, 'Sat, Aug 29 · 3:00 PM – 5:00 PM')
})

test('buildCreatePreviewCopy: formats multi-day check-in/out preview copy accurately', () => {
  const preview = buildCreatePreviewCopy({
    title: 'The Plymouth South Beach',
    start: '2026-08-29T15:00:00-04:00',
    end: '2026-08-30T11:00:00-04:00',
    location: '336 21st St, Miami Beach, FL',
  })

  assert.equal(preview.heading, 'Ready to add "The Plymouth South Beach"?')
  assert.equal(preview.when, 'Sat, Aug 29 · 3:00 PM → Sun, Aug 30 · 11:00 AM')
  assert.ok(preview.details.some(d => d.includes('Duration: 20 hours')))
})
