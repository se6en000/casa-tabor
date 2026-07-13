import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CALENDAR_INTENTS,
  CALENDAR_UTTERANCE_CORPUS,
  isCalendarLikeLanguage,
  parseCalendarLanguage,
} from '../supabase/functions/_shared/assistant-calendar-language.mjs'
import { resolveCalendarSemanticRead } from '../supabase/functions/_shared/assistant-calendar-semantic-read.mjs'

const NOW = new Date('2026-07-11T15:00:00Z')
const options = { now: NOW, utcOffset: '-04:00' }
const events = [
  { id: 'party', title: 'Owen Party', start_time: '2026-07-11T16:30:00Z', end_time: '2026-07-11T18:30:00Z' },
  { id: 'pool', title: 'Pool Party', start_time: '2026-07-12T18:00:00Z', end_time: '2026-07-12T22:00:00Z', location_name: "Uncle Mark's House", address: '1826 4th Place' },
  { id: 'monday-a', title: 'Therapy', start_time: '2026-07-13T13:00:00Z', end_time: '2026-07-13T14:00:00Z' },
  { id: 'monday-b', title: 'School Meeting', start_time: '2026-07-13T13:30:00Z', end_time: '2026-07-13T14:30:00Z' },
]

test('calendar language contract publishes a stable intent ontology', () => {
  assert.ok(CALENDAR_INTENTS.length >= 14)
  assert.equal(new Set(CALENDAR_INTENTS).size, CALENDAR_INTENTS.length)
})

test('generated calendar corpus maps equivalent phrases to semantic frames', () => {
  assert.ok(CALENDAR_UTTERANCE_CORPUS.length >= 80)
  for (const sample of CALENDAR_UTTERANCE_CORPUS) {
    const frame = parseCalendarLanguage(sample.text, {
      activeEntityType: sample.requiresActiveEvent ? 'event' : null,
    })
    assert.equal(frame?.intent, sample.intent, sample.text)
    assert.ok(frame.confidence >= 0.7, sample.text)
  }
})

test('calendar parser supports ordinary flexible read language', () => {
  assert.deepEqual(parseCalendarLanguage('Could you run through my agenda this weekend?')?.slots.temporalScope, { kind: 'weekend' })
  for (const text of [
    "What's going on on Thursday?",
    'What is going on Thursday',
    "What's happening Thursday?",
    'What are we doing Thursday?',
  ]) {
    const frame = parseCalendarLanguage(text)
    assert.equal(frame?.intent, 'calendar.list', text)
    assert.deepEqual(frame?.slots.temporalScope, { kind: 'weekday', weekday: 'thursday' }, text)
  }
  assert.equal(parseCalendarLanguage('Do we have any conflicts on Monday?')?.intent, 'calendar.availability')
  assert.equal(parseCalendarLanguage('How many meetings are there next week?')?.intent, 'calendar.count')
  assert.equal(parseCalendarLanguage('What do I have coming up?')?.intent, 'calendar.next')
  assert.equal(parseCalendarLanguage('Where do I need to go tomorrow?')?.intent, 'calendar.destinations')
})

test('going-on language composes with natural calendar time frames', () => {
  const samples = [
    ['What is going on tomorrow morning?', { kind: 'tomorrow', dayPart: 'morning' }],
    ["What's going on Friday afternoon?", { kind: 'weekday', weekday: 'friday', dayPart: 'afternoon' }],
    ["What's going on next Thursday evening?", { kind: 'weekday', weekday: 'thursday', modifier: 'next', dayPart: 'evening' }],
    ["What's going on the day after tomorrow?", { kind: 'relative_day', daysAhead: 2 }],
    ["What's going on for the next 3 days?", { kind: 'next_days', count: 3 }],
    ["What's going on this month?", { kind: 'month' }],
    ["What's going on next month?", { kind: 'next_month' }],
    ["What's going on July 20th?", { kind: 'date', month: 7, day: 20 }],
    ["What's going on 8/2/2026?", { kind: 'date', month: 8, day: 2, year: 2026 }],
    ["What's going on in August?", { kind: 'named_month', month: 8 }],
    ["What's going on tomorrow at 3:30 pm?", { kind: 'tomorrow', time: { hour: 15, minute: 30 } }],
    ["What's going on Monday through Wednesday?", { kind: 'weekday_range', startWeekday: 'monday', endWeekday: 'wednesday' }],
    ["What's going on July 20th through July 24th?", { kind: 'date_range', start: { month: 7, day: 20 }, end: { month: 7, day: 24 } }],
    ["What's going on from 7/20 to 7/24?", { kind: 'date_range', start: { month: 7, day: 20 }, end: { month: 7, day: 24 } }],
    ["What's going on Thursday between 2 pm and 5 pm?", { kind: 'weekday', weekday: 'thursday', timeRange: { start: { hour: 14, minute: 0 }, end: { hour: 17, minute: 0 } } }],
  ]
  for (const [text, expectedScope] of samples) {
    const parsed = parseCalendarLanguage(text)
    assert.equal(parsed?.intent, 'calendar.list', text)
    assert.deepEqual(parsed?.slots.temporalScope, expectedScope, text)
  }
  assert.equal(parseCalendarLanguage("What's going on?"), null)
})

