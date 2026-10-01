import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTrips, parseFlight, tripDay } from '../src/wall/engine/travel.ts'

// Jake, 2026-10-01: "whats important to the family is when am I leaving … and getting home … if this is for multiple
// days there should be some indicator on how long this trip is for." His real Dallas trip (Oct 7–8), as Casa holds it.
const jake = { id: 'jake', name: 'Jake', role: 'parent', can_drive: true }
const kelly = { id: 'kelly', name: 'Kelly', role: 'parent', can_drive: true }
const owen = { id: 'owen', name: 'Owen', role: 'child', can_drive: false }
const members = [jake, kelly, owen]
const ev = (id, title, start, end, memberIds, extra = {}) => ({
  id, title, start_time: start, end_time: end, all_day: false, location_name: null, address: null,
  members: memberIds.map((m) => ({ family_member_id: m, role: 'primary' })), ...extra,
})
const out = ev('f1419', 'TABOR JACOB | Flight 1419 DJT→DFW', '2026-10-07T18:13:00Z', '2026-10-07T20:30:00Z', ['jake'], { location_name: 'Verizon Corporate Office' })
const back = ev('f2640', 'TABOR JACOB | Flight 2640 DFW→DJT', '2026-10-08T18:45:00Z', '2026-10-08T22:34:00Z', ['jake'], { location_name: 'DJT' })
const hotel = ev('trip', 'JRT Trip Dallas', '2026-10-07T00:00:00Z', '2026-10-08T23:59:59Z', ['jake'], { all_day: true })
const prefs = { jake: { airportMinutes: 60, way: 'uber' } }
const local = (s) => new Date(s)

test('a flight is read from its title: number and airports, whatever else is around it', () => {
  assert.deepEqual(parseFlight(out), { number: '1419', from: 'DJT', to: 'DFW' })
  assert.deepEqual(parseFlight({ ...out, title: 'AA 2640 DFW -> PBI' }), { number: 'AA 2640', from: 'DFW', to: 'PBI' })
  assert.deepEqual(parseFlight({ ...out, title: 'Flight to Dallas (DJT to DFW)' }), { number: null, from: 'DJT', to: 'DFW' })
  assert.equal(parseFlight({ ...out, title: 'Drop off Emme & Owen @ PBP' }), null)
  assert.equal(parseFlight({ ...out, title: 'Pick up Liv @ Bak Middle School of the Arts' }), null)
})

test('the outbound and return flights make one trip: leave home, at the airport, home', () => {
  const [trip] = buildTrips([hotel, back, out], members, prefs)
  assert.equal(trip.city, 'Dallas')
  assert.deepEqual(trip.memberIds, ['jake'])
  assert.equal(trip.tripEventId, 'trip')
  assert.equal(trip.outbound.eventId, 'f1419')
  assert.equal(trip.inbound.eventId, 'f2640')
  // 2:13 flight − Jake's 1 hr − the 15 min ride to DJT.
  assert.equal(trip.atAirportAt.toISOString(), '2026-10-07T17:13:00.000Z')
  assert.equal(trip.leaveHomeAt.toISOString(), '2026-10-07T16:58:00.000Z')
  // Lands 6:34 + 30 off the plane + 15 home.
  assert.equal(trip.offPlaneAt.toISOString(), '2026-10-08T23:04:00.000Z')
  assert.equal(trip.homeAt.toISOString(), '2026-10-08T23:19:00.000Z')
  assert.equal(trip.way, 'uber')
})

test('time at the airport comes from the person; with several flying the longest wins; kids default to 2 hours', () => {
  const both = { ...out, members: [{ family_member_id: 'jake', role: 'primary' }, { family_member_id: 'owen', role: 'primary' }] }
  const [trip] = buildTrips([both], members, prefs)
  assert.deepEqual(trip.memberIds, ['jake', 'owen'])
  assert.equal(trip.airportMinutes, 120)
  assert.equal(trip.leaveHomeAt.toISOString(), '2026-10-07T15:58:00.000Z')
})

test('a trip with no return yet is still a trip (home unknown); flights that are not from home are not a trip start', () => {
  const [onlyOut] = buildTrips([out], members, prefs)
  assert.equal(onlyOut.homeAt, null)
  assert.equal(onlyOut.city, 'Dallas')
  assert.deepEqual(buildTrips([], members, prefs), [])
})

test('each day of the trip knows its part: leaving, away, coming home, and day N of M', () => {
  const [trip] = buildTrips([hotel, back, out], members, prefs)
  const wed = tripDay(trip, new Date(2026, 9, 7))
  assert.deepEqual([wed.phase, wed.dayIndex, wed.dayCount], ['leaving', 1, 2])
  const thu = tripDay(trip, new Date(2026, 9, 8))
  assert.deepEqual([thu.phase, thu.dayIndex, thu.dayCount], ['returning', 2, 2])
  assert.equal(tripDay(trip, new Date(2026, 9, 9)), null)
  assert.equal(tripDay(trip, new Date(2026, 9, 6)), null)
  // A three-day trip: the middle day is a day away.
  const [long] = buildTrips([{ ...back, start_time: '2026-10-09T18:45:00Z', end_time: '2026-10-09T22:34:00Z' }, out], members, prefs)
  assert.deepEqual([tripDay(long, new Date(2026, 9, 8)).phase, tripDay(long, new Date(2026, 9, 8)).dayCount], ['away', 3])
})

test('with no prefs passed, each person’s stored travel_prefs (their page) are used', () => {
  const stored = [{ ...jake, travel_prefs: { airport_minutes: 60, way: 'uber' } }, kelly, owen]
  const [trip] = buildTrips([out, back], stored)
  assert.equal(trip.airportMinutes, 60)
  assert.equal(trip.leaveHomeAt.toISOString(), '2026-10-07T16:58:00.000Z')
  // Nothing stored: a parent gets 90 minutes.
  assert.equal(buildTrips([out, back], members)[0].airportMinutes, 90)
})
