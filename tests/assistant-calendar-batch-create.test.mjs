import assert from 'node:assert/strict'
import test from 'node:test'

import { enrichBatchCandidates } from '../supabase/functions/_shared/assistant-calendar-batch-create.mjs'

// Phase 1 of the multi-event create feature (flyer scanning + multi-event text
// prompts, designed together -- see the 2026-09-11 design discussion): both
// input types produce the same "list of candidate events awaiting curation"
// shape, and this is the one piece of that shape which is genuinely
// deterministic/validation work (duplicate detection), not language
// understanding -- reuses the exact same per-event check a single create
// already goes through, rather than inventing new dedupe logic for batches.

const existingEvents = [
  {
    id: 'event-1',
    title: 'Soccer Practice',
    start_time: '2026-09-15T16:00:00-04:00',
    end_time: '2026-09-15T17:00:00-04:00',
    event_type: 'event',
  },
]

test('enriches each candidate with its own duplicate check against existing events', () => {
  const candidates = [
    { title: 'Soccer Practice', start: '2026-09-15T16:00:00-04:00', end: '2026-09-15T17:00:00-04:00', eventType: 'event' },
    { title: 'Piano Lesson', start: '2026-09-16T15:00:00-04:00', end: '2026-09-16T15:30:00-04:00', eventType: 'event' },
  ]

  const enriched = enrichBatchCandidates(candidates, existingEvents)

  assert.equal(enriched[0].duplicate?.status, 'exact_duplicate')
  assert.equal(enriched[1].duplicate, null)
})

test('does not let one candidate\'s duplicate status affect another\'s', () => {
  const candidates = [
    { title: 'Soccer Practice', start: '2026-09-15T16:00:00-04:00', end: '2026-09-15T17:00:00-04:00', eventType: 'event' },
    { title: 'Dentist Appointment', start: '2026-09-17T09:00:00-04:00', end: '2026-09-17T09:30:00-04:00', eventType: 'event' },
    { title: 'Piano Lesson', start: '2026-09-16T15:00:00-04:00', end: '2026-09-16T15:30:00-04:00', eventType: 'event' },
  ]

  const enriched = enrichBatchCandidates(candidates, existingEvents)

  assert.equal(enriched.length, 3)
  assert.equal(enriched[0].duplicate?.status, 'exact_duplicate')
  assert.equal(enriched[1].duplicate, null)
  assert.equal(enriched[2].duplicate, null)
})

test('a reminder-type candidate is checked against reminders, not events, so it does not falsely dedupe against an unrelated event at the same time', () => {
  const candidates = [
    { title: 'Soccer Practice', start: '2026-09-15T16:00:00-04:00', end: '2026-09-15T16:15:00-04:00', eventType: 'reminder' },
  ]

  const enriched = enrichBatchCandidates(candidates, existingEvents)

  assert.equal(enriched[0].duplicate, null)
})

test('a candidate missing an eventType defaults to "event" rather than being dropped or throwing', () => {
  const candidates = [
    { title: 'Field Trip Permission Slip Due', start: '2026-09-18T09:00:00-04:00', end: '2026-09-18T09:15:00-04:00' },
  ]

  const enriched = enrichBatchCandidates(candidates, existingEvents)

  assert.equal(enriched.length, 1)
  assert.equal(enriched[0].eventType, 'event')
})

test('preserves every original candidate field (title/start/end/eventType) unchanged alongside the new duplicate field', () => {
  const candidates = [
    { title: 'Piano Lesson', start: '2026-09-16T15:00:00-04:00', end: '2026-09-16T15:30:00-04:00', eventType: 'event', members: ['Leo'] },
  ]

  const enriched = enrichBatchCandidates(candidates, existingEvents)

  assert.equal(enriched[0].title, 'Piano Lesson')
  assert.equal(enriched[0].start, '2026-09-16T15:00:00-04:00')
  assert.equal(enriched[0].end, '2026-09-16T15:30:00-04:00')
  assert.deepEqual(enriched[0].members, ['Leo'])
  assert.ok('duplicate' in enriched[0])
})

test('an empty candidate list returns an empty array', () => {
  assert.deepEqual(enrichBatchCandidates([], existingEvents), [])
})
