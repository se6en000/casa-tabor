import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { decisionsFor } from '../src/wall/decisions.ts'
import { FRIDAY, SATURDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const saturday = (list = events) => buildDayPlan({ date: SATURDAY, members, routines, events: list })
const friday = (list = events) => buildDayPlan({ date: FRIDAY, members, routines, events: list })

test('two trips to one park at one time, not already one car: "one car?" with who could take both', () => {
  const [d] = decisionsFor(saturday(), members, at(25, 20, 0))
  assert.equal(d.kind, 'one_car')
  assert.equal(d.text, 'Baseball and Softball are both at Ferrin Park Field 1 at 12:30.')
  assert.equal(d.detail, 'One car could take both, leaving by 11:56.')
  assert.deepEqual(d.answers.map((a) => a.label), ['One trip · Jake', 'Keep two trips'])
  assert.deepEqual(d.answers[0].action, { type: 'drive', driverId: 'jake-id', tripIds: ['event:baseball', 'event:softball'] })
  assert.deepEqual(d.answers[1].action, { type: 'dismiss' })
})

test('a trip already covered by the one-car question isn\'t asked about twice', () => {
  const kinds = decisionsFor(saturday(), members, at(25, 20, 0)).map((d) => d.kind)
  assert.deepEqual(kinds, ['one_car'])
})

test('once "Keep two trips" is chosen, the missing driver is asked for, with the two free drivers', () => {
  const [oneCar] = decisionsFor(saturday(), members, at(25, 20, 0))
  const [d] = decisionsFor(saturday(), members, at(25, 20, 0), new Set([oneCar.key]))
  assert.equal(d.kind, 'no_driver')
  assert.equal(d.text, 'Baseball at 12:30 needs a driver.')
  assert.deepEqual(d.answers.map((a) => a.label), ['Kelly', 'Giselle'])
  assert.deepEqual(d.answers[0].action, { type: 'drive', driverId: 'kelly', tripIds: ['event:baseball'] })
})

test('a driver busy with something else during the trip: hand it to someone free, or keep it', () => {
  const dentist = {
    id: 'dentist', title: 'Giselle dentist', event_type: 'event', all_day: false,
    start_time: at(25, 15, 0).toISOString(), end_time: at(25, 16, 0).toISOString(), location_name: null, address: null,
    members: [{ family_member_id: 'giselle', role: 'primary' }],
  }
  const plan = friday([...events, dentist])
  const d = decisionsFor(plan, members, at(25, 10, 0)).find((x) => x.kind === 'driver_busy')
  assert.equal(d.text, 'Giselle picks up Liv at 3:30 but has Giselle dentist until 4:00.')
  assert.deepEqual(d.answers.map((a) => a.label), ['Hand off to Jake', 'Giselle will manage'])
  assert.equal(d.answers[0].action.driverId, 'jake-id')
})

test('past trips, dismissed questions and settled ones are not asked; at most three, soonest first', () => {
  assert.deepEqual(decisionsFor(saturday(), members, at(26, 13, 0)), [])
  const settled = events.map((e) => (e.id === 'baseball'
    ? { ...e, plan_override: { transportation_plan: { legs: [{ purpose: 'appointment', timing: 'arrive_by', time: '12:30', driverId: 'jake-id', driverName: 'Jake' }] } } }
    : e))
  assert.deepEqual(decisionsFor(saturday(settled), members, at(25, 20, 0)), [])
  assert.deepEqual(decisionsFor(friday(), members, at(25, 7, 0)), [])
})
