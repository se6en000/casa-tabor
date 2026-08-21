import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeEventTokens,
  isFuzzyEventTitleMatch,
  findMatchingCalendarEvent,
  isItemAlreadyScheduled,
  isExpiredEventSuggestion,
  computeDueDateBadge,
} from '../src/utils/calendarEventMatcher.ts'
import {
  extractSmartActionTitle,
  isGenericNewsletterOrFragment,
  detectSuggestedActionBundle,
} from '../src/utils/actionInspectionSynthesis.ts'

test('extractSmartActionTitle extracts clean title from newsletter items', () => {
  const item1 = {
    event_title: 'Kindergarten by the Sea Updates – 8.16.26',
    description: "Your child's first i-Ready Math diagnostic assessment is scheduled for Thursday, August 20. Ensure your child gets a good night's sleep and a healthy breakfast.",
  }
  assert.equal(extractSmartActionTitle(item1), 'i-Ready Math Diagnostic')

  const itemFragment = {
    event_title: 'breakfast.',
    description: "Your child's first i-Ready Math diagnostic assessment is scheduled for Thursday, August 20. Ensure your child gets a good night's sleep and a healthy breakfast.",
  }
  assert.equal(extractSmartActionTitle(itemFragment), 'i-Ready Math Diagnostic')

  const itemVolunteer = {
    event_title: 'Weekly Parent Bulletin',
    description: 'Volunteer to manage the treasure box and birthday gift bags for the kindergarten classroom.',
  }
  assert.equal(extractSmartActionTitle(itemVolunteer), 'Volunteer: Manage the treasure box and birthday gift')

  assert.equal(isGenericNewsletterOrFragment('Kindergarten by the Sea Updates – 8.16.26'), true)
  assert.equal(isGenericNewsletterOrFragment('breakfast.'), true)
  assert.equal(isGenericNewsletterOrFragment('i-Ready Math Diagnostic'), false)
})


test('normalizeEventTokens normalizes math and diagnostic synonyms', () => {
  const tokens1 = normalizeEventTokens('i-Ready Math Diagnostic')
  const tokens2 = normalizeEventTokens('iReady Mathematics Assessment')
  const tokens3 = normalizeEventTokens('Math Testing (i-Ready)')

  assert.ok(tokens1.has('iready'))
  assert.ok(tokens1.has('math'))
  assert.ok(tokens1.has('diagnostic'))

  assert.ok(tokens2.has('iready'))
  assert.ok(tokens2.has('math'))
  assert.ok(tokens2.has('diagnostic'))

  assert.ok(tokens3.has('iready'))
  assert.ok(tokens3.has('math'))
  assert.ok(tokens3.has('diagnostic'))
})

test('isFuzzyEventTitleMatch matches variations of i-Ready Math Diagnostic', () => {
  assert.equal(
    isFuzzyEventTitleMatch('i-Ready Math Diagnostic', 'i-Ready Math Diagnostic'),
    true
  )
  assert.equal(
    isFuzzyEventTitleMatch('i-Ready Math Diagnostic', 'iReady Math Test'),
    true
  )
  assert.equal(
    isFuzzyEventTitleMatch('i-Ready Math Diagnostic', 'Mathematics Assessment (i-Ready)'),
    true
  )
  assert.equal(
    isFuzzyEventTitleMatch('i-Ready Math Diagnostic', 'Bak School Pictures'),
    false
  )
})

test('isFuzzyEventTitleMatch matches School Pictures and Doctor Checkups', () => {
  assert.equal(
    isFuzzyEventTitleMatch('School Pictures (Bak MSOA)', 'Bak Fall Photo Day'),
    true
  )
  assert.equal(
    isFuzzyEventTitleMatch('Dr Hanna Pediatric Checkup', 'Pediatrician Appointment - Dr. Hanna'),
    true
  )
  assert.equal(
    isFuzzyEventTitleMatch('PTO Spirit Day', 'Spirit Day - Palm Beach School'),
    true
  )
})

test('findMatchingCalendarEvent matches on same date and rejects on different dates', () => {
  const calendarEvents = [
    {
      id: 'evt-1',
      title: 'iReady Math Assessment',
      start_time: '2026-08-20T13:00:00.000Z',
    },
    {
      id: 'evt-2',
      title: 'Bak Picture Day',
      start_time: '2026-08-19T08:00:00.000Z',
    },
  ]

  const planMatching = {
    title: 'i-Ready Math Diagnostic',
    date: '2026-08-20',
    displayDate: 'Thursday, Aug 20',
    allDay: true,
  }

  const match = findMatchingCalendarEvent(planMatching, calendarEvents)
  assert.ok(match)
  assert.equal(match.id, 'evt-1')

  const planDifferentDate = {
    title: 'i-Ready Math Diagnostic',
    date: '2026-08-25', // different date!
    displayDate: 'Tuesday, Aug 25',
    allDay: true,
  }

  const noMatch = findMatchingCalendarEvent(planDifferentDate, calendarEvents)
  assert.equal(noMatch, null)
})

