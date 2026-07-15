import assert from 'node:assert/strict'
import test from 'node:test'

import {
  adaptAgentGroceryUpdate,
  findAgentCalendarDuplicates,
  isAgentCalendarUpdateTargetUnambiguous,
  isAgentGroceryUpdateTargetUnambiguous,
  normalizeAgentGroceryAddArgs,
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

  test('grocery additions normalize spoken counts and discard meal context categories', () => {
    assert.deepEqual(normalizeAgentGroceryAddArgs({
      items: [
        { name: 'bread', category: 'for sandwiches' },
        { name: 'cream cheese', quantity: 'two', unit: 'things' },
      ],
    }), {
      items: [
        { name: 'bread' },
        { name: 'cream cheese', quantity: '2' },
      ],
    })
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

test('grocery updates require an active target or one unique authoritative name', () => {
  const entities = [
    { type: 'grocery_item', id: 'milk-1', name: 'Milk' },
    { type: 'grocery_item', id: 'milk-2', name: ' milk ' },
    { type: 'grocery_item', id: 'eggs-1', name: 'Eggs' },
  ]
  assert.equal(isAgentGroceryUpdateTargetUnambiguous(
    entities,
    { id: 'milk-1' },
    null,
  ), false)
  assert.equal(isAgentGroceryUpdateTargetUnambiguous(
    entities,
    { id: 'milk-1' },
    { type: 'grocery_item', id: 'milk-1' },
  ), true)
  assert.equal(isAgentGroceryUpdateTargetUnambiguous(
    entities,
    { id: 'eggs-1' },
    null,
  ), true)
})

test('grocery updates adapt to trusted legacy quantity and check actions', () => {
  assert.deepEqual(adaptAgentGroceryUpdate({
    id: 'milk-1',
    expected_updated_at: 'v1',
    checked: true,
  }), {
    tool: 'check_grocery_item',
    args: {
      item_id: 'milk-1',
      expected_updated_at: 'v1',
      checked: true,
    },
  })
  assert.deepEqual(adaptAgentGroceryUpdate({
    id: 'milk-1',
    expected_updated_at: 'v1',
    quantity: '2',
    unit: 'gallons',
  }), {
    tool: 'update_grocery_item_quantity',
    args: {
      item_id: 'milk-1',
      expected_updated_at: 'v1',
      quantity: '2',
      unit: 'gallons',
    },
  })
  assert.equal(adaptAgentGroceryUpdate({
    id: 'milk-1',
    checked: true,
    quantity: '2',
  }), null)
})
