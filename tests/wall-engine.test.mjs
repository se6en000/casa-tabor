import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { selectNextMove } from '../src/wall/engine/nextMove.ts'
import { FRIDAY, SATURDAY, TUESDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const friday = () => buildDayPlan({ date: FRIDAY, members, routines, events })
const saturday = () => buildDayPlan({ date: SATURDAY, members, routines, events })
const trip = (plan, predicate) => plan.trips.find(predicate)
const time = (d) => d?.getTime()

test('school comes from routines: each child is at school for the routine hours', () => {
  const plan = friday()
  const liv = plan.lanes.get('liv').find((s) => s.kind === 'at_place')
  assert.equal(time(liv.start), time(at(25, 8, 0)))
  assert.equal(time(liv.end), time(at(25, 15, 30)))
  assert.match(liv.label, /Bak Middle/)
  for (const id of ['emme', 'owen']) {
    const school = plan.lanes.get(id).find((s) => s.kind === 'at_place')
    assert.equal(time(school.start), time(at(25, 7, 35)))
    assert.equal(time(school.end), time(at(25, 14, 0)))
  }
})

test('morning drop-offs: siblings share one trip, drivers come from the routine, leave time = arrival - drive', () => {
  const plan = friday()
  const emmeOwen = trip(plan, (t) => t.kind === 'dropoff' && t.travelerIds.includes('emme'))
  assert.deepEqual([...emmeOwen.travelerIds].sort(), ['emme', 'owen'])
  assert.equal(emmeOwen.driverId, 'jake-id')
  assert.equal(emmeOwen.driverSource, 'routine')
  assert.equal(time(emmeOwen.leaveAt), time(at(25, 7, 25)))
  assert.equal(time(emmeOwen.arriveAt), time(at(25, 7, 35)))

  const liv = trip(plan, (t) => t.kind === 'dropoff' && t.travelerIds.includes('liv'))
  assert.equal(liv.driverId, 'kelly')
  assert.equal(time(liv.leaveAt), time(at(25, 7, 42)))
})

test('siblings share a run even when one routine names the driver by id and the other by name', () => {
  const dropoffs = friday().trips.filter((t) => t.kind === 'dropoff' && (t.travelerIds.includes('emme') || t.travelerIds.includes('owen')))
  assert.equal(dropoffs.length, 1)
})

test('trips come out in departure order', () => {
  const plan = saturday()
  assert.deepEqual(plan.trips.map((t) => t.sourceId), ['softball', 'baseball'])
})

test('afternoon pickups are Giselle, and she becomes active for the day', () => {
  const plan = friday()
  const pickups = plan.trips.filter((t) => t.kind === 'pickup')
  assert.equal(pickups.length, 2)
  assert.ok(pickups.every((t) => t.driverId === 'giselle'))
  const liv = pickups.find((t) => t.travelerIds.includes('liv'))
  assert.equal(time(liv.leaveAt), time(at(25, 15, 12)))
  assert.equal(time(liv.arriveAt), time(at(25, 15, 30)))
  assert.ok(plan.activeMemberIds.has('giselle'))
  assert.ok(plan.lanes.get('giselle').some((s) => s.kind === 'drive' && s.driverId === 'giselle'))
})

test('a reminder with no place is kept, not treated as home, and not invented into a trip', () => {
  const plan = friday()
  assert.equal(plan.trips.some((t) => t.sourceId === 'photobook'), false)
  const item = plan.unplaced.find((u) => u.sourceId === 'photobook')
  assert.ok(item, 'photobook must not be dropped just because it is a reminder')
  assert.equal(time(item.at), time(at(25, 10, 25)))
  const seg = plan.lanes.get('jake-id').find((s) => s.sourceId === 'photobook')
  assert.equal(seg.placeStatus, 'unknown')
})

test('a timed item with no place sits in its primary person\'s lane only', () => {
  const plan = friday()
  assert.ok(plan.lanes.get('emme').some((s) => s.sourceId === 'violin' && s.kind === 'activity'))
  assert.equal(plan.lanes.get('liv').some((s) => s.sourceId === 'photobook'), false)
})

test('a reminder that has a place is a trip like any other event', () => {
  const withPlace = events.map((e) => (e.id === 'photobook'
    ? { ...e, location_name: 'Photobook Shop', address: 'Publix Plaza, Palm Beach', enrichment: { drive_time_mins: 15, departure_time: null } }
    : e))
  const plan = buildDayPlan({ date: FRIDAY, members, routines, events: withPlace })
  const t = trip(plan, (x) => x.sourceId === 'photobook')
  assert.ok(t)
  assert.equal(time(t.leaveAt), time(at(25, 10, 10)))
  assert.equal(t.driverId, 'jake-id')
  assert.equal(t.driverSource, 'self')
})

test('an event explicitly at home is never a trip', () => {
  const atHome = events.map((e) => (e.id === 'violin' ? { ...e, location_name: 'Home' } : e))
  const plan = buildDayPlan({ date: FRIDAY, members, routines, events: atHome })
  assert.equal(plan.trips.some((t) => t.sourceId === 'violin'), false)
  assert.equal(plan.lanes.get('emme').find((s) => s.sourceId === 'violin').placeStatus, 'home')
  assert.equal(plan.unplaced.some((u) => u.sourceId === 'violin'), false)
})

test('weekends have no school runs', () => {
  const plan = saturday()
  assert.equal(plan.trips.some((t) => t.source === 'routine'), false)
})

test('saturday games: the driver comes from the saved plan, and a missing driver is a gap, never a guess', () => {
  const plan = saturday()
  const softball = trip(plan, (t) => t.sourceId === 'softball')
  assert.equal(softball.driverId, 'jake-id')
  assert.equal(softball.driverSource, 'plan')
  assert.equal(time(softball.leaveAt), time(at(26, 11, 56)))

  const baseball = trip(plan, (t) => t.sourceId === 'baseball')
  assert.equal(baseball.driverId, null)
  // Stored departure has the wrong year, so it's ignored: 12:30 arrival - 25 min drive.
  assert.equal(time(baseball.leaveAt), time(at(26, 12, 5)))
  assert.equal(time(baseball.homeAt), time(at(26, 14, 55)))
  const kinds = plan.gaps.filter((g) => g.sourceId === 'baseball').map((g) => g.kind).sort()
  assert.deepEqual(kinds, ['no_driver', 'no_person'])
})

test('a stored departure that would arrive late is replaced by arrival minus drive time', () => {
  // The model's plan for the real baseball game after the enrichment fix: leave 12:15, 20 min drive, 12:30 start.
  const late = events.map((e) => (e.id === 'baseball'
    ? { ...e, enrichment: { drive_time_mins: 20, departure_time: at(26, 12, 15).toISOString() } }
    : e))
  const baseball = buildDayPlan({ date: SATURDAY, members, routines, events: late }).trips.find((t) => t.sourceId === 'baseball')
  assert.equal(time(baseball.leaveAt), time(at(26, 12, 10)))
})

test('two games at the same park at the same time are flagged as one-car-could-do-both', () => {
  const plan = saturday()
  assert.equal(plan.sharedDestinations.length, 1)
  assert.deepEqual([...plan.sharedDestinations[0].tripIds].sort(), ['event:baseball', 'event:softball'])
  assert.match(plan.sharedDestinations[0].destination, /Ferrin Park/)
})

test('a child with a day off has no school that day', () => {
  const dayOffs = [{ member_id: 'liv', override_type: 'day_off', start_at: at(25, 0, 0).toISOString(), end_at: at(25, 23, 59).toISOString() }]
  const plan = buildDayPlan({ date: FRIDAY, members, routines, events, dayOffs })
  assert.equal(plan.lanes.get('liv').some((s) => s.kind === 'at_place'), false)
  assert.equal(plan.trips.some((t) => t.travelerIds.includes('liv')), false)
  assert.ok(plan.trips.some((t) => t.travelerIds.includes('emme')))
})

test('a routine exception day uses the routine override, and its Google-synced copy is not a second trip', () => {
  const plan = buildDayPlan({ date: TUESDAY, members, routines, events })
  const emme = plan.trips.filter((t) => t.kind === 'dropoff' && t.travelerIds.includes('emme'))
  assert.equal(emme.length, 1)
  assert.equal(time(emme[0].arriveAt), time(at(29, 7, 0)))
  assert.equal(emme[0].source, 'routine')
  assert.equal(plan.trips.some((t) => t.sourceId === 'strings-mirror'), false)
  assert.equal(plan.gaps.some((g) => g.sourceId === 'strings-mirror'), false)
  // Owen has no Tuesday override, so he still goes at 7:35, as a separate run.
  const owen = plan.trips.find((t) => t.kind === 'dropoff' && t.travelerIds.includes('owen'))
  assert.equal(time(owen.arriveAt), time(at(29, 7, 35)))
})

// ---- Next Move (P1.3) ---------------------------------------------------------

test('next move before school: the earliest departure, with minutes until leaving', () => {
  const move = selectNextMove(friday(), at(25, 7, 0))
  assert.equal(move.status, 'upcoming')
  assert.equal(move.trips.length, 1)
  assert.deepEqual([...move.trips[0].travelerIds].sort(), ['emme', 'owen'])
  assert.equal(move.minutesUntilLeave, 25)
})

test('next move while a trip is under way reports it as en route', () => {
  const move = selectNextMove(friday(), at(25, 7, 30))
  assert.equal(move.status, 'en_route')
  assert.ok(move.trips[0].travelerIds.includes('emme'))
})

test('simultaneous departures are shown together', () => {
  // Liv's 18-minute drive: a 7:45 start means leaving 7:27, two minutes after Emme & Owen's 7:25.
  const both = routines.map((r) => (r.memberId === 'liv' ? { ...r, startLocal: '07:45' } : r))
  const move = selectNextMove(buildDayPlan({ date: FRIDAY, members, routines: both, events }), at(25, 7, 0))
  assert.equal(move.trips.length, 2)
})

test('after the last pickup nothing is left to leave for, even with an at-home lesson later', () => {
  assert.equal(selectNextMove(friday(), at(25, 16, 0)), null)
})

test('a reminder with a place drives the next move like any event', () => {
  const withPlace = events.map((e) => (e.id === 'photobook'
    ? { ...e, address: 'Publix Plaza, Palm Beach', location_name: 'Photobook Shop', enrichment: { drive_time_mins: 15, departure_time: null } }
    : e))
  const move = selectNextMove(buildDayPlan({ date: FRIDAY, members, routines, events: withPlace }), at(25, 10, 0))
  assert.equal(move.trips[0].sourceId, 'photobook')
  assert.equal(move.minutesUntilLeave, 10)
})
