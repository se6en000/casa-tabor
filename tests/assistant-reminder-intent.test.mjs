import assert from 'node:assert/strict'
import test from 'node:test'

import {
  explicitReminderCreateRequestForMessages,
  explicitReminderSubject,
  fallbackExplicitRelativeReminderTurn,
  hardenExplicitReminderTurn,
  isExplicitReminderCompletion,
  isExplicitReminderRequest,
  isReminderCompletionFollowUp,
  explicitReminderSearchForMessages,
  explicitReminderSearchOverride,
  reminderCreateClarification,
  resolveExplicitReminderDaypartRange,
} from '../supabase/functions/_shared/assistant-reminder-intent.mjs'

test('natural reminder requests cover common typed and spoken phrasing', () => {
  for (const phrase of [
    'Remind me tomorrow to call the dentist',
    'Set a reminder for tomorrow morning',
    'Create me a reminder to mail the form',
    'Add a reminder for the school payment',
    'Make a reminder to call Mom',
    'Schedule a reminder to change the air filter',
    'Give me a reminder tomorrow afternoon',
    'Send us a reminder to leave',
    'Alert me at 4 PM to get the kids',
    'Notify us tomorrow to bring the forms',
    'Nudge me in an hour to check the oven',
    'I need to be reminded tomorrow morning to reschedule the dentist appointment',
    'I want to remember to buy stamps',
    'I would like to be reminded to call Jake',
    'We have to remember to submit the paperwork',
    "I've gotta remember to charge the tablet",
    'I need a reminder for the prescription',
    "Don't let me forget to return the library books",
    'Make sure I remember to pay the bill',
    'Could you please remind me to take the bins out',
    'Reminder to renew the registration',
    'Please remember to call the school',
  ]) {
    assert.equal(isExplicitReminderRequest(phrase), true, phrase)
  }
})

test('ordinary calendar edits and memory questions are not reminder creates', () => {
  for (const phrase of [
    'Reschedule the dentist appointment tomorrow morning',
    'What do you remember about the dentist?',
    'Show my reminders',
    'Mark that reminder done',
    'Schedule dinner tomorrow',
  ]) {
    assert.equal(isExplicitReminderRequest(phrase), false, phrase)
  }
})

test('underspecified reminder creates ask for missing details instead of inventing them', () => {
  assert.equal(
    reminderCreateClarification('Can you create a reminder?'),
    'Sure — what should I remind you about, and when?',
  )
  assert.equal(
    reminderCreateClarification('Create a reminder for tomorrow morning for me'),
    'What should I remind you about?',
  )
  assert.equal(
    reminderCreateClarification('Remind me to call the dentist'),
    'When should I remind you?',
  )
  assert.equal(
    reminderCreateClarification('Create a reminder for tomorrow at 10 AM to order Walmart groceries'),
    null,
  )
  assert.equal(
    reminderCreateClarification('Remind me at lunch to call the pharmacy'),
    null,
  )
  assert.equal(
    explicitReminderSubject('Create a reminder for tomorrow at 10 AM to order Walmart groceries'),
    'Order Walmart groceries',
  )
  assert.equal(
    explicitReminderSubject('I need a reminder for the prescription'),
    'The prescription',
  )
})

test('vague reminder dayparts resolve to future local times without clarification', () => {
  const morning = resolveExplicitReminderDaypartRange(
    'Remind me to mow the lawn this morning',
    { currentDate: '2026-07-17T06:45:00-04:00', utcOffset: '-04:00' },
  )
  assert.deepEqual(morning, {
    label: 'morning',
    dateReference: { kind: 'today' },
    time: { hour: 9, minute: 0, period: 'am' },
    start: '2026-07-17T09:00:00-04:00',
    end: '2026-07-17T09:30:00-04:00',
  })

  const lunch = resolveExplicitReminderDaypartRange(
    'Remind me at lunch to call the pharmacy',
    { currentDate: '2026-07-17T07:06:00-04:00', utcOffset: '-04:00' },
  )
  assert.equal(lunch.start, '2026-07-17T12:00:00-04:00')
  assert.equal(lunch.dateReference.kind, 'today')

  const laterThisMorning = resolveExplicitReminderDaypartRange(
    'Remind me this morning to switch the laundry',
    { currentDate: '2026-07-17T10:46:00-04:00', utcOffset: '-04:00' },
  )
  assert.equal(laterThisMorning.start, '2026-07-17T11:00:00-04:00')

  const tomorrowMorning = resolveExplicitReminderDaypartRange(
    'Remind me in the morning to switch the laundry',
    { currentDate: '2026-07-17T12:01:00-04:00', utcOffset: '-04:00' },
  )
  assert.equal(tomorrowMorning.start, '2026-07-18T09:00:00-04:00')
  assert.deepEqual(tomorrowMorning.dateReference, { kind: 'tomorrow' })
})

