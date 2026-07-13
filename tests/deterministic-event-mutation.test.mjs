import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveDeterministicEventMutation } from '../supabase/functions/_shared/deterministic-event-mutation.mjs'

const events = [
  {
    id: 'therapy-monday',
    title: 'Owen | ABA Therapy Drop Off',
    start_time: '2026-07-13T12:00:00.000Z',
    end_time: '2026-07-13T12:30:00.000Z',
    updated_at: '2026-07-02T14:30:45.920493+00:00',
  },
  {
    id: 'therapy-tuesday',
    title: 'Owen | ABA Therapy Drop Off',
    start_time: '2026-07-14T12:00:00.000Z',
    end_time: '2026-07-14T12:30:00.000Z',
    updated_at: '2026-07-02T14:30:45.920493+00:00',
  },
  {
    id: 'therapy-next-monday',
    title: 'Owen | ABA Therapy Drop Off',
    start_time: '2026-07-20T12:00:00.000Z',
    end_time: '2026-07-20T12:30:00.000Z',
    updated_at: '2026-07-02T14:30:45.920493+00:00',
  },
]
const options = { now: new Date('2026-07-11T13:00:00.000Z'), utcOffset: '-04:00' }

test('moves one date-scoped event while preserving duration and concurrency', () => {
  const result = resolveDeterministicEventMutation(
    'Move Owen ABA Therapy Drop Off on Monday to 9:00 AM.',
    events,
    options,
  )
  assert.equal(result?.tool, 'update_event')
  assert.deepEqual(result?.args, {
    id: 'therapy-monday',
    expected_updated_at: '2026-07-02T14:30:45.920493+00:00',
    start: '2026-07-13T13:00:00.000Z',
    end: '2026-07-13T13:30:00.000Z',
  })
})

test('supports find-then-move production phrasing', () => {
  const result = resolveDeterministicEventMutation(
    'Find Owen ABA Therapy Drop Off on Monday and move it to 9:00 AM.',
    events,
    options,
  )
  assert.equal(result?.args.id, 'therapy-monday')
})

test('supports quoted move phrasing with relative day in destination time', () => {
  const result = resolveDeterministicEventMutation(
    'Move "Owen | ABA Therapy Drop Off" on Monday to 9:00 AM.',
    events,
    options,
  )
  assert.equal(result?.tool, 'update_event')
  assert.equal(result?.args.id, 'therapy-monday')
})

test('refuses ambiguous moves without a date', () => {
  assert.equal(
    resolveDeterministicEventMutation('Move Owen ABA Therapy Drop Off to 9:00 AM.', events, options),
    null,
  )
})

test('resolves a singular destructive action but refuses bulk language', () => {
  const singular = resolveDeterministicEventMutation(
    'Delete Owen ABA Therapy Drop Off on Monday',
    events,
    options,
  )
  assert.deepEqual(singular?.args, { id: 'therapy-monday', title: 'Owen | ABA Therapy Drop Off' })
  assert.equal(
    resolveDeterministicEventMutation('Delete all Owen ABA Therapy Drop Off', events, options),
    null,
  )
})

test('supports quoted delete phrasing with calendar suffix', () => {
  const result = resolveDeterministicEventMutation(
    'Delete the event "Owen | ABA Therapy Drop Off" on Monday from my calendar.',
    events,
    options,
  )
  assert.deepEqual(result?.args, { id: 'therapy-monday', title: 'Owen | ABA Therapy Drop Off' })
})

test('refuses weak title matches', () => {
  assert.equal(resolveDeterministicEventMutation('Delete appointment on Monday', events, options), null)
})

test('creates an explicit named event with bounded defaults', () => {
  const result = resolveDeterministicEventMutation(
    'Create an event called Dentist on 2026-07-15 at 3 PM for Owen',
    events,
    { ...options, familyNames: ['Owen', 'Liv'] },
  )
  assert.deepEqual(result, {
    tool: 'create_event',
    args: {
      title: 'Dentist',
      start: '2026-07-15T19:00:00.000Z',
      end: '2026-07-15T20:00:00.000Z',
      members: ['Owen'],
      event_type: 'event',
    },
    event: null,
  })
})

test('refuses create commands without an explicit title, date, or meridiem', () => {
  for (const input of [
    'Create an event tomorrow at 3 PM',
    'Create an event called Dentist at 3 PM',
    'Create an event called Dentist tomorrow at 3',
  ]) {
    assert.equal(resolveDeterministicEventMutation(input, events, options), null)
  }
})
