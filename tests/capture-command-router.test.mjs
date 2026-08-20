import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveCaptureCommand } from '../supabase/functions/_shared/capture-command-router.mjs'

const NOW = new Date('2026-08-08T14:00:00.000Z')
const OPTIONS = {
  now: NOW,
  utcOffset: '-04:00',
  familyNames: ['Jake', 'Kelly', 'Liv', 'Emme', 'Owen'],
}

test('resolveCaptureCommand parses grocery adds into add_grocery_items tool args', () => {
  const result = resolveCaptureCommand('Add apples, bananas, and 2 avocados to the shopping list', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'add_grocery_items')
  assert.deepEqual(result.args, {
    items: [
      { name: 'apples', category: 'other' },
      { name: 'bananas', category: 'other' },
      { name: 'avocados', quantity: '2', category: 'other' },
    ],
  })
})

test('resolveCaptureCommand resolves relative reminder dayparts directly without clarification', () => {
  const result = resolveCaptureCommand('Remind me to pick up my meds this morning at Walgreens', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'create_event')
  assert.equal(result.args.event_type, 'reminder')
  assert.equal(result.args.title, 'Pick up my meds')
  assert.equal(result.args.location, 'Walgreens')
  assert.equal(result.args.start, '2026-08-08T10:15:00-04:00')
  assert.equal(result.args.end, '2026-08-08T10:30:00-04:00')
  assert.equal(result.args.temporal_provenance?.requiresExactDateConfirmation, false)
})

test('resolveCaptureCommand executes an explicitly dated structured reminder', () => {
  const result = resolveCaptureCommand('Reminder to pick up my meds. Due: 2026-08-09 10:15 AM ET', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'create_event')
  assert.equal(result.args.event_type, 'reminder')
  assert.equal(result.args.title, 'Pick up my meds')
  assert.equal(result.args.start, '2026-08-09T10:15:00-04:00')
  assert.equal(result.args.end, '2026-08-09T10:30:00-04:00')
})

test('resolveCaptureCommand defaults to today when reminder timing is omitted', () => {
  const result = resolveCaptureCommand('Remind me to pick up my meds', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'create_event')
  assert.equal(result.args.event_type, 'reminder')
  assert.equal(result.args.title, 'Pick up my meds')
  assert.equal(result.args.start, '2026-08-08T10:15:00.000-04:00')
  assert.equal(result.args.end, '2026-08-08T10:30:00.000-04:00')
})

test('resolveCaptureCommand asks for subject when reminder intent has no subject', () => {
  const result = resolveCaptureCommand('Can you create a reminder?', OPTIONS)
  assert.deepEqual(result, {
    status: 'needs_clarification',
    clarification_question: 'What should I remind you about?',
  })
})

test('resolveCaptureCommand resolves relative reminder dates directly without confirmation', () => {
  const result = resolveCaptureCommand('Remind me to call the hotel Saturday at 3pm', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'create_event')
  assert.equal(result.args.event_type, 'reminder')
  assert.equal(result.args.title, 'Call the hotel')
  assert.equal(result.args.start, '2026-08-15T15:00:00.000-04:00')
  assert.equal(result.args.end, '2026-08-15T15:15:00.000-04:00')
  assert.equal(result.args.temporal_provenance?.requiresExactDateConfirmation, false)
})

test('resolveCaptureCommand resolves tomorrow reminders directly without confirmation', () => {
  const result = resolveCaptureCommand('remind me to check the pool filter tomorrow at 9am', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'create_event')
  assert.equal(result.args.event_type, 'reminder')
  assert.equal(result.args.title, 'Check the pool filter')
  assert.equal(result.args.start, '2026-08-09T09:00:00.000-04:00')
  assert.equal(result.args.end, '2026-08-09T09:15:00.000-04:00')
  assert.equal(result.args.temporal_provenance?.requiresExactDateConfirmation, false)
})

test('resolveCaptureCommand parses explicitly dated event creates into create_event args', () => {
  const result = resolveCaptureCommand('Create dinner with Kelly on 2026-08-09 at 7pm at Avocado Grill', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'create_event')
  assert.equal(result.args.event_type, 'event')
  assert.equal(result.args.title, 'dinner with Kelly')
  assert.equal(result.args.location, 'Avocado Grill')
  assert.equal(result.args.start, '2026-08-09T19:00:00.000-04:00')
  assert.equal(result.args.end, '2026-08-09T20:00:00.000-04:00')
  assert.deepEqual(result.args.members, ['Kelly'])
})

