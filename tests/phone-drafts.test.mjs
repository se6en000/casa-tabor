import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { clashLines, placeFromLastTime } from '../src/phone/drafts.ts'
import { FRIDAY, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

// Step 5 of the phone rearranged (the UX review's ten moments): every add warns of a clash — the form and the scanner,
// not only Casa — and the place comes from the last time.
const friday = buildDayPlan({ date: FRIDAY, members, routines, events })
const at = (h, m = 0) => new Date(2026, 8, 25, h, m)

test('a clash for anyone going, said the way Casa’s card says it; nothing for a free hour', () => {
  assert.deepEqual(clashLines(friday, ['liv'], at(10), at(11), members), ['Clashes with Bak Middle School (Liv)'])
  assert.deepEqual(clashLines(friday, ['liv'], at(19), at(20), members), [])
  assert.deepEqual(clashLines(friday, [], at(10), at(11), members), [])
  assert.deepEqual(clashLines(null, ['liv'], at(10), at(11), members), [])
})

const past = [
  { title: 'Milo grooming', location_name: 'Happy Tails', address: '12 Pet Way, Jupiter', start_time: '2026-08-20T14:00:00Z' },
  { title: 'Milo grooming', location_name: 'Paws Spa', address: null, start_time: '2026-06-01T14:00:00Z' },
  { title: 'Liv dentist', location_name: 'Smile Dental', address: '1 Tooth St', start_time: '2026-07-10T14:00:00Z' },
  { title: 'Team dinner', location_name: null, address: null, start_time: '2026-09-01T23:00:00Z' },
]
const now = new Date('2026-09-25T14:00:00Z')

test('the place from last time: the newest event with words in common that had a place', () => {
  assert.deepEqual(placeFromLastTime('Pet Grooming Appointment', past, now), { name: 'Happy Tails', address: '12 Pet Way, Jupiter' })
  assert.deepEqual(placeFromLastTime('Dentist cleaning for Owen', past, now), { name: 'Smile Dental', address: '1 Tooth St' })
  assert.equal(placeFromLastTime('Team dinner', past, now), null) // it never had a place
  assert.equal(placeFromLastTime('Piano', past, now), null)
  assert.equal(placeFromLastTime('', past, now), null)
})
