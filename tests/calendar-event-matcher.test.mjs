import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeEventTokens,
  isFuzzyEventTitleMatch,
  findMatchingCalendarEvent,
  isItemAlreadyScheduled,
} from '../src/utils/calendarEventMatcher.ts'

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
