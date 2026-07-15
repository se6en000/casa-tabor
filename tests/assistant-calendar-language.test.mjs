import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CALENDAR_INTENTS,
  CALENDAR_UTTERANCE_CORPUS,
  inheritCalendarReadScope,
  isCalendarLikeLanguage,
  parseCalendarLanguage,
} from '../supabase/functions/_shared/assistant-calendar-language.mjs'
import {
  calendarRangeForScope,
  resolveCalendarSemanticRead,
} from '../supabase/functions/_shared/assistant-calendar-semantic-read.mjs'

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

test('scope-free calendar read follow-ups inherit the prior time frame', () => {
  const previous = parseCalendarLanguage('Whats happening tomoro afternoon')
  const followUp = parseCalendarLanguage('Any conflicts?')
  assert.deepEqual(
    inheritCalendarReadScope(followUp, previous)?.slots.temporalScope,
    { kind: 'tomorrow', dayPart: 'afternoon' },
  )
  const explicit = parseCalendarLanguage('Any conflicts Monday?')
  assert.deepEqual(
    inheritCalendarReadScope(explicit, previous)?.slots.temporalScope,
    { kind: 'weekday', weekday: 'monday' },
  )
  const omittedEventChallenge = parseCalendarLanguage("There's no softball practice as well")
  assert.equal(omittedEventChallenge?.intent, 'calendar.list')
  assert.deepEqual(
    inheritCalendarReadScope(omittedEventChallenge, previous)?.slots.temporalScope,
    { kind: 'tomorrow', dayPart: 'afternoon' },
  )
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
  assert.equal(parseCalendarLanguage('What does Thursday afternoon look like?')?.intent, 'calendar.list')
  assert.equal(parseCalendarLanguage("Is that the only thing that's happening Thursday afternoon?")?.intent, 'calendar.list')
})

test('production-style day questions and omission challenges stay deterministic', () => {
  const initial = parseCalendarLanguage('what appointments are happening on sunday')
  assert.equal(initial?.intent, 'calendar.list')
  assert.equal(initial?.slots.temporalScope?.weekday, 'sunday')

  const shortFollowUp = parseCalendarLanguage('how about sunday')
  assert.equal(shortFollowUp?.intent, 'calendar.list')
  assert.equal(shortFollowUp?.slots.temporalScope?.weekday, 'sunday')

  const challenge = parseCalendarLanguage("are you sure there's nothing on the calendar on sunday")
  assert.equal(challenge?.intent, 'calendar.list')
  assert.equal(challenge?.slots.temporalScope?.weekday, 'sunday')

  const omission = inheritCalendarReadScope(
    parseCalendarLanguage("there's also some all day appointments that you didn't mention"),
    challenge,
  )
  assert.equal(omission?.intent, 'calendar.list')
  assert.equal(omission?.slots.temporalScope?.weekday, 'sunday')
})

test('natural scheduling, attendee edits, and STT weekdays route to calendar intent', () => {
  assert.equal(
    parseCalendarLanguage('Schedule dinner with Kelly Sunday around six')?.intent,
    'event.create',
  )
  assert.equal(
    parseCalendarLanguage('Add Owen to the dinner event')?.intent,
    'event.edit',
  )
  const sttRead = parseCalendarLanguage('What do we got going on fry day after lunch?')
  assert.equal(sttRead?.intent, 'calendar.list')
  assert.equal(sttRead?.slots.temporalScope?.weekday, 'friday')
})

test('household afternoon agenda scope includes early-evening activities', () => {
  const range = calendarRangeForScope({
    kind: 'weekday',
    weekday: 'thursday',
    dayPart: 'afternoon',
  }, {
    now: new Date('2026-07-14T16:00:00Z'),
    utcOffset: '-04:00',
  })
  assert.equal(range.start, '2026-07-16T16:00:00.000Z')
  assert.equal(range.end, '2026-07-17T00:00:00.000Z')
  assert.equal(range.contextStart, '2026-07-16T04:00:00.000Z')
  assert.equal(range.contextEnd, '2026-07-17T04:00:00.000Z')
})

test('natural activity scheduling maps to event creation', () => {
  for (const text of [
    'Schedule swim practice Friday at 4 PM.',
    'Schedule a swim practice Friday at 4 PM.',
    'Schedule tutoring next Saturday at 8 AM.',
    'Create a Myrtle Beach family trip for me and Giselle from August 2 thru August 6.',
  ]) {
    assert.equal(parseCalendarLanguage(text)?.intent, 'event.create', text)
  }
})

