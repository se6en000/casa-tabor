import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findAgentCalendarDuplicates,
  isAgentCalendarUpdateTargetUnambiguous,
} from '../supabase/functions/_shared/assistant-agent-write.mjs'

test('calendar duplicate matching ignores model-derived duration differences', () => {
  const events = [{
    id: 'existing',
    title: '  Swim   Practice ',
    start_time: '2026-07-17T20:00:00.000Z',
    end_time: '2026-07-17T21:00:00.000Z',
  }]
  const matches = findAgentCalendarDuplicates(events, {
    title: 'swim practice',
    start: '2026-07-17T16:00:00-04:00',
    end: '2026-07-17T16:30:00-04:00',
  })
  assert.deepEqual(matches, events)
})

test('calendar duplicate matching preserves distinct starts and titles', () => {
  const events = [
    {
      id: 'different-time',
      title: 'Swim practice',
      start_time: '2026-07-17T21:00:00.000Z',
    },
    {
      id: 'different-title',
      title: 'Piano practice',
      start_time: '2026-07-17T20:00:00.000Z',
    },
  ]
  assert.deepEqual(findAgentCalendarDuplicates(events, {
    title: 'Swim practice',
    start: '2026-07-17T16:00:00-04:00',
    end: '2026-07-17T17:00:00-04:00',
  }), [])
})

test('calendar duplicate matching rejects malformed inputs safely', () => {
  assert.deepEqual(findAgentCalendarDuplicates(null, {}), [])
  assert.deepEqual(findAgentCalendarDuplicates([], { title: 'Swim practice', start: 'Friday' }), [])
})

test('calendar updates require an active target or one unique authoritative title', () => {
  const entities = [
    { type: 'event', id: 'dentist-1', title: 'Dentist appointment' },
    { type: 'event', id: 'dentist-2', title: 'Dentist appointment' },
    { type: 'event', id: 'piano-1', title: 'Piano recital' },
  ]
  assert.equal(isAgentCalendarUpdateTargetUnambiguous(
    entities,
    { id: 'dentist-1' },
    null,
  ), false)
  assert.equal(isAgentCalendarUpdateTargetUnambiguous(
    entities,
    { id: 'dentist-1' },
    { type: 'event', id: 'dentist-1' },
  ), true)
  assert.equal(isAgentCalendarUpdateTargetUnambiguous(
    entities,
    { id: 'piano-1' },
    null,
  ), true)
  assert.equal(isAgentCalendarUpdateTargetUnambiguous(
    entities,
    { id: 'missing' },
    null,
  ), false)
})
