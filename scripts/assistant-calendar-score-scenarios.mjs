import { eventConversationState } from '../supabase/functions/_shared/assistant-conversation-grounding.mjs'

export function buildCalendarScoreScenarioGroups(fixtures, familyNames = [], now = new Date()) {
  const [firstName = 'Jake', secondName = firstName] = familyNames
  const eventBySuffix = (suffix) => {
    const event = fixtures.find((candidate) => candidate.title.endsWith(suffix))
    if (!event) throw new Error(`Missing calendar score fixture: ${suffix}`)
    return event
  }
  const weekdayFor = (event) => new Date(event.start_time)
    .toLocaleDateString('en-US', { weekday: 'long' })
  const group = (key, scoreCategory, steps, conversationState = null) => ({
    key: `score-${key}`,
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
      { text: "What's on my calendar tomorrow?", expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1 } },
    ]),
    group('read-complete-day', 'read', [
      {
        text: "What's going on the day after tomorrow?",
        expect: {
          type: 'text',
          semanticIntent: 'calendar.list',
          maxLlmCalls: 1,
          containsAll: ['soccer practice', 'vet appointment', 'school open house'],
        },
      },
    ]),
    group('read-next-week', 'read', [
      { text: 'Walk me through everything on the calendar next week.', expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1, readable: true } },
    ]),
    group('read-count', 'read', [
      { text: 'How many appointments do we have next week?', expect: { type: 'text' } },
    ]),
    group('read-destinations', 'read', [
      { text: 'Where do I need to go the day after tomorrow?', expect: { type: 'text', containsAny: ['sunrise', 'community center'] } },
    ]),
    group('read-conflicts', 'read', [
      { text: `Do I have any conflicts on ${dentistDay}?`, expect: { type: 'text' } },
    ]),
    group('read-next', 'read', [
      { text: "What's my next appointment?", expect: { type: 'text' } },
    ]),
    group('read-saturday', 'read', [
      { text: "What's going on Saturday?", expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1 } },
    ]),
    group('read-today', 'read', [
      { text: 'Give me the rest of today.', expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1 } },
    ]),
    group('read-morning', 'read', [
      { text: 'What is happening the day after tomorrow morning?', expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1, containsAll: ['vet appointment'] } },
    ]),
    group('read-member', 'read', [
      { text: `Show me ${secondName}'s appointments this week.`, expect: { type: 'text' } },
    ]),
    group('read-reminders', 'read', [
      { text: 'Show me my open calendar reminders.', expect: { type: 'text' } },
    ]),

    group('create-doctor', 'create', [
      { text: 'Create an appointment called Score doctor visit tomorrow at 4 PM.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-coffee', 'create', [
      { text: 'Add Score coffee with Mom Friday at 9 in the morning.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-all-day', 'create', [
      { text: 'Add an all-day event called Score beach day next Saturday.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-trip', 'create', [
      { text: 'Plan a Score family trip from August 20 through August 23.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-location', 'create', [
      { text: 'Schedule Score lunch tomorrow at noon at City Diner.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-duration', 'create', [
      { text: 'Book Score tutoring Tuesday at 3 PM for 45 minutes.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-overnight', 'create', [
      { text: 'Add Score airport watch Friday from 11:30 PM until 1 AM Saturday.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-member', 'create', [
      { text: `Schedule Score school meeting for ${firstName} Wednesday at 2 PM.`, expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-shorthand', 'create', [
      { text: 'Book Score haircut next Tuesday at 3 PM.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('create-photos', 'create', [
      { text: 'Put Score school photos on the calendar tomorrow at 7 AM.', expect: { type: 'write', tool: 'create_event' } },
    ]),

    group('edit-soccer-time', 'edit', [
      { text: 'Move this to 6 PM.', expect: { type: 'write', tool: 'update_event' } },
    ], active('Soccer practice')),
    group('edit-vet-time', 'edit', [
      { text: 'Change the time to 11 in the morning.', expect: { type: 'write', tool: 'update_event' } },
    ], active('Vet appointment')),
    group('edit-open-house-duration', 'edit', [
      { text: 'Make this two hours long.', expect: { type: 'write', tool: 'update_event' } },
    ], active('School open house')),
    group('edit-dentist-day', 'edit', [
      { text: 'Reschedule it to Sunday at 2 PM.', expect: { type: 'write', tool: 'update_event' } },
    ], active('Dentist appointment')),
    group('edit-dinner-location', 'edit', [
      { text: 'Change the location to Harbor Grill.', expect: { type: 'write', tool: 'update_event' } },
    ], active('Birthday dinner')),
    group('edit-airport-member', 'edit', [
      { text: `Add ${firstName} to this appointment.`, expect: { type: 'write', tool: 'update_event' } },
    ], active('Airport pickup')),
    group('edit-library-title', 'edit', [
      { text: 'Rename it Score library visit.', expect: { type: 'write', tool: 'update_event' } },
    ], active('Library story time')),
    group('edit-recital-day', 'edit', [
      { text: 'Push this back one day.', expect: { type: 'write', tool: 'update_event' } },
    ], active('Piano recital')),
    group('edit-pta-duration', 'edit', [
      { text: 'Extend it by thirty minutes.', expect: { type: 'write', tool: 'update_event' } },
    ], active('PTA meeting')),
    group('edit-recurring', 'edit', [
      { text: `Move softball practice next ${recurringDay} to 6 PM.`, expect: { type: 'clarify', containsAny: ['one', 'occurrence', 'series'] } },
    ], active('Recurring softball practice')),

    group('cancel-pta', 'cancellation', [
      { text: 'Delete the PTA meeting.', expect: { type: 'write', tool: 'delete_event' } },
    ], active('PTA meeting')),
    group('cancel-pickup', 'cancellation', [
      { text: 'Cancel this event.', expect: { type: 'write', tool: 'delete_event' } },
    ], active('School pickup')),
    group('cancel-ambiguous', 'cancellation', [
      { text: `Delete the edge dentist appointment ${dentistDay}.`, expect: { type: 'clarify', containsAny: ['which', '10:00', '3:00'] } },
    ]),
    group('cancel-bulk', 'cancellation', [
      { text: 'Delete all edge dentist appointments.', expect: { type: 'write', tool: 'delete_events_by_title' } },
    ]),
    group('cancel-pivot', 'cancellation', [
      { text: 'Delete soccer practice.', deferAction: true, expect: { type: 'write', tool: 'delete_event' } },
      { text: 'Never mind, keep it.', expect: { type: 'limit', notContainsAny: ['deleted', 'cancelled'] } },
    ], active('Soccer practice')),

    group('reminder-pharmacy', 'reminder', [
      { text: 'Remind me tomorrow at 8 AM to call the pharmacy.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('reminder-bins', 'reminder', [
      { text: 'Remind me next Thursday evening to take out the bins.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('reminder-lunch', 'reminder', [
      { text: 'At lunch tomorrow remind me to sign the school form.', expect: { type: 'write', tool: 'create_event' } },
    ]),
    group('reminder-list', 'reminder', [
      { text: 'What reminders are still open?', expect: { type: 'text' } },
    ]),
    group('reminder-complete', 'reminder', [
      { text: 'Remind me tomorrow at 6 PM to submit the score form.', expect: { type: 'write', tool: 'create_event' } },
      { text: 'Mark that reminder done.', expect: { type: 'write', tool: 'complete_reminder' } },
    ]),

    group('followup-time', 'follow_up', [
      { text: 'What time does this start?', expect: { type: 'text', containsAny: ['am', 'pm'] } },
    ], active('Dentist appointment')),
    group('followup-location', 'follow_up', [
      { text: 'Where is this one?', expect: { type: 'text', containsAny: ['sunrise', 'community center'] } },
    ], active('Soccer practice')),
    group('followup-attendees', 'follow_up', [
      { text: "Who's going to this?", expect: { type: 'text' } },
    ], active('Birthday dinner')),
    group('followup-range-completeness', 'follow_up', [
      { text: 'List everything the day after tomorrow.', expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1, containsAll: ['soccer practice', 'vet appointment', 'school open house'] } },
      { text: "That's it?", expect: { type: 'text', semanticIntent: 'calendar.list', maxLlmCalls: 1, containsAll: ['soccer practice', 'vet appointment', 'school open house'] } },
    ]),
    group('followup-duration', 'follow_up', [
      { text: 'How long does this appointment last?', expect: { type: 'text', containsAny: ['hour', 'minute'] } },
    ], active('Airport pickup')),
  ]
}
