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
    { id: undefined, label: 'water bottle', note: null, checked: false, category: 'bring' },
    { id: undefined, label: 'snacks', note: null, checked: false, category: 'bring' },
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

// Jake's bug report (Oct 5): "Update the address" from a screenshot saved "Dragon Elites batting cages, 1225 S Military
// Trail, …" as the place's name and kept the old address (Lake Lytal Park), so the drive and Directions still went
// there. A new place never keeps the old one's address or pin.
test('a new place with its street address: the name and the address apart, the old pin dropped', () => {
  const { normalized } = buildValidatedUpdatePayload({ id: 'e1', location: 'Dragon Elites batting cages, 1225 S Military Trail, West Palm Beach, FL 33415' })
  assert.equal(normalized.eventUpdates.location_name, 'Dragon Elites batting cages')
  assert.equal(normalized.eventUpdates.address, '1225 S Military Trail, West Palm Beach, FL 33415')
  assert.equal(normalized.eventUpdates.lat, null)
  assert.equal(normalized.eventUpdates.lng, null)
})

test('a new place by name only: the old address goes, so the new one is looked up', () => {
  const { normalized } = buildValidatedUpdatePayload({ id: 'e1', location: 'Dragon Elites' })
  assert.equal(normalized.eventUpdates.location_name, 'Dragon Elites')
  assert.equal(normalized.eventUpdates.address, null)
  assert.equal(normalized.eventUpdates.lat, null)
})

test('a street address on its own is both the place and its address; one said apart is kept as said', () => {
  const bare = buildValidatedUpdatePayload({ id: 'e1', location: '3645 Lake Lytal Park Rd, West Palm Beach, FL' }).normalized.eventUpdates
  assert.equal(bare.location_name, '3645 Lake Lytal Park Rd')
  assert.equal(bare.address, '3645 Lake Lytal Park Rd, West Palm Beach, FL')
  const both = buildValidatedUpdatePayload({ id: 'e1', location: 'Dragon Elites', address: '1225 S Military Trail' }).normalized.eventUpdates
  assert.equal(both.location_name, 'Dragon Elites')
  assert.equal(both.address, '1225 S Military Trail')
  // A name with a number in it isn't a street ("Studio 54", "Route 66 Diner, Palm Beach").
  assert.equal(buildValidatedUpdatePayload({ id: 'e1', location: 'Route 66 Diner, Palm Beach' }).normalized.eventUpdates.location_name, 'Route 66 Diner, Palm Beach')
})

test('"the real address" is not a place (Jake: "U didn’t update the real address. Can u pull it for me")', () => {
  for (const said of ['the real address', 'the address', 'real address', 'that location', 'the actual place']) {
    const { errors } = buildValidatedUpdatePayload({ id: 'e1', location: said })
    assert.ok(errors.length > 0, said)
  }
  assert.deepEqual(buildValidatedUpdatePayload({ id: 'e1', location: 'The Address Boutique Hotel' }).errors, [])
})

test('the place on a yes card is whole; only a very long one is cut, at a word', async () => {
  const { placeOnCard } = await import('../supabase/functions/_shared/ai-event-edit.mjs')
  assert.equal(placeOnCard('Dragon Elites batting cages, 1225 S Military Trail, West Palm Beach, FL 33415'), 'Dragon Elites batting cages, 1225 S Military Trail, West Palm Beach, FL 33415')
  const long = placeOnCard('The Very Long Name of a Community Recreation Center and Aquatics Complex, 12345 Southern Boulevard, Royal Palm Beach, FL 33411')
  assert.ok(long.length <= 91 && long.endsWith('…') && !/\s…$/.test(long), long)
})
