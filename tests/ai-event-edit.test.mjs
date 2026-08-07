import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AI_EVENT_EDIT_LIMITS,
  buildValidatedUpdatePayload,
  normalizeOptionalText,
  normalizeStringList,
  preserveChecklistStateForLegacyBringList,
  RECURRING_EDIT_ERROR,
} from '../supabase/functions/_shared/ai-event-edit.mjs'

test('normalizeOptionalText trims and clears empty strings', () => {
  assert.equal(normalizeOptionalText('  hello  '), 'hello')
  assert.equal(normalizeOptionalText('   '), null)
  assert.equal(normalizeOptionalText(null), null)
  assert.equal(normalizeOptionalText(undefined), undefined)
})

test('normalizeStringList supports arrays and comma/newline strings', () => {
  assert.deepEqual(normalizeStringList([' socks ', 'water']), ['socks', 'water'])
  assert.deepEqual(normalizeStringList('socks,\nwater bottle'), ['socks', 'water bottle'])
  assert.deepEqual(normalizeStringList('   '), [])
})

test('buildValidatedUpdatePayload normalizes clears and list replacement', () => {
  const { errors, normalized } = buildValidatedUpdatePayload({
    id: 'event-1',
    expected_updated_at: '2026-06-11T21:00:00.000Z',
    location: '  ',
    notes: '',
    what_to_bring: [' water bottle ', ' snacks '],
    action_items: [{ title: ' Text coach ', description: ' ', completed: false }],
  })

  assert.deepEqual(errors, [])
  assert.equal(normalized.eventUpdates.location_name, null)
  assert.equal(normalized.enrichmentUpdates.prep_notes, null)
  assert.equal(normalized.enrichmentUpdates.what_to_bring, undefined)
  assert.deepEqual(normalized.checklistItems, [
    { id: undefined, label: 'water bottle', note: null, checked: false, category: undefined },
    { id: undefined, label: 'snacks', note: null, checked: false, category: undefined },
  ])
  assert.deepEqual(normalized.actionItems, [
    { id: undefined, title: 'Text coach', description: null, due_date: undefined, is_urgent: false, completed: false, assigned_to: undefined },
  ])
  assert.equal(normalized.expectedUpdatedAt, '2026-06-11T21:00:00.000Z')
})

test('buildValidatedUpdatePayload preserves explicit structured checklist fields', () => {
  const { errors, normalized } = buildValidatedUpdatePayload({
    id: 'event-1',
    expected_updated_at: '2026-06-11T21:00:00.000Z',
    checklist_items: [{ id: 'c1', label: ' Socks ', note: '', checked: true }],
  })

  assert.deepEqual(errors, [])
  assert.deepEqual(normalized.checklistItems, [
    { id: 'c1', label: 'Socks', note: null, checked: true, category: undefined },
  ])
})

test('legacy what_to_bring replacement preserves matching checklist IDs and checked state', () => {
  const replacement = [
    { id: undefined, label: 'Water bottle', note: null, checked: false, category: undefined },
    { id: undefined, label: 'New towel', note: null, checked: false, category: undefined },
  ]
  const current = [
    { id: 'item-1', label: 'water bottle', note: 'Insulated', checked: true, category: 'gear' },
    { id: 'item-2', label: 'Old towel', note: null, checked: true, category: null },
  ]

  assert.deepEqual(preserveChecklistStateForLegacyBringList(replacement, current), [
    { id: 'item-1', label: 'Water bottle', note: 'Insulated', checked: true, category: 'gear' },
    { id: undefined, label: 'New towel', note: null, checked: false, category: undefined },
  ])
})

test('buildValidatedUpdatePayload rejects invalid categories and dates', () => {
  const { errors } = buildValidatedUpdatePayload({
    id: 'event-1',
    category: 'not-real',
    start: 'bad-date',
    end: 'also-bad',
    action_items: [{ title: '', due_date: 'nope' }],
  })

  assert.ok(errors.some((msg) => msg.includes('category must be one of')))
  assert.ok(errors.includes('start must be an ISO datetime'))
  assert.ok(errors.includes('end must be an ISO datetime'))
  assert.ok(errors.includes('action_items[0].title is required'))
  assert.ok(errors.includes('action_items[0].due_date must be an ISO datetime'))
})

test('recurring edit error message stays explicit', () => {
  assert.match(RECURRING_EDIT_ERROR, /recurring events/i)
  assert.match(RECURRING_EDIT_ERROR, /This event, Future events, or All events/i)
})

test('buildValidatedUpdatePayload rejects unsupported fields and empty edits', () => {
  const { errors } = buildValidatedUpdatePayload({
    id: 'event-1',
    unsupported_field: 'nope',
  })

  assert.ok(errors.includes('Unsupported update_event field: unsupported_field'))
  assert.ok(errors.includes('update_event must include at least one editable field'))
})

test('buildValidatedUpdatePayload accepts validated recurrence coordination metadata', () => {
  const { errors, normalized } = buildValidatedUpdatePayload({
    id: 'event-1',
    expected_updated_at: '2026-07-16T12:00:00.000Z',
    recurrence_scope: 'future',
    expected_series_revision: 8,
    title: 'Updated title',
  })

  assert.deepEqual(errors, [])
  assert.equal(normalized.recurrenceScope, 'future')
  assert.equal(normalized.expectedSeriesRevision, 8)
})

test('buildValidatedUpdatePayload enforces optimistic concurrency timestamp and item limits', () => {
  const { errors, normalized } = buildValidatedUpdatePayload({
    id: 'event-1',
    expected_updated_at: '2026-06-11T21:00:00.000Z',
    what_to_bring: Array.from({ length: AI_EVENT_EDIT_LIMITS.whatToBring + 1 }, (_, index) => `item-${index}`),
    members_add: Array.from({ length: AI_EVENT_EDIT_LIMITS.membersPerAction + 1 }, (_, index) => `Member ${index}`),
  })

  assert.equal(normalized.expectedUpdatedAt, '2026-06-11T21:00:00.000Z')
  assert.ok(errors.includes(`what_to_bring cannot exceed ${AI_EVENT_EDIT_LIMITS.whatToBring} items`))
  assert.ok(errors.includes(`members_add cannot exceed ${AI_EVENT_EDIT_LIMITS.membersPerAction} names`))
})
