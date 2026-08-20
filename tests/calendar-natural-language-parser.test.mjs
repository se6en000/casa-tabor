import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCalendarNaturalLanguage } from '../src/utils/calendarNaturalLanguageParser.ts'

const mockFamily = [
  { id: 'mem-jake', name: 'Jake', role: 'parent', color_hex: '#1B2A4A' },
  { id: 'mem-emme', name: 'Emme', role: 'child', color_hex: '#E87A90' },
  { id: 'mem-owen', name: 'Owen', role: 'child', color_hex: '#4A90E2' },
  { id: 'mem-liv', name: 'Liv', role: 'child', color_hex: '#9B51E0' },
]

const mockPlaces = [
  { id: 'place-amped', name: 'Amped Fitness Signature', aliases: ['Amped', 'Gym'], address: '123 Gym Way' },
  { id: 'place-breakers', name: 'The Breakers', aliases: ['Breakers'], address: '1 S County Rd' },
]

test('parseCalendarNaturalLanguage parses spoken event with time, venue, and attendee', () => {
  const contextDate = new Date('2026-08-21T12:00:00')
  const result = parseCalendarNaturalLanguage(
    'Pickleball at Amped Friday at 9:30 AM with Jake',
    contextDate,
    mockFamily,
    mockPlaces,
  )

  assert.equal(result.eventType, 'event')
  assert.match(result.title, /Pickleball/i)
  assert.match(result.startDT, /T09:30/)
  assert.match(result.endDT, /T10:30/)
  assert.equal(result.allDay, false)
  assert.deepEqual(result.matchedMemberIds, ['mem-jake'])
  assert.equal(result.matchedPlace?.id, 'place-amped')
})

test('parseCalendarNaturalLanguage parses reminder with relative day and time', () => {
  const contextDate = new Date('2026-08-20T12:00:00')
  const result = parseCalendarNaturalLanguage(
    'Remind me to call Bak at 10 AM',
    contextDate,
    mockFamily,
    mockPlaces,
  )

  assert.equal(result.eventType, 'reminder')
  assert.equal(result.title, 'Call Bak')
  assert.match(result.startDT, /T10:00/)
})

test('parseCalendarNaturalLanguage parses all-day event', () => {
  const contextDate = new Date('2026-08-22T12:00:00')
  const result = parseCalendarNaturalLanguage(
    'All day board meeting',
    contextDate,
    mockFamily,
    mockPlaces,
  )

  assert.equal(result.eventType, 'event')
  assert.equal(result.title, 'Board meeting')
  assert.equal(result.allDay, true)
})

test('parseCalendarNaturalLanguage cleans appointment conversational phrasing and generates rich summary', () => {
  const contextDate = new Date('2026-08-20T12:00:00')
  const result = parseCalendarNaturalLanguage(
    'An appointment to go play Pickleball at 8pm for Jake',
    contextDate,
    mockFamily,
    mockPlaces,
  )

  assert.equal(result.eventType, 'event')
  assert.equal(result.title, 'Pickleball')
  assert.match(result.startDT, /T20:00/)
  assert.deepEqual(result.matchedMemberIds, ['mem-jake'])
  assert.match(result.summaryText, /8:00 PM/i)
  assert.match(result.summaryText, /For Jake/i)
})

