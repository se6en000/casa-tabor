import assert from 'node:assert/strict'
import test from 'node:test'

import { pickConflictLoserEventId, shouldSuppressPriorityChipIcon } from '../src/utils/conflictResolution.ts'

const conflict = {
  id: 'conflict-1',
  event_a_id: 'event-a',
  event_b_id: 'event-b',
  conflict_type: 'double_booked',
  severity: 3,
  description: 'Two events overlap',
  resolved: false,
  resolution: null,
  resolved_at: null,
  resolved_by: null,
  created_at: '2026-08-10T12:00:00.000Z',
}

test('pickConflictLoserEventId returns event_b when event_a is kept', () => {
  assert.equal(pickConflictLoserEventId(conflict, 'event-a'), 'event-b')
})

test('pickConflictLoserEventId returns event_a when event_b is kept', () => {
  assert.equal(pickConflictLoserEventId(conflict, 'event-b'), 'event-a')
})

test('pickConflictLoserEventId returns null when the kept id matches neither event', () => {
  assert.equal(pickConflictLoserEventId(conflict, 'event-c'), null)
})

test('pickConflictLoserEventId returns null when there is no second event to reschedule', () => {
  assert.equal(pickConflictLoserEventId({ ...conflict, event_b_id: null }, 'event-a'), null)
})

test('shouldSuppressPriorityChipIcon is true for conflict-sourced items (avoids double AlertTriangle)', () => {
  assert.equal(shouldSuppressPriorityChipIcon({ source_type: 'conflict' }), true)
})

test('shouldSuppressPriorityChipIcon is false for regular prep items and directory suggestions', () => {
  assert.equal(shouldSuppressPriorityChipIcon({ source_type: 'gmail' }), false)
  assert.equal(shouldSuppressPriorityChipIcon({ source_type: 'directory_suggestion' }), false)
  assert.equal(shouldSuppressPriorityChipIcon({ source_type: null }), false)
})
