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

test('calendar range and search reads include nominal all-day spans', () => {
  const allDay = {
    id: 'all-day-sunday',
    title: 'Family beach weekend',
    start_time: '2026-07-18T04:00:00.000Z',
    end_time: '2026-07-19T03:59:59.000Z',
    all_day: true,
  }
  const args = {
    start: '2026-07-19T00:00:00-04:00',
    end: '2026-07-20T00:00:00-04:00',
    utc_offset: '-04:00',
  }
  assert.deepEqual(
    executeAgentReadTool('calendar.get_range', args, { events: [allDay] }).events.map((event) => event.id),
    ['all-day-sunday'],
  )
  assert.deepEqual(
    executeAgentReadTool('calendar.search', { ...args, query: 'beach' }, { events: [allDay] }).events.map((event) => event.id),
    ['all-day-sunday'],
  )
})

test('calendar reads separate direct results from helpful same-day context', () => {
  const result = executeAgentReadTool('calendar.get_range', {
    start: '2026-07-16T00:00:00-04:00',
    end: '2026-07-17T00:00:00-04:00',
    primary_start: '2026-07-16T12:00:00-04:00',
    primary_end: '2026-07-16T20:00:00-04:00',
  }, {
    events: [
      ...events,
      {
        id: 'event-afternoon',
        title: 'Afternoon appointment',
        start_time: '2026-07-16T18:00:00.000Z',
        end_time: '2026-07-16T19:00:00.000Z',
        all_day: false,
      },
      {
        id: 'event-late',
        title: 'Late pickup',
        start_time: '2026-07-17T01:00:00.000Z',
        end_time: '2026-07-17T02:00:00.000Z',
        all_day: false,
      },
    ],
  })
  assert.deepEqual(result.primaryEvents.map((event) => event.id), ['event-afternoon'])
  assert.deepEqual(result.contextEvents.map((event) => event.id), ['event-1', 'event-late'])
  const text = formatAgentReadResult('calendar.get_range', result, {
    utcOffset: '-04:00',
    scopeLabel: 'Thursday afternoon',
  })
  assert.match(text, /Afternoon appointment/)
  assert.match(text, /Also on that day/)
  assert.match(text, /Late pickup/)
  assert.doesNotMatch(text, /Dentist appointment/)
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

test('natural reminder searches match enriched titles without literal phrase overlap', () => {
  const reminder = {
    id: 'dentist-reminder',
    title: 'Tabor Family | Schedule Dentist Appointment',
    start_time: '2026-07-15T13:00:00.000Z',
    end_time: '2026-07-15T13:30:00.000Z',
    event_type: 'reminder',
    all_day: false,
  }

  for (const query of ['dentist reminder', 'find my dentist reminder']) {
    const result = executeAgentReadTool('calendar.search', { query }, { events: [reminder] })
    assert.deepEqual(result.events.map((event) => event.id), ['dentist-reminder'], query)
  }
})

test('type-only reminder searches return reminders without matching the word in the title', () => {
  const reminder = {
    id: 'laundry-reminder',
    title: 'Switch the laundry',
    start_time: '2026-07-15T13:00:00.000Z',
    end_time: '2026-07-15T13:30:00.000Z',
    event_type: 'reminder',
    all_day: false,
  }
  const appointment = { ...reminder, id: 'laundry-event', event_type: 'event' }
  const result = executeAgentReadTool('calendar.search', {
    query: 'show my reminders',
  }, { events: [appointment, reminder] })
  assert.deepEqual(result.events.map((event) => event.id), ['laundry-reminder'])
})

test('calendar exact reads use authoritative active identity', () => {
  const result = executeAgentReadTool('calendar.get_event', {
    id: 'event-1',
  }, { events })
  assert.deepEqual(result.events.map((event) => event.id), ['event-1'])
})

test('multi-day all-day reads describe the complete inclusive date range', () => {
  const result = executeAgentReadTool('calendar.get_event', {
    id: 'staycation',
  }, {
    events: [{
      id: 'staycation',
      title: 'Family Staycation',
      start_time: '2026-08-10T00:00:00-04:00',
      end_time: '2026-08-15T00:00:00-04:00',
      all_day: true,
    }],
  })
  const text = formatAgentReadResult('calendar.get_event', result, { utcOffset: '-04:00' })
  assert.match(text, /Mon, Aug 10 through Fri, Aug 14, all day/)
})

test('conflict checks ignore the event currently being moved', () => {
  const result = executeAgentReadTool('calendar.check_conflicts', {
    start: '2026-07-16T10:30:00-04:00',
    end: '2026-07-16T11:30:00-04:00',
    ignore_event_id: 'event-1',
  }, { events })
  assert.equal(result.count, 0)
})

test('all-day context does not create a clock-time conflict', () => {
  const result = executeAgentReadTool('calendar.check_conflicts', {
    start: '2026-07-19T15:00:00-04:00',
    end: '2026-07-19T16:00:00-04:00',
    utc_offset: '-04:00',
  }, {
    events: [{
      id: 'all-day',
      title: 'Family beach day',
      start_time: '2026-07-19T00:00:00Z',
      end_time: '2026-07-19T23:59:59Z',
      all_day: true,
    }],
  })

  test('reminders are searchable but never create appointment conflicts', () => {
    const reminder = {
      id: 'reminder-1',
      title: 'Call the dentist',
      start_time: '2026-07-16T14:00:00.000Z',
      end_time: '2026-07-16T14:30:00.000Z',
      event_type: 'reminder',
      all_day: false,
    }
    const search = executeAgentReadTool('calendar.search', {
      query: 'dentist',
      event_type: 'reminder',
    }, { events: [events[0], reminder] })
    assert.deepEqual(search.events.map((event) => event.id), ['reminder-1'])

    const conflicts = executeAgentReadTool('calendar.check_conflicts', {
      start: '2026-07-16T10:00:00-04:00',
      end: '2026-07-16T10:30:00-04:00',
    }, { events: [reminder] })
    assert.deepEqual(conflicts.events, [])
  })
  assert.deepEqual(result.events, [])
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

test('grocery reads can select one authoritative item for follow-up grounding', () => {
  const result = executeAgentReadTool('grocery.get_list', {
    query: 'barista oat milk',
    include_checked: true,
  }, {
    groceryItems: [
      { id: 'oat', name: 'Barista oat milk', quantity: '1', updated_at: 'v1', checked: false },
      { id: 'eggs', name: 'Quail eggs', checked: false },
    ],
  })
  assert.equal(result.count, 1)
  assert.equal(result.items[0].id, 'oat')
  assert.equal(result.items[0].updated_at, 'v1')
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
