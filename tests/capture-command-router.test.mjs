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

test('resolveCaptureCommand resolves relative reminder dayparts before execution', () => {
  const result = resolveCaptureCommand('Remind me to pick up my meds this morning at Walgreens', OPTIONS)
  assert.deepEqual(result, {
    status: 'needs_clarification',
    clarification_question: 'I resolved this morning as August 8, 2026. Please repeat the reminder with that exact date to confirm.',
  })
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

test('resolveCaptureCommand asks one clarification when reminder timing is missing', () => {
  const result = resolveCaptureCommand('Remind me to pick up my meds', OPTIONS)
  assert.deepEqual(result, {
    status: 'needs_clarification',
    clarification_question: 'When should I remind you?',
  })
})

test('resolveCaptureCommand resolves relative reminder dates exactly before execution', () => {
  const result = resolveCaptureCommand('Remind me to call the hotel Saturday at 3pm', OPTIONS)
  assert.deepEqual(result, {
    status: 'needs_clarification',
    clarification_question: 'I resolved Saturday as August 15, 2026. Please repeat the reminder with that exact date to confirm.',
  })
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

test('resolveCaptureCommand asks for a date instead of guessing today', () => {
  const result = resolveCaptureCommand('Create dinner at 7pm', OPTIONS)
  assert.deepEqual(result, {
    status: 'needs_clarification',
    clarification_question: 'What date should I create that event for?',
  })
})

test('resolveCaptureCommand resolves relative dates exactly and requires confirmation', () => {
  const result = resolveCaptureCommand('Create dinner with Kelly Saturday at 7pm', OPTIONS)
  assert.deepEqual(result, {
    status: 'needs_clarification',
    clarification_question: 'I resolved Saturday as August 15, 2026. Please repeat the request with that exact date to confirm.',
  })
})

test('resolveCaptureCommand rejects unsupported commands outside quick actions', () => {
  const result = resolveCaptureCommand('Delete my dentist appointment tomorrow', OPTIONS)
  assert.deepEqual(result, {
    status: 'unsupported',
    message: 'Quick Actions can create events, reminders, and grocery items right now.',
  })
})
