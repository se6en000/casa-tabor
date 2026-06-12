import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildValidatedUpdatePayload,
  normalizeOptionalText,
  normalizeStringList,
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
    location: '  ',
    notes: '',
    what_to_bring: [' water bottle ', ' snacks '],
    checklist_items: [{ id: 'c1', label: ' Socks ', note: '', checked: true }],
    action_items: [{ title: ' Text coach ', description: ' ', completed: false }],
  })

  assert.deepEqual(errors, [])
  assert.equal(normalized.eventUpdates.location_name, null)
  assert.equal(normalized.enrichmentUpdates.prep_notes, null)
  assert.deepEqual(normalized.enrichmentUpdates.what_to_bring, ['water bottle', 'snacks'])
  assert.deepEqual(normalized.checklistItems, [
    { id: 'c1', label: 'Socks', note: null, checked: true, category: undefined },
  ])
  assert.deepEqual(normalized.actionItems, [
    { id: undefined, title: 'Text coach', description: null, due_date: undefined, is_urgent: false, completed: false, assigned_to: undefined },
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