test('calendar moves expose explicit requested local clock time', () => {
  const frame = parseCalendarLanguage('Move it to 6:30 PM that same day.', {
    activeEntityType: 'event',
  })
  assert.equal(frame?.intent, 'event.move')
  assert.deepEqual(frame?.slots.requestedTime, { hour: 18, minute: 30 })
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
  assert.match(result.text, /\n- \d{1,2}:\d{2} [AP]M — Pool Party/)

  const next = resolveCalendarSemanticRead(parseCalendarLanguage("What's next?"), events, options)
  assert.deepEqual(next.events.map((event) => event.id), ['party'])

  const conflicts = resolveCalendarSemanticRead(parseCalendarLanguage('Do we have any conflicts on Monday?'), events, options)
  assert.equal(conflicts.conflicts.length, 1)
  assert.match(conflicts.text, /Monday/)

  const destinationEvents = [
    ...events,
    { id: 'home', title: 'Movie Night', start_time: '2026-07-12T23:00:00Z', end_time: '2026-07-13T01:00:00Z' },
  ]
  const destinations = resolveCalendarSemanticRead(parseCalendarLanguage('Where do I need to go tomorrow?'), destinationEvents, options)
  assert.deepEqual(destinations.events.map((event) => event.id), ['pool'])
  assert.match(destinations.text, /1826 4th Place/)
  assert.match(destinations.text, /\n- \d{1,2}:\d{2} [AP]M — Pool Party/)
  assert.doesNotMatch(destinations.text, /Movie Night|no destination is saved/)

  const noDestinations = resolveCalendarSemanticRead(
    parseCalendarLanguage('Where do I need to go tomorrow?'),
    destinationEvents.filter((event) => event.id === 'home'),
    options,
  )
  assert.deepEqual(noDestinations.events, [])
  assert.match(noDestinations.text, /do not have any calendar destinations tomorrow/)

  const thursdayEvents = [
    ...events,
    { id: 'thursday', title: 'Dentist', start_time: '2026-07-16T14:00:00Z', end_time: '2026-07-16T15:00:00Z' },
  ]
  const thursday = resolveCalendarSemanticRead(parseCalendarLanguage("What's going on on Thursday?"), thursdayEvents, options)
  assert.deepEqual(thursday.events.map((event) => event.id), ['thursday'])
  assert.match(thursday.text, /Dentist/)
})

test('semantic day reads include all-day spans anchored by nominal dates', () => {
  const result = resolveCalendarSemanticRead(
    parseCalendarLanguage("What's going on on Sunday?"),
    [{
      id: 'all-day-sunday',
      title: 'Family beach weekend',
      start_time: '2026-07-18T04:00:00.000Z',
      end_time: '2026-07-19T03:59:59.000Z',
      all_day: true,
    }],
    {
      now: new Date('2026-07-14T16:00:00.000Z'),
      utcOffset: '-04:00',
    },
  )
  assert.deepEqual(result.events.map((event) => event.id), ['all-day-sunday'])
  assert.match(result.text, /All day — Family beach weekend/)
})

test('semantic partial-day fallback includes useful later same-day context', () => {
  const result = resolveCalendarSemanticRead(
    parseCalendarLanguage('What does Thursday afternoon look like?'),
    [
      {
        id: 'afternoon',
        title: 'Softball practice',
        start_time: '2026-07-16T22:30:00.000Z',
        end_time: '2026-07-17T00:00:00.000Z',
      },
      {
        id: 'late',
        title: 'Late pickup',
        start_time: '2026-07-17T01:15:00.000Z',
        end_time: '2026-07-17T01:45:00.000Z',
      },
    ],
    {
      now: new Date('2026-07-14T16:00:00.000Z'),
      utcOffset: '-04:00',
    },
  )
  assert.deepEqual(result.events.map((event) => event.id), ['afternoon', 'late'])
  assert.match(result.text, /Softball practice/)
  assert.match(result.text, /Later that day:/)
  assert.match(result.text, /Late pickup/)
})

test('all-day context is listed but does not become a clock conflict or next event', () => {
  const allDay = {
    id: 'all-day',
    title: 'Family beach day',
    start_time: '2026-07-13T00:00:00Z',
    end_time: '2026-07-13T23:59:59Z',
    all_day: true,
  }
  const timed = {
    id: 'timed',
    title: 'Dentist',
    start_time: '2026-07-13T15:00:00Z',
    end_time: '2026-07-13T16:00:00Z',
    all_day: false,
  }
  const availability = resolveCalendarSemanticRead(
    parseCalendarLanguage('Do we have any conflicts on Monday?'),
    [allDay, timed],
    options,
  )
  assert.deepEqual(availability.conflicts, [])
  assert.deepEqual(availability.events.map((event) => event.id), ['all-day', 'timed'])

  const next = resolveCalendarSemanticRead(parseCalendarLanguage("What's next?"), [allDay, timed], options)
  assert.deepEqual(next.events.map((event) => event.id), ['timed'])
})

test('timed reminders stay visible but do not affect calendar availability', () => {
  const reminder = {
    id: 'reminder',
    title: 'Call the dentist',
    start_time: '2026-07-13T15:00:00Z',
    end_time: '2026-07-13T15:30:00Z',
    all_day: false,
    event_type: 'reminder',
  }
  const appointment = {
    id: 'appointment',
    title: 'Dentist appointment',
    start_time: '2026-07-13T15:00:00Z',
    end_time: '2026-07-13T16:00:00Z',
    all_day: false,
    event_type: 'event',
  }
  const result = resolveCalendarSemanticRead(
    parseCalendarLanguage('Do we have any conflicts on Monday?'),
    [reminder, appointment],
    options,
  )
  assert.deepEqual(result.events.map((event) => event.id), ['reminder', 'appointment'])
  assert.deepEqual(result.conflicts, [])
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

test('calendar concepts tolerate common typed and STT forms', () => {
  assert.equal(parseCalendarLanguage('alexa whats on my calender tomoro')?.intent, 'calendar.list')
  assert.deepEqual(
    parseCalendarLanguage('hows thurs day looking')?.slots.temporalScope,
    { kind: 'weekday', weekday: 'thursday' },
  )
  assert.equal(
    parseCalendarLanguage('can u move the brthday dinner to thursday at 6')?.intent,
    'event.move',
  )
})
