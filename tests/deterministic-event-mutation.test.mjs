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

test('creates naturally named scheduled activities without synthetic event wording', () => {
  for (const input of [
    'Schedule swim practice Friday at 4 PM.',
    'Book tutoring Friday at 4 PM.',
    'Add piano lesson Friday at 4 PM.',
  ]) {
    const result = resolveDeterministicEventMutation(input, events, options)
    assert.equal(result?.tool, 'create_event', input)
    assert.ok(result?.args.title, input)
  }
})

test('creates cross-midnight ranges without collapsing their duration', () => {
  const result = resolveDeterministicEventMutation(
    'Add an event called Late airport pickup Friday from 11:30 PM until 1 AM Saturday.',
    events,
    options,
  )
  assert.equal(result?.tool, 'create_event')
  assert.equal(Date.parse(result.args.end) - Date.parse(result.args.start), 90 * 60000)
})

test('prepares selective day clearing while preserving exclusions', () => {
  const mondayEvents = [
    ...events,
    {
      id: 'school-pickup',
      title: 'School pickup',
      start_time: '2026-07-13T19:00:00.000Z',
      end_time: '2026-07-13T19:30:00.000Z',
    },
  ]
  const result = resolveDeterministicEventMutation(
    'Clear my calendar Monday except ABA Therapy Drop Off.',
    mondayEvents,
    options,
  )
  assert.equal(result?.tool, 'delete_events_by_title')
  assert.deepEqual(result?.args.ids, ['school-pickup'])
})

test('refuses create commands without an explicit title or meridiem', () => {
  for (const input of [
    'Create an event tomorrow at 3 PM',
    'Create an event at 3 PM',
    'Create an event called Dentist tomorrow at 3',
  ]) {
    assert.equal(resolveDeterministicEventMutation(input, events, options), null)
  }
})

test('creates event defaulting to today when date is omitted', () => {
  const result = resolveDeterministicEventMutation('Create an event called Dentist at 3 PM', events, options)
  assert.deepEqual(result, {
    tool: 'create_event',
    args: {
      title: 'Dentist',
      start: '2026-07-11T19:00:00.000Z',
      end: '2026-07-11T20:00:00.000Z',
      members: [],
      event_type: 'event',
    },
    event: null,
  })
})

test('regression: structured Title:/Due: draft prompts must not reach the naive create-command matcher', () => {
  // The naive single-line matcher normalizes all whitespace (including
  // newlines) before matching, so a multi-field structured draft like
  // "Create a reminder draft...\n\nTitle: X\nDetails: ...\nDue: ..." collapses
  // into one long line and gets misparsed: garbage title, wrong date pulled
  // from an unrelated date mentioned in Details, and a hardcoded 60-minute
  // duration. The ai-assistant edge function guards against this by skipping
  // this matcher entirely whenever the text contains a "Title:" field
  // (the structured-draft signature) and routing those requests through the
  // dedicated reminder deterministic-date/duration handling instead. This
  // test documents the underlying matcher's behavior so the guard's necessity
  // stays visible even though the guard itself lives in ai-assistant/index.ts.
  const structuredDraft = 'Create a reminder draft for me to confirm.\n\n' +
    'Title: Your Model Y Lease Billing Statement is Available\n' +
    'Details: Your monthly lease payment for the Tesla Model Y is due. ' +
    'Auto-payment will be made on August 27, 2026. The amount is $579.52.\n' +
    'Due: 2026-08-26 8:00 PM ET'
  const result = resolveDeterministicEventMutation(structuredDraft, [], {
    now: new Date('2026-08-05T16:38:00Z'),
    utcOffset: '-04:00',
    familyNames: [],
  })
  // Confirms the naive matcher DOES fire and DOES get it wrong (garbage
  // title, wrong date, 60-minute duration) — proving the edge-function-level
  // guard that skips this matcher for structured drafts is load-bearing.
  assert.equal(result?.tool, 'create_event')
  assert.notEqual(result?.args.title, 'Your Model Y Lease Billing Statement is Available')
  assert.equal(result?.args.start, '2026-08-27T00:00:00.000Z')
  assert.equal(
    (new Date(result.args.end).getTime() - new Date(result.args.start).getTime()) / 60000,
    60,
  )
})
