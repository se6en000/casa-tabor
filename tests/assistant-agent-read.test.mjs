import assert from 'node:assert/strict'
import test from 'node:test'

import {
  executeAgentReadTool,
  formatAgentReadResult,
} from '../supabase/functions/_shared/assistant-agent-read.mjs'

const events = [
  {
    id: 'event-1',
    title: 'Dentist appointment',
    start_time: '2026-07-16T14:00:00.000Z',
    end_time: '2026-07-16T15:00:00.000Z',
    updated_at: 'v1',
    location_name: 'Family Dentist',
    all_day: false,
    event_members: [{ family_members: { name: 'Jake' } }],
  },
  {
    id: 'event-2',
    title: 'Swim practice',
    start_time: '2026-07-18T14:00:00.000Z',
    end_time: '2026-07-18T15:00:00.000Z',
    all_day: false,
    event_members: [],
  },
]

test('calendar range reads use authoritative overlap semantics', () => {
  const result = executeAgentReadTool('calendar.get_range', {
    start: '2026-07-16T00:00:00-04:00',
    end: '2026-07-17T00:00:00-04:00',
  }, { events })
  assert.equal(result.supported, true)
  assert.deepEqual(result.events.map((event) => event.id), ['event-1'])
})

test('calendar searches filter title, member, and optional explicit range', () => {
  const result = executeAgentReadTool('calendar.search', {
    query: 'dentist',
    member_name: 'jake',
    start: '2026-07-16T00:00:00-04:00',
    end: '2026-07-17T00:00:00-04:00',
  }, { events })
  assert.deepEqual(result.events.map((event) => event.id), ['event-1'])
})

test('conflict checks ignore the event currently being moved', () => {
  const result = executeAgentReadTool('calendar.check_conflicts', {
    start: '2026-07-16T10:30:00-04:00',
    end: '2026-07-16T11:30:00-04:00',
    ignore_event_id: 'event-1',
  }, { events })
  assert.equal(result.count, 0)
})

test('grocery reads honor checked and list filters', () => {
  const groceryItems = [
    { id: 'milk', list_id: 'main', name: 'Milk', quantity: '2', unit: 'gallons', checked: false },
    { id: 'eggs', list_id: 'main', name: 'Eggs', checked: true },
    { id: 'bread', list_id: 'other', name: 'Bread', checked: false },
  ]
  assert.deepEqual(
    executeAgentReadTool('grocery.get_list', { list_id: 'main' }, { groceryItems }).items.map((item) => item.id),
    ['milk'],
  )
  assert.deepEqual(
    executeAgentReadTool('grocery.get_list', { list_id: 'main', include_checked: true }, { groceryItems }).items.map((item) => item.id),
    ['milk', 'eggs'],
  )
})

test('read results format as concise readable Markdown in local time', () => {
  const result = executeAgentReadTool('calendar.search', { query: 'dentist' }, { events })
  const text = formatAgentReadResult('calendar.search', result, { utcOffset: '-04:00' })
  assert.match(text, /\*\*Dentist appointment\*\*/)
  assert.match(text, /10:00 AM/)
  assert.match(text, /Family Dentist/)
})

test('unsupported capabilities and invalid ranges never fabricate results', () => {
  assert.deepEqual(executeAgentReadTool('recipe.find', {}, {}), {
    supported: false,
    code: 'unsupported_read_tool',
  })
  assert.deepEqual(executeAgentReadTool('calendar.get_range', { start: 'bad', end: 'bad' }, { events }), {
    supported: false,
    code: 'invalid_range',
  })
})
