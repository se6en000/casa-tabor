import assert from 'node:assert/strict'
import test from 'node:test'

import { assessCalendarCreatePreflight } from '../supabase/functions/_shared/assistant-calendar-create-preflight.mjs'

const existing = {
  id: 'event-1',
  title: 'Dinner at Casa Tua',
  start_time: '2026-08-29T19:00:00-04:00',
  end_time: '2026-08-29T20:00:00-04:00',
  event_type: 'event',
  event_members: [{ family_members: { name: 'Jake' } }, { family_members: { name: 'Kelly' } }],
}

test('preflight suppresses an exact title and start duplicate', () => {
  const result = assessCalendarCreatePreflight([existing], {
    title: ' dinner  at casa tua ',
    start: '2026-08-29T19:00:00-04:00',
    end: '2026-08-29T20:00:00-04:00',
    members: ['Jake'],
    event_type: 'event',
  })

  assert.equal(result.status, 'exact_duplicate')
  assert.equal(result.exactDuplicate.id, 'event-1')
})

test('preflight requires confirmation for a probable duplicate at a nearby time', () => {
  const result = assessCalendarCreatePreflight([existing], {
    title: 'Casa Tua anniversary dinner',
    start: '2026-08-29T19:30:00-04:00',
    end: '2026-08-29T20:30:00-04:00',
    members: ['Jake', 'Kelly'],
    event_type: 'event',
  })

  assert.equal(result.status, 'requires_confirmation')
  assert.deepEqual(result.probableDuplicates.map((event) => event.id), ['event-1'])
})

test('preflight detects assigned-member overlaps even when titles differ', () => {
  const result = assessCalendarCreatePreflight([existing], {
    title: 'Bass Museum',
    start: '2026-08-29T19:30:00-04:00',
    end: '2026-08-29T20:30:00-04:00',
    members: ['Kelly'],
    event_type: 'event',
  })

  assert.equal(result.status, 'requires_confirmation')
  assert.deepEqual(result.conflicts.map((event) => event.id), ['event-1'])
})

test('preflight uses household-wide conflicts when no members are assigned', () => {
  const result = assessCalendarCreatePreflight([existing], {
    title: 'Bass Museum',
    start: '2026-08-29T19:30:00-04:00',
    end: '2026-08-29T20:30:00-04:00',
    members: [],
    event_type: 'event',
  })

  assert.equal(result.status, 'requires_confirmation')
  assert.equal(result.conflicts.length, 1)
})
