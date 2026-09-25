import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { selectNextMove } from '../src/wall/engine/nextMove.ts'
import { describeNextMove, weatherLine, rainChance } from '../src/wall/header.ts'
import { FRIDAY, SATURDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const friday = buildDayPlan({ date: FRIDAY, members, routines, events })
const saturday = buildDayPlan({ date: SATURDAY, members, routines, events })
const describe = (plan, now) => describeNextMove(selectNextMove(plan, now), members, now)

test('before school: who drives where, when to leave, and what the run is', () => {
  const move = describe(friday, at(25, 7, 0))
  assert.equal(move.eyebrow, 'NEXT MOVE · LEAVE BY 7:25')
  assert.equal(move.urgent, false)
  assert.equal(move.driverId, 'jake-id')
  assert.equal(move.title, 'Jake → Palm Beach Public')
  assert.equal(move.detail, 'Drop off Emme & Owen · there by 7:35 · 10 min drive')
  assert.deepEqual([move.ring.value, move.ring.unit], ['25', 'MIN'])
  assert.equal(move.ring.fraction, 25 / 60)
})

test('within 15 minutes of leaving the move turns urgent', () => {
  const move = describe(friday, at(25, 7, 20))
  assert.equal(move.urgent, true)
  assert.equal(move.ring.value, '5')
})

test('a departure hours away is shown in hours', () => {
  const move = describe(friday, at(25, 10, 50))
  assert.equal(move.title, 'Giselle → Palm Beach Public')
  assert.deepEqual([move.ring.value, move.ring.unit], ['3', 'HRS'])
  assert.equal(move.ring.fraction, 1)
})

test('two departures together: the second is mentioned, not hidden', () => {
  const both = routines.map((r) => (r.memberId === 'liv' ? { ...r, startLocal: '07:45' } : r))
  const plan = buildDayPlan({ date: FRIDAY, members, routines: both, events })
  const move = describe(plan, at(25, 7, 0))
  assert.equal(move.also, 'Also leaving: Kelly → Bak Middle School at 7:27')
})

test('on the road: when they arrive, counting down the drive', () => {
  const move = describe(friday, at(25, 7, 30))
  assert.equal(move.eyebrow, 'ON THE ROAD · THERE BY 7:35')
  assert.deepEqual([move.ring.value, move.ring.unit], ['5', 'MIN'])
  assert.equal(move.ring.fraction, 5 / 10)
})

test('a trip nobody is driving says so instead of naming a driver', () => {
  const move = describe(saturday, at(26, 12, 0))
  assert.equal(move.driverId, null)
  assert.equal(move.eyebrow, 'NEEDS A DRIVER · LEAVE BY 12:05')
  assert.equal(move.title, 'Baseball → Ferrin Park Field 1')
})

test('no departures left: nothing to show', () => {
  assert.equal(describe(friday, at(25, 16, 0)), null)
})

test('rain chance is read from the stored forecast text', () => {
  assert.equal(rainChance('Overcast, 86°F, 40% rain chance'), 40)
  assert.equal(rainChance('Sunny, 90°F'), null)
  assert.equal(rainChance(null), null)
})

test('weather is phrased around a plan only when rain is likely during an outing', () => {
  const current = { temp: 74, condition: 'Clear' }
  assert.equal(weatherLine(current, saturday, at(26, 9, 0)), '74° and clear')
  const wet = events.map((e) => (e.id === 'softball' ? { ...e, enrichment: { ...e.enrichment, weather_at_event: 'Rain, 80°F, 60% rain chance' } } : e))
  const plan = buildDayPlan({ date: SATURDAY, members, routines, events: wet })
  assert.equal(weatherLine(current, plan, at(26, 9, 0)), '74° and clear · 60% chance of rain at 12:30, Ferrin Park Field 1')
  // Once the outing has started it no longer needs a warning.
  assert.equal(weatherLine(current, plan, at(26, 13, 0)), '74° and clear')
  assert.equal(weatherLine(null, plan, at(26, 9, 0)), '60% chance of rain at 12:30, Ferrin Park Field 1')
})

test('timing is the arrival and drive without the trip name', () => {
  const move = describe(saturday, at(26, 9, 0))
  assert.equal(move.timing, 'starts 12:30 · 29 min drive')
  assert.equal(move.summary, 'Softball: Huskies @ RPB Cascade')
})

test('a pickup that goes straight on says so, and says when it will be late', () => {
  const hangout = {
    id: 'hangout', title: 'Liv and Layla Hangout', event_type: 'event', all_day: false,
    start_time: at(25, 15, 30).toISOString(), end_time: at(25, 18, 0).toISOString(),
    location_name: 'CityPlace', address: '700 S Rosemary Ave, West Palm Beach, FL 33401',
    members: [{ family_member_id: 'liv', role: 'primary' }],
    enrichment: { drive_time_mins: 13, departure_time: null },
    plan_override: { transportation_plan: { legs: [
      { purpose: 'appointment', timing: 'arrive_by', time: '15:30', driverId: 'giselle', driverName: 'Giselle' },
    ] } },
  }
  const now = at(25, 15, 0)
  const plan = buildDayPlan({ date: FRIDAY, members, routines, events: [...events, hangout] })
  const view = describeNextMove(selectNextMove(plan, now), members, now)
  assert.match(view.summary, /^Pick up Liv, then on to CityPlace$/)
  assert.match(view.detail, /about 13 min late at CityPlace/)
})