test('resolveCaptureCommand asks for time when event create is missing one critical slot', () => {
  const result = resolveCaptureCommand('Create soccer practice Tuesday', OPTIONS)
  assert.deepEqual(result, {
    status: 'needs_clarification',
    clarification_question: 'What time should I create that event for?',
  })
})

test('resolveCaptureCommand defaults to today for events when date is omitted', () => {
  const result = resolveCaptureCommand('Create dinner at 7pm', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'create_event')
  assert.equal(result.args.event_type, 'event')
  assert.equal(result.args.title, 'dinner')
  assert.equal(result.args.start, '2026-08-08T19:00:00.000-04:00')
  assert.equal(result.args.end, '2026-08-08T20:00:00.000-04:00')
  assert.equal(result.args.temporal_provenance?.requiresExactDateConfirmation, false)
})

test('resolveCaptureCommand resolves relative event dates directly without confirmation', () => {
  const result = resolveCaptureCommand('Create dinner with Kelly Saturday at 7pm', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'create_event')
  assert.equal(result.args.event_type, 'event')
  assert.equal(result.args.title, 'dinner with Kelly')
  assert.deepEqual(result.args.members, ['Kelly'])
  assert.equal(result.args.start, '2026-08-08T19:00:00.000-04:00')
  assert.equal(result.args.end, '2026-08-08T20:00:00.000-04:00')
  assert.equal(result.args.temporal_provenance?.requiresExactDateConfirmation, false)
})

test('resolveCaptureCommand parses grocery adds with typo in shoppping list', () => {
  const result = resolveCaptureCommand('add apples to the shoppping list', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'add_grocery_items')
  assert.deepEqual(result.args, {
    items: [{ name: 'apples', category: 'other' }],
  })
})

test('resolveCaptureCommand parses spelled-out month appointment for september 9th at 10am', () => {
  const result = resolveCaptureCommand('create an Dr hanna appointment for september 9th at 10am', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'create_event')
  assert.equal(result.args.title, 'Dr hanna appointment')
  assert.equal(result.args.event_type, 'event')
  assert.equal(result.args.start, '2026-09-09T10:00:00.000-04:00')
  assert.equal(result.args.end, '2026-09-09T11:00:00.000-04:00')
})

test('resolveCaptureCommand parses standalone month appointment without create prefix', () => {
  const result = resolveCaptureCommand('Dr Hanna appointment September 9 at 10am', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'create_event')
  assert.equal(result.args.title, 'Dr Hanna appointment')
  assert.equal(result.args.event_type, 'event')
  assert.equal(result.args.start, '2026-09-09T10:00:00.000-04:00')
  assert.equal(result.args.end, '2026-09-09T11:00:00.000-04:00')
})

test('resolveCaptureCommand parses relative tomorrow morning reminder', () => {
  const result = resolveCaptureCommand('remind me tomorrow morning to clean the pool', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'create_event')
  assert.equal(result.args.title, 'Clean the pool')
  assert.equal(result.args.event_type, 'reminder')
  assert.equal(result.args.start, '2026-08-09T09:00:00-04:00')
  assert.equal(result.args.end, '2026-08-09T09:15:00-04:00')
})

test('resolveCaptureCommand attributes target family member in reminder', () => {
  const result = resolveCaptureCommand('remind Owen to pack his cleats tonight', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'create_event')
  assert.equal(result.args.title, 'Pack his cleats')
  assert.deepEqual(result.args.members, ['Owen'])
  assert.equal(result.args.event_type, 'reminder')
  assert.equal(result.args.start, '2026-08-08T20:00:00-04:00')
  assert.equal(result.args.end, '2026-08-08T20:15:00-04:00')
})

test('resolveCaptureCommand attributes target family member Kelly in reminder', () => {
  const result = resolveCaptureCommand('remind Kelly to call Dr Hanna tomorrow at 10am', OPTIONS)
  assert.equal(result.status, 'execute')
  assert.equal(result.tool, 'create_event')
  assert.equal(result.args.title, 'Call Dr Hanna')
  assert.deepEqual(result.args.members, ['Kelly'])
  assert.equal(result.args.event_type, 'reminder')
  assert.ok(result.args.start.startsWith('2026-08-09T10:00:00'))
  assert.ok(result.args.end.startsWith('2026-08-09T10:15:00'))
})

test('resolveCaptureCommand rejects unsupported commands outside quick actions', () => {
  const result = resolveCaptureCommand('Delete my dentist appointment tomorrow', OPTIONS)
  assert.deepEqual(result, {
    status: 'unsupported',
    message: 'Quick Actions can create events, reminders, and grocery items right now.',
  })
})

