import assert from 'node:assert/strict'
import test from 'node:test'

import {
  fallbackExplicitRelativeReminderTurn,
  hardenExplicitReminderTurn,
  isExplicitReminderCompletion,
} from '../supabase/functions/_shared/assistant-reminder-intent.mjs'

test('explicit reminder language cannot be downgraded to an appointment', () => {
  const turn = hardenExplicitReminderTurn({
    action: 'create',
    patch: {
      title: 'Call the dentist',
      date_reference: { kind: 'tomorrow' },
      time: { hour: 8, minute: 0, period: 'am' },
    },
  }, 'Remind me tomorrow at 8 AM to call the dentist.')
  assert.equal(turn.patch.event_type, 'reminder')
  assert.equal(turn.patch.all_day, undefined)
})

test('relative reminder minutes are recovered deterministically from natural language', () => {
  const numeric = hardenExplicitReminderTurn({
    action: 'create',
    patch: { title: 'Switch the laundry' },
  }, 'Remind me in 20 minutes to switch the laundry.')
  assert.equal(numeric.patch.relative_minutes, 20)
  assert.equal(numeric.patch.duration_minutes, undefined)

  const spoken = hardenExplicitReminderTurn({
    action: 'create',
    patch: { title: 'Check the oven' },
  }, 'Set a reminder in twenty five minutes to check the oven.')
  assert.equal(spoken.patch.relative_minutes, 25)
})

test('relative reminders have a bounded deterministic fallback when planning is unavailable', () => {
  assert.deepEqual(
    fallbackExplicitRelativeReminderTurn('Remind me in 20 minutes to switch the laundry.'),
    {
      version: 'calendar-semantic-turn-v1',
      action: 'create',
      patch: {
        title: 'switch the laundry',
        event_type: 'reminder',
        relative_minutes: 20,
      },
    },
  )
  assert.equal(fallbackExplicitRelativeReminderTurn('Schedule laundry tomorrow.'), null)
})

test('date-only reminder language becomes all-day without affecting ordinary events', () => {
  const reminder = hardenExplicitReminderTurn({
    action: 'create',
    patch: { title: 'Mail the form', date_reference: { kind: 'tomorrow' } },
  }, 'Remind me tomorrow to mail the form.')
  assert.equal(reminder.patch.all_day, true)

  const event = { action: 'create', patch: { title: 'Dinner' } }
  assert.equal(hardenExplicitReminderTurn(event, 'Schedule dinner tomorrow.'), event)
})

test('explicit reminder completion cannot be mistaken for grocery check-off', () => {
  assert.equal(isExplicitReminderCompletion('Mark that reminder done.'), true)
  assert.equal(isExplicitReminderCompletion('Check the reminder off.'), true)
  assert.equal(isExplicitReminderCompletion('Mark milk done.'), false)
  assert.equal(
    hardenExplicitReminderTurn({
      action: 'delete',
      targetEntityId: 'reminder-1',
      patch: {},
    }, 'Mark that reminder done.').action,
    'complete',
  )
})
