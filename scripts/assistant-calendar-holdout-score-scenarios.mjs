import { eventConversationState } from '../supabase/functions/_shared/assistant-conversation-grounding.mjs'

export function buildCalendarHoldoutScoreScenarioGroups(fixtures, familyNames = [], now = new Date()) {
  const [firstName = 'Jake', secondName = firstName] = familyNames
  const eventBySuffix = (suffix) => {
    const event = fixtures.find((candidate) => candidate.title.endsWith(suffix))
    if (!event) throw new Error(`Missing calendar holdout fixture: ${suffix}`)
    return event
  }
  const weekdayFor = (event) => new Date(event.start_time)
    .toLocaleDateString('en-US', { weekday: 'long' })
  const group = (key, scoreCategory, steps, conversationState = null) => ({
    key: `holdout-${key}`,
    scoreCategory,
    page: 'calendar',
    assistantMode: 'general',
    ...(conversationState ? { conversationState } : {}),
    steps,
  })
  const active = (suffix) => eventConversationState(eventBySuffix(suffix), now)
  const dentistDay = weekdayFor(eventBySuffix('Dentist appointment'))
  const recurringDay = weekdayFor(eventBySuffix('Recurring softball practice'))

  return [
    group('read-tomorrow', 'read', [
      { text: "Could you show me tomorrow's schedule?", expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1 } },
    ]),
    group('read-complete-day', 'read', [
      {
        text: 'Please give me the complete agenda for the day after tomorrow.',
        expect: {
          type: 'text',
          semanticIntent: 'calendar.list',
          maxLlmCalls: 1,
          containsAll: ['soccer practice', 'vet appointment', 'school open house'],
        },
      },
    ]),
    group('read-next-week', 'read', [
      { text: 'Give me a calendar rundown for next week.', expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1, readable: true } },
    ]),
    group('read-count', 'read', [
      { text: "What's the total number of appointments next week?", expect: { type: 'text' } },
    ]),
    group('read-destinations', 'read', [
      { text: 'Which places are on my schedule the day after tomorrow?', expect: { type: 'text', containsAny: ['sunrise', 'community center'] } },
    ]),
    group('read-conflicts', 'read', [
      { text: `Is anything double-booked on ${dentistDay}?`, expect: { type: 'text' } },
    ]),
    group('read-next', 'read', [
      { text: 'Which appointment comes up first?', expect: { type: 'text' } },
    ]),
    group('read-saturday', 'read', [
      { text: 'How does Saturday look on the calendar?', expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1 } },
    ]),
    group('read-today', 'read', [
      { text: "Run through what's left on today's schedule.", expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1 } },
    ]),
    group('read-morning', 'read', [
      { text: "Show the day after tomorrow's morning calendar.", expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1, containsAll: ['vet appointment'] } },
    ]),
    group('read-member', 'read', [
      { text: `What's on ${secondName}'s calendar this week?`, expect: { type: 'text' } },
    ]),
    group('read-reminders', 'read', [
      { text: "Which calendar reminders haven't been finished?", expect: { type: 'text' } },
    ]),

    group('create-doctor', 'create', [
      { text: 'Put Holdout doctor checkup on tomorrow at 4 PM.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-coffee', 'create', [
      { text: 'I need Holdout breakfast with Mom Friday at 9 AM on the calendar.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-all-day', 'create', [
      { text: 'Make next Saturday an all-day Holdout beach outing.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-trip', 'create', [
      { text: 'Block August 20 through August 23 for Holdout family getaway.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-location', 'create', [
      { text: 'Put Holdout lunch at City Diner on tomorrow at noon.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-duration', 'create', [
      { text: 'Set up Holdout tutoring for Tuesday, 3 PM, lasting 45 minutes.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-overnight', 'create', [
      { text: 'Calendar Holdout airport watch from 11:30 Friday night to 1 AM Saturday.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-member', 'create', [
      { text: `Put Holdout school conference for ${firstName} on Wednesday at 2 PM.`, expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-shorthand', 'create', [
      { text: 'Set a Holdout haircut appointment for next Tuesday at 3 PM.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-photos', 'create', [
      { text: 'I need Holdout school picture day tomorrow at 7 AM on our calendar.', expect: { type: 'write', tool: 'create_event' } },
    ]),

    group('edit-soccer-time', 'edit', [
      { text: 'Bump this appointment to 6 PM.', expect: { type: 'write', tool: 'update_event' } },
    ], active('Soccer practice')),
    group('edit-vet-time', 'edit', [
      { text: 'Set this one for 11 AM instead.', expect: { type: 'write', tool: 'update_event' } },
    ], active('Vet appointment')),
    group('edit-open-house-duration', 'edit', [
      { text: 'Adjust this so it lasts two hours.', expect: { type: 'write', tool: 'update_event' } },
    ], active('School open house')),
    group('edit-dentist-day', 'edit', [
      { text: 'Put this on Sunday at 2 PM instead.', expect: { type: 'write', tool: 'update_event' } },
    ], active('Dentist appointment')),
    group('edit-dinner-location', 'edit', [
      { text: "Set Harbor Grill as this event's location.", expect: { type: 'write', tool: 'update_event' } },
    ], active('Birthday dinner')),
    group('edit-airport-member', 'edit', [
      { text: `Include ${firstName} on this appointment.`, expect: { type: 'write', tool: 'update_event' } },
    ], active('Airport pickup')),
    group('edit-library-title', 'edit', [
      { text: 'Call this Holdout library visit instead.', expect: { type: 'write', tool: 'update_event' } },
    ], active('Library story time')),
    group('edit-recital-day', 'edit', [
      { text: 'Move this appointment one day later.', expect: { type: 'write', tool: 'update_event' } },
    ], active('Piano recital')),
    group('edit-pta-duration', 'edit', [
      { text: 'Give this another half hour.', expect: { type: 'write', tool: 'update_event' } },
    ], active('PTA meeting')),
    group('edit-recurring', 'edit', [
      { text: `Reschedule next ${recurringDay}'s softball practice for 6 PM.`, expect: { type: 'clarify', containsAny: ['one', 'occurrence', 'series'] } },
    ], active('Recurring softball practice')),

    group('cancel-pta', 'cancellation', [
      { text: 'Remove the PTA meeting from the calendar.', expect: { type: 'write', tool: 'delete_event' } },
    ], active('PTA meeting')),
    group('cancel-pickup', 'cancellation', [
      { text: 'Get rid of this appointment.', expect: { type: 'write', tool: 'delete_event' } },
    ], active('School pickup')),
    group('cancel-ambiguous', 'cancellation', [
      { text: `Cancel the edge dentist appointment that falls on ${dentistDay}.`, expect: { type: 'clarify', containsAny: ['which', '10:00', '3:00'] } },
    ]),
    group('cancel-bulk', 'cancellation', [
      { text: 'Remove every edge dentist appointment.', expect: { type: 'write', tool: 'delete_events_by_title' } },
    ]),
    group('cancel-pivot', 'cancellation', [
      { text: 'Take soccer practice off the calendar.', deferAction: true, expect: { type: 'write', tool: 'delete_event' } },
      { text: 'Actually leave it there.', expect: { type: 'limit', notContainsAny: ['deleted', 'cancelled'] } },
    ], active('Soccer practice')),

    group('reminder-pharmacy', 'reminder', [
      { text: 'Set a reminder for 8 AM tomorrow to phone the pharmacy.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('reminder-bins', 'reminder', [
      { text: 'I need a reminder next Thursday evening about putting out the bins.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('reminder-lunch', 'reminder', [
      { text: 'Nudge me at lunchtime tomorrow to sign the school form.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('reminder-list', 'reminder', [
      { text: 'Which reminders are unfinished?', expect: { type: 'text' } },
    ]),
    group('reminder-complete', 'reminder', [
      { text: 'Set a reminder tomorrow at 6 PM for submitting the holdout form.', expect: { type: 'write', tool: 'create_event' } },
      { text: 'Cross that reminder off.', expect: { type: 'write', tool: 'complete_reminder' } },
    ]),

    group('followup-time', 'follow_up', [
      { text: 'When does this one begin?', expect: { type: 'text', containsAny: ['am', 'pm'] } },
    ], active('Dentist appointment')),
    group('followup-location', 'follow_up', [
      { text: "What's the venue for this appointment?", expect: { type: 'text', containsAny: ['sunrise', 'community center'] } },
    ], active('Soccer practice')),
    group('followup-attendees', 'follow_up', [
      { text: 'Which people are attached to this event?', expect: { type: 'text' } },
    ], active('Birthday dinner')),
    group('followup-range-completeness', 'follow_up', [
      { text: 'Show the full schedule for the day after tomorrow.', expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1, containsAll: ['soccer practice', 'vet appointment', 'school open house'] } },
      { text: 'Did anything get omitted?', expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1, containsAll: ['soccer practice', 'vet appointment', 'school open house'] } },
    ]),
    group('followup-duration', 'follow_up', [
      { text: "What's the length of this appointment?", expect: { type: 'text', containsAny: ['hour', 'minute'] } },
    ], active('Airport pickup')),
  ]
}