test('vague reminder dayparts preserve explicit future day references', () => {
  const cases = [
    ['tomorrow evening', '2026-07-18T18:00:00-04:00'],
    ['four days from now around noon', '2026-07-21T12:00:00-04:00'],
    ['a week from now at lunch', '2026-07-24T12:00:00-04:00'],
    ['next Thursday morning', '2026-07-23T09:00:00-04:00'],
    ['7/21 in the afternoon', '2026-07-21T15:00:00-04:00'],
  ]
  for (const [timing, expected] of cases) {
    const range = resolveExplicitReminderDaypartRange(
      `Remind me ${timing} to check the schedule`,
      { currentDate: '2026-07-17T07:06:00-04:00', utcOffset: '-04:00' },
    )
    assert.equal(range?.start, expected, timing)
  }
})

test('reminder subjects exclude trailing vague timing language', () => {
  assert.equal(
    explicitReminderSubject('Remind me to mow the lawn this morning'),
    'Mow the lawn',
  )
  assert.equal(
    explicitReminderSubject('Remind me to call the pharmacy at lunch'),
    'Call the pharmacy',
  )
  assert.equal(
    reminderCreateClarification('Remind me to turn on the night light'),
    'When should I remind you?',
  )
  assert.equal(
    resolveExplicitReminderDaypartRange(
      'Remind me to turn on the night light',
      { currentDate: '2026-07-17T07:06:00-04:00', utcOffset: '-04:00' },
    ),
    null,
  )
})

test('reminder clarification follow-ups retain the original reminder intent', () => {
  const completedRequest = explicitReminderCreateRequestForMessages([
    { role: 'user', content: 'Can you create a reminder?' },
    { role: 'assistant', content: 'Sure — what should I remind you about, and when?' },
    { role: 'user', content: 'Tomorrow morning' },
    { role: 'assistant', content: 'What should I remind you about?' },
    { role: 'user', content: 'Call Liv and Emme’s dentist' },
  ])
  assert.equal(
    completedRequest,
    'Can you create a reminder? Tomorrow morning to Call Liv and Emme’s dentist',
  )
  assert.equal(reminderCreateClarification(completedRequest), null)

  assert.equal(explicitReminderCreateRequestForMessages([
    { role: 'user', content: 'Show my reminders' },
    { role: 'assistant', content: 'I found two reminders.' },
    { role: 'user', content: 'Schedule a dentist appointment tomorrow' },
  ]), null)
})

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

test('explicit reminder searches deterministically preserve type and user scope', () => {
  assert.deepEqual(explicitReminderSearchOverride('Find my dentist reminder'), {
    event_type: 'reminder',
    query: 'dentist',
    clear_range: true,
  })
  assert.deepEqual(explicitReminderSearchOverride('show my reminders'), {
    event_type: 'reminder',
    query: undefined,
    clear_range: true,
  })
  assert.deepEqual(explicitReminderSearchOverride('What reminders do I have open right now'), {
    event_type: 'reminder',
    query: undefined,
    clear_range: true,
  })
  assert.deepEqual(explicitReminderSearchOverride('find my dentist reminder tomorrow'), {
    event_type: 'reminder',
    query: 'dentist',
    clear_range: false,
  })
  assert.equal(explicitReminderSearchOverride('Remind me tomorrow to call the dentist'), null)
})

test('reminder result corrections retain the preceding authoritative reminder scope', () => {
  assert.deepEqual(explicitReminderSearchForMessages([
    { role: 'user', content: 'What reminders do I have open right now' },
    { role: 'assistant', content: 'I found 4 matching events.' },
    { role: 'user', content: 'These are reminders' },
  ]), {
    event_type: 'reminder',
    query: undefined,
    clear_range: true,
  })
  assert.equal(explicitReminderSearchForMessages([
    { role: 'user', content: 'Show my calendar today' },
    { role: 'assistant', content: 'Two events.' },
    { role: 'user', content: 'These are reminders' },
  ]), null)
})

test('completion follow-ups inherit only authoritative reminder context', () => {
  const reminderList = {
    activeEntityType: 'calendar_clarification',
    candidateEvents: [
      { id: 'one', eventType: 'reminder' },
      { id: 'two', eventType: 'reminder' },
    ],
  }
  assert.equal(isReminderCompletionFollowUp('Mark the first one done', reminderList), true)
  assert.equal(isReminderCompletionFollowUp('Mark them done', reminderList), true)
  assert.equal(isReminderCompletionFollowUp('Mark it done', {
    activeEntityType: 'event',
    eventType: 'reminder',
  }), true)
  assert.equal(isReminderCompletionFollowUp('Mark it done', {
    activeEntityType: 'event',
    eventType: 'event',
  }), false)
})
