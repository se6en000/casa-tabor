import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { buildTrips } from '../src/wall/engine/travel.ts'
import { tripCoverage, coverageComingUp } from '../src/wall/coverage.ts'
import { members, routines, tripEvents, travelPrefs } from './fixtures/wall-trip-2026-10-07.mjs'

// Jake, 2026-10-01: "oh we should start planning coverage right away. that's the hardest part of traveling is
// aligning help" — and "did we ever get to the part where the logic notices that I'm out and then we need to figure
// out coverage". The trip's coverage: every run he usually drives while he's gone, and who has it.
const [trip] = buildTrips(tripEvents, members, travelPrefs)
const planDay = (state = {}) => (date) => buildDayPlan({ date, members, routines, events: tripEvents, travel: [trip], tripState: state[date.getDate()] ?? { drivers: {}, departed: {} } })

test('the trip lists every run he usually drives while away; Wednesday morning (before he leaves) is not one', () => {
  const runs = tripCoverage(trip, planDay())
  assert.deepEqual(runs.map((r) => [r.date.getDate(), r.title, r.time, r.driverId]), [[8, 'Drop off Emme & Owen', '7:35', null]])
})

test('once someone takes it, it stays on the list as theirs', () => {
  const [open] = tripCoverage(trip, planDay())
  const covered = tripCoverage(trip, planDay({ 8: { drivers: { [open.tripId]: 'kelly' }, departed: {} } }))
  assert.deepEqual(covered.map((r) => [r.title, r.driverId]), [['Drop off Emme & Owen', 'kelly']])
})

test('Coming up: the trip shows from the day it lands in Casa, with what still needs someone', () => {
  const today = '2026-10-01'
  const open = coverageComingUp(trip, tripCoverage(trip, planDay()), members, today)
  assert.deepEqual([open.title, open.nextStep, open.pokeOn, open.tripKey, open.date], ['Jake away Wed–Thu', 'Drop off Emme & Owen Thu 7:35 needs someone', today, 'f1419', '2026-10-07'])
  const [run] = tripCoverage(trip, planDay())
  const done = coverageComingUp(trip, tripCoverage(trip, planDay({ 8: { drivers: { [run.tripId]: 'kelly' }, departed: {} } })), members, today)
  assert.equal(done.nextStep, 'Covered: Kelly drops off Emme & Owen Thu 7:35')
  assert.equal(done.pokeOn, '2026-10-06')
})

// The design doc's "both parents away": a night when every parent is gone is a gap of its own — who's home with the
// kids — and comes before any drop-off question. Kelly flies to Atlanta Wed–Fri while Jake is in Dallas Wed–Thu.
test('both parents away overnight: "someone home with the kids" that night, on both trips’ lists', () => {
  const local = (d, h, m) => new Date(2026, 9, d, h, m).toISOString()
  const kelly = [{ family_member_id: 'kelly', role: 'primary' }]
  const hers = [
    { id: 'k-out', title: 'Flight 802 PBI→ATL', all_day: false, start_time: local(7, 9, 0), end_time: local(7, 11, 0), location_name: null, address: null, members: kelly },
    { id: 'k-back', title: 'Flight 803 ATL→PBI', all_day: false, start_time: local(9, 15, 0), end_time: local(9, 17, 0), location_name: null, address: null, members: kelly },
  ]
  const trips = buildTrips([...tripEvents, ...hers], members, travelPrefs)
  const plan = (state = {}) => (date) => buildDayPlan({ date, members, routines, events: [], travel: trips, tripState: state[date.getDate()] ?? { drivers: {}, departed: {} } })
  const jakes = trips.find((t) => t.memberIds.includes('jake-id'))
  const nights = (runs) => runs.filter((r) => r.title === 'Someone home with the kids').map((r) => [r.date.getDate(), r.driverId])
  assert.deepEqual(nights(tripCoverage(jakes, plan())), [[7, null]])
  const kellys = trips.find((t) => t.memberIds.includes('kelly'))
  assert.deepEqual(nights(tripCoverage(kellys, plan())), [[7, null]])
  // Giselle stays: the night is covered.
  assert.deepEqual(nights(tripCoverage(jakes, plan({ 7: { drivers: { night: 'giselle' }, departed: {} } }))), [[7, 'giselle']])
  // Jake alone away: no night to cover.
  const [alone] = buildTrips(tripEvents, members, travelPrefs)
  assert.deepEqual(nights(tripCoverage(alone, (date) => buildDayPlan({ date, members, routines, events: [], travel: [alone] }))), [])
})