test('active event follow-ups resolve pronouns without phrase-specific routing', () => {
  const active = { activeEntityType: 'event' }
  assert.equal(parseCalendarLanguage('Where do we need to go?', active)?.intent, 'event.location')
  assert.equal(parseCalendarLanguage('When does it end?', active)?.intent, 'event.time')
  assert.equal(parseCalendarLanguage('Who is going?', active)?.intent, 'event.attendees')
  assert.equal(parseCalendarLanguage('How long will it take?', active)?.slots.ambiguousDuration, true)
})

test('semantic reads execute against authoritative calendar rows', () => {
  const tomorrow = parseCalendarLanguage("What's on my calendar tomorrow?")
  const result = resolveCalendarSemanticRead(tomorrow, events, options)
  assert.deepEqual(result.events.map((event) => event.id), ['pool'])

  const next = resolveCalendarSemanticRead(parseCalendarLanguage("What's next?"), events, options)
  assert.deepEqual(next.events.map((event) => event.id), ['party'])

  const conflicts = resolveCalendarSemanticRead(parseCalendarLanguage('Do we have any conflicts on Monday?'), events, options)
  assert.equal(conflicts.conflicts.length, 1)
  assert.match(conflicts.text, /Monday/)

  const destinations = resolveCalendarSemanticRead(parseCalendarLanguage('Where do I need to go tomorrow?'), events, options)
  assert.match(destinations.text, /1826 4th Place/)

  const thursdayEvents = [
    ...events,
    { id: 'thursday', title: 'Dentist', start_time: '2026-07-16T14:00:00Z', end_time: '2026-07-16T15:00:00Z' },
  ]
  const thursday = resolveCalendarSemanticRead(parseCalendarLanguage("What's going on on Thursday?"), thursdayEvents, options)
  assert.deepEqual(thursday.events.map((event) => event.id), ['thursday'])
  assert.match(thursday.text, /Dentist/)
})

test('calendar time-frame reads filter by day part, date, month, and overlap', () => {
  const expandedEvents = [
    ...events,
    { id: 'friday-morning', title: 'Breakfast', start_time: '2026-07-17T13:00:00Z', end_time: '2026-07-17T14:00:00Z' },
    { id: 'friday-afternoon', title: 'Checkup', start_time: '2026-07-17T18:00:00Z', end_time: '2026-07-17T19:00:00Z' },
    { id: 'july-20', title: 'Camp', start_time: '2026-07-20T14:00:00Z', end_time: '2026-07-20T15:00:00Z' },
    { id: 'august', title: 'Vacation', start_time: '2026-08-02T13:00:00Z', end_time: '2026-08-06T21:00:00Z' },
    { id: 'overlap', title: 'Long Trip', start_time: '2026-07-15T13:00:00Z', end_time: '2026-07-18T21:00:00Z' },
  ]
  const fridayAfternoon = resolveCalendarSemanticRead(
    parseCalendarLanguage("What's going on Friday afternoon?"),
    expandedEvents,
    options,
  )
  assert.deepEqual(fridayAfternoon.events.map((event) => event.id), ['overlap', 'friday-afternoon'])

  const july20 = resolveCalendarSemanticRead(parseCalendarLanguage("What's going on July 20th?"), expandedEvents, options)
  assert.deepEqual(july20.events.map((event) => event.id), ['july-20'])

  const august = resolveCalendarSemanticRead(parseCalendarLanguage("What's going on in August?"), expandedEvents, options)
  assert.deepEqual(august.events.map((event) => event.id), ['august'])

  const dateRange = resolveCalendarSemanticRead(parseCalendarLanguage("What's going on July 15th through July 17th?"), expandedEvents, options)
  assert.deepEqual(dateRange.events.map((event) => event.id), ['overlap', 'friday-morning', 'friday-afternoon'])
})

test('non-calendar language remains outside the deterministic contract', () => {
  for (const text of ['Tell me a joke', 'Will it rain tomorrow?', 'How do I cook pasta?', 'Find a nearby restaurant', 'Add milk to the grocery list']) {
    assert.equal(parseCalendarLanguage(text), null, text)
  }
  assert.equal(isCalendarLikeLanguage('Can you show my schedule later?'), true)
  assert.equal(isCalendarLikeLanguage('Explain photosynthesis'), false)
})
