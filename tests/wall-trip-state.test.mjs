import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { selectNextMove } from '../src/wall/engine/nextMove.ts'
import { dayKey, dayState, withHandOff, withDeparted, withoutDeparted } from '../src/wall/tripState.ts'
import { FRIDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const plan = (tripState) => buildDayPlan({ date: FRIDAY, members, routines, events, tripState })
const lipickup = (p) => p.trips.find((t) => t.kind === 'pickup' && t.travelerIds.includes('liv'))

test('handing off a school run moves it to the new driver, for that day only', () => {
  const base = plan()
  const id = lipickup(base).id
  const state = withHandOff({}, FRIDAY, id, 'kelly')
  const handed = plan(dayState(state, FRIDAY))
  const trip = lipickup(handed)
  assert.equal(trip.driverId, 'kelly')
  assert.equal(trip.driverSource, 'handoff')
  assert.ok(handed.lanes.get('kelly').some((s) => s.kind === 'drive' && s.tripId === id))
  assert.equal(handed.lanes.get('giselle').some((s) => s.tripId === id), false)
  // Another day is untouched.
  assert.deepEqual(dayState(state, new Date(2026, 8, 28)), { drivers: {}, departed: {}, dismissed: {} })
})

test('"Leaving now" makes the trip en route from the moment it was tapped', () => {
  const base = plan()
  const id = lipickup(base).id // leaves 3:12 for 3:30
  const state = withDeparted({}, FRIDAY, [id], at(25, 15, 5))
  const left = plan(dayState(state, FRIDAY))
  const trip = lipickup(left)
  assert.equal(trip.leaveAt.getTime(), at(25, 15, 5).getTime())
  assert.equal(trip.departedAt.getTime(), at(25, 15, 5).getTime())
  const move = selectNextMove(left, at(25, 15, 6))
  assert.equal(move.status, 'en_route')
  assert.equal(move.trips[0].id, id)
  // Undo puts it back.
  assert.equal(lipickup(plan(dayState(withoutDeparted(state, FRIDAY, [id]), FRIDAY))).departedAt, null)
})

test('state older than a week is dropped when something new is saved', () => {
  const old = withHandOff({}, new Date(2026, 8, 10), 'x', 'kelly')
  const next = withHandOff(old, FRIDAY, 'y', 'jake-id')
  assert.deepEqual(Object.keys(next), [dayKey(FRIDAY)])
})

test('"Leaving now" at the wall\'s own minute is on the road at once (the wall clock is minute-aligned)', () => {
  const base = plan()
  const id = lipickup(base).id
  const wallNow = at(25, 15, 5) // what the minute clock shows, whatever the seconds
  const left = plan(dayState(withDeparted({}, FRIDAY, [id], wallNow), FRIDAY))
  assert.equal(selectNextMove(left, wallNow).status, 'en_route')
})

import { withDismissed } from '../src/wall/tripState.ts'

test('a "keep it as it is" answer is remembered for that day only', () => {
  const state = withDismissed({}, FRIDAY, 'one_car:a+b')
  assert.deepEqual(dayState(state, FRIDAY).dismissed, { 'one_car:a+b': true })
  assert.deepEqual(dayState(state, new Date(2026, 8, 26)).dismissed, {})
})