test('isItemAlreadyScheduled identifies duplicate prep item against calendar events', () => {
  const calendarEvents = [
    {
      id: 'evt-1',
      title: 'i-Ready Math Assessment',
      start_time: '2026-08-20T12:00:00.000Z',
    },
  ]

  const prepItem = {
    id: 'prep-iready-1',
    type: 'appointment',
    source_type: 'gmail',
    source_pattern_key: 'event_suggestion',
    description: 'Suggested Appointment: i-Ready Math Diagnostic — The first diagnostic assessment for i-Ready Math.',
    event_title: 'i-Ready Math Diagnostic',
    event_date: '2026-08-20T12:00:00.000Z',
    due_by: '2026-08-20T12:00:00.000Z',
    created_at: '2026-08-19T14:00:00Z',
  }

  assert.equal(isItemAlreadyScheduled(prepItem, calendarEvents), true)

  const unrelatedPrep = {
    id: 'prep-unrelated',
    type: 'forms',
    description: 'Sign Bak Middle School Yellow Sheet waiver',
    event_date: '2026-08-20T12:00:00.000Z',
    created_at: '2026-08-19T14:00:00Z',
  }

  assert.equal(isItemAlreadyScheduled(unrelatedPrep, calendarEvents), false)
})

test('isItemAlreadyScheduled identifies match between newsletter prep item and "Iready Inform Testing math" calendar event', () => {
  const calendarEvents = [
    {
      id: 'evt-iready-calendar',
      title: 'Iready Inform Testing math',
      start_time: '2026-08-20T00:00:00.000Z',
    },
  ]

  const newsletterPrepItem = {
    id: 'prep-newsletter-iready',
    type: 'school',
    source_type: 'gmail',
    event_title: 'Kindergarten by the Sea Updates – 8.16.26',
    description: "Your child's first i-Ready Math diagnostic assessment is scheduled for Thursday, August 20. Ensure your child gets a good night's sleep and a healthy breakfast.",
    due_by: '2026-08-20T00:00:00.000Z',
    created_at: '2026-08-19T14:00:00Z',
  }

  assert.equal(isItemAlreadyScheduled(newsletterPrepItem, calendarEvents), true)
})

test('isExpiredEventSuggestion identifies past event suggestions while keeping future/today items active', () => {
  const simulatedToday = new Date(2026, 7, 21, 10, 0, 0) // Friday, Aug 21, 2026

  const pastEventSuggestion = {
    id: 'prep-past-iready',
    type: 'appointment',
    source_type: 'gmail',
    source_pattern_key: 'event_suggestion',
    description: 'Suggested Appointment: i-Ready Math Diagnostic — First diagnostic assessment for i-Ready Math.',
    event_date: '2026-08-20T12:00:00.000Z',
    due_by: '2026-08-20T12:00:00.000Z',
  }
  assert.equal(isExpiredEventSuggestion(pastEventSuggestion, simulatedToday), true)

  const todayEventSuggestion = {
    id: 'prep-today-iready',
    type: 'appointment',
    source_type: 'gmail',
    source_pattern_key: 'event_suggestion',
    description: 'Suggested Appointment: i-Ready Math Diagnostic',
    event_date: '2026-08-21T12:00:00.000Z',
    due_by: '2026-08-21T12:00:00.000Z',
  }
  assert.equal(isExpiredEventSuggestion(todayEventSuggestion, simulatedToday), false)

  const futureEventSuggestion = {
    id: 'prep-future-iready',
    type: 'appointment',
    source_type: 'gmail',
    source_pattern_key: 'event_suggestion',
    description: 'Suggested Appointment: i-Ready Math Diagnostic',
    event_date: '2026-08-28T12:00:00.000Z',
    due_by: '2026-08-28T12:00:00.000Z',
  }
  assert.equal(isExpiredEventSuggestion(futureEventSuggestion, simulatedToday), false)

  const nonSuggestion = {
    id: 'prep-general',
    type: 'forms',
    description: 'General paperwork waiver',
    due_by: '2026-08-20T12:00:00.000Z',
  }
  assert.equal(isExpiredEventSuggestion(nonSuggestion, simulatedToday), false)
})

test('computeDueDateBadge returns truthful badges for overdue, today, tomorrow, and future dates', () => {
  const simulatedToday = new Date(2026, 7, 21, 10, 0, 0) // Aug 21, 2026

  const overdueBadge = computeDueDateBadge('2026-08-20T12:00:00Z', simulatedToday)
  assert.equal(overdueBadge.label, 'Overdue')
  assert.equal(overdueBadge.tone, 'overdue')

  const todayBadge = computeDueDateBadge('2026-08-21T15:00:00Z', simulatedToday)
  assert.equal(todayBadge.label, 'Due Today')
  assert.equal(todayBadge.tone, 'today')

  const tomorrowBadge = computeDueDateBadge('2026-08-22T09:00:00Z', simulatedToday)
  assert.equal(tomorrowBadge.label, 'Due Tomorrow')
  assert.equal(tomorrowBadge.tone, 'tomorrow')

  const futureBadge = computeDueDateBadge('2026-08-28T09:00:00Z', simulatedToday)
  assert.equal(futureBadge.label, 'Due Aug 28')
  assert.equal(futureBadge.tone, 'upcoming')

  const noDateBadge = computeDueDateBadge(null, simulatedToday)
  assert.equal(noDateBadge.label, 'Pending Review')
  assert.equal(noDateBadge.tone, 'none')
})

test('detectSuggestedActionBundle cleanly formats display dates for night-before prep and event', () => {
  const item = {
    id: 'prep-iready-bundle',
    event_title: 'i-Ready Math Diagnostic',
    description: 'First diagnostic assessment for i-Ready Math on August 20.',
    event_date: '2026-08-20',
  }

  const bundle = detectSuggestedActionBundle(item)
  assert.ok(bundle)
  assert.equal(bundle.actions.length, 2)
  assert.equal(bundle.actions[0].displayDate, 'Wed, Aug 19 · 8:00 PM')
  assert.equal(bundle.actions[1].displayDate, 'Thu, Aug 20 · All Day')
})


