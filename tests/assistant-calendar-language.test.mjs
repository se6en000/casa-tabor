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
  assert.equal(parseCalendarLanguage('Do we have any conflicts on Monday?')?.intent, 'calendar.availability')
  assert.equal(parseCalendarLanguage('How many meetings are there next week?')?.intent, 'calendar.count')
  assert.equal(parseCalendarLanguage('What do I have coming up?')?.intent, 'calendar.next')
  assert.equal(parseCalendarLanguage('Where do I need to go tomorrow?')?.intent, 'calendar.destinations')
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
})

test('non-calendar language remains outside the deterministic contract', () => {
  for (const text of ['Tell me a joke', 'Will it rain tomorrow?', 'How do I cook pasta?', 'Find a nearby restaurant']) {
    assert.equal(parseCalendarLanguage(text), null, text)
  }
  assert.equal(isCalendarLikeLanguage('Can you show my schedule later?'), true)
  assert.equal(isCalendarLikeLanguage('Explain photosynthesis'), false)
})
