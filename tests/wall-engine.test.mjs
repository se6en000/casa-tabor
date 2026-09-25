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

test('the same street address counts as the same place, even under different names', () => {
  // As stored in production: the two games name the park differently but share the address.
  const renamed = events.map((e) => (e.id === 'baseball'
    ? { ...e, location_name: 'Vivian A. Ferrin Memorial Park', address: '11921 Okeechobee Blvd, Royal Palm Beach, FL, 33411' }
    : e))
  const plan = buildDayPlan({ date: SATURDAY, members, routines, events: renamed })
  assert.equal(plan.sharedDestinations.length, 1)
  assert.deepEqual([...plan.sharedDestinations[0].tripIds].sort(), ['event:baseball', 'event:softball'])
  // Different addresses stay apart.
  const elsewhere = renamed.map((e) => (e.id === 'baseball' ? { ...e, address: '3645 Gun Club Road, West Palm Beach, FL 33406' } : e))
  assert.equal(buildDayPlan({ date: SATURDAY, members, routines, events: elsewhere }).sharedDestinations.length, 0)
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

test('a departure due before the trip on the road arrives comes first', () => {
  // Saturday 12:00: softball left at 11:56 and arrives 12:30; baseball must leave at 12:05.
  const move = selectNextMove(saturday(), at(26, 12, 0))
  assert.equal(move.status, 'upcoming')
  assert.equal(move.trips[0].sourceId, 'baseball')
  assert.equal(move.minutesUntilLeave, 5)
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

// ---- Riding along (P2.8) -------------------------------------------------------
// Saturday's real "Meet Coffee Lady" at George Petty Park: Jake (primary, drives), Emme and Owen going too.
const pettyPark = 'George Petty Park'
const pettyAddress = '3050 Washington Rd, West Palm Beach, FL, 33405'
const coffee = {
  id: 'coffee', title: 'Meet Coffee Lady 8:15 - tape up flyers', event_type: 'event', all_day: false,
  start_time: at(26, 8, 0).toISOString(), end_time: at(26, 9, 0).toISOString(),
  location_name: pettyPark, address: pettyAddress,
  members: [{ family_member_id: 'jake-id', role: 'primary' }, { family_member_id: 'emme', role: 'attendee' }, { family_member_id: 'owen', role: 'attendee' }],
  enrichment: { drive_time_mins: 5, departure_time: null },
}
const withCoffee = (event = coffee) => buildDayPlan({ date: SATURDAY, members, routines, events: [...events, event] })

test('a parent driving themself takes the kids along: they are travelers, the driver is still the parent', () => {
  const trip = withCoffee().trips.find((t) => t.sourceId === 'coffee')
  assert.equal(trip.driverId, 'jake-id')
  assert.equal(trip.driverSource, 'self')
  assert.deepEqual([...trip.travelerIds].sort(), ['emme', 'jake-id', 'owen'])
})

test('riders get the outing and their rides in their own lanes, the driver gets it and his drives, nobody gets it twice', () => {
  const plan = withCoffee()
  for (const kid of ['emme', 'owen']) {
    const segs = plan.lanes.get(kid).filter((s) => s.sourceId === 'coffee')
    assert.equal(segs.filter((s) => s.kind === 'activity').length, 1)
    assert.equal(segs.find((s) => s.kind === 'activity').placeStatus, 'away')
    const rides = segs.filter((s) => s.kind === 'drive')
    assert.equal(rides.length, 2)
    assert.ok(rides.every((s) => s.driverId === 'jake-id'))
  }
  const jake = plan.lanes.get('jake-id').filter((s) => s.sourceId === 'coffee')
  assert.equal(jake.filter((s) => s.kind === 'activity').length, 1)
  assert.equal(jake.filter((s) => s.kind === 'drive').length, 2)
})

test('as stored in production: a saved plan with Jake driving, on the same road as home, is an outing with everyone', () => {
  const stored = {
    ...coffee,
    plan_override: { transportation_plan: { legs: [
      { purpose: 'appointment', timing: 'arrive_by', time: '08:00', driverId: 'jake-id', driverName: 'Jake' },
      { purpose: 'return', timing: 'depart_at', time: '09:00', driverId: 'jake-id', driverName: 'Jake' },
    ] } },
  }
  const trip = withCoffee(stored).trips.find((t) => t.sourceId === 'coffee')
  assert.ok(trip, 'George Petty Park (3050 Washington Rd) is not home')
  assert.equal(trip.driverSource, 'plan')
  assert.deepEqual([...trip.travelerIds].sort(), ['emme', 'jake-id', 'owen'])
})

test('unchanged: a parent alone at their own appointment is the only traveler; a saved driver and a missing driver are as before', () => {
  const alone = events.map((e) => (e.id === 'photobook'
    ? { ...e, members: [{ family_member_id: 'jake-id', role: 'primary' }], location_name: 'Photobook Shop', address: 'Publix Plaza, Palm Beach', enrichment: { drive_time_mins: 15, departure_time: null } }
    : e))
  const photobook = buildDayPlan({ date: FRIDAY, members, routines, events: alone }).trips.find((t) => t.sourceId === 'photobook')
  assert.deepEqual(photobook.travelerIds, ['jake-id'])
  assert.equal(photobook.driverSource, 'self')
  const sat = saturday()
  const softball = sat.trips.find((t) => t.sourceId === 'softball')
  assert.equal(softball.driverSource, 'plan')
  assert.deepEqual(softball.travelerIds, ['jake-id'])
  const baseball = sat.trips.find((t) => t.sourceId === 'baseball')
  assert.equal(baseball.driverId, null)
  assert.deepEqual(baseball.travelerIds, [])
})

test('an event at home is in the lane of everyone in it, not only the primary (Jaida watching Owen and Emme, 2026-09-26)', () => {
  const sitter = {
    id: 'jaida', title: 'Jaida Watching Owen and Emme', event_type: 'event', all_day: false,
    start_time: at(26, 12, 0).toISOString(), end_time: at(26, 15, 0).toISOString(),
    location_name: 'Home', address: '3209 Washington Road, West Palm Beach, FL, 33405-1646',
    members: [{ family_member_id: 'emme', role: 'primary' }, { family_member_id: 'owen', role: 'attendee' }],
  }
  const plan = buildDayPlan({ date: SATURDAY, members, routines, events: [sitter] })
  const inLane = (id) => (plan.lanes.get(id) ?? []).some((s) => s.sourceId === 'jaida' && s.kind === 'activity')
  assert.equal(inLane('emme'), true)
  assert.equal(inLane('owen'), true)
})

test('a reminder stays with the person who does it: "Pick up Photobook for Liv" is in Jake\'s lane, not Liv\'s', () => {
  const plan = buildDayPlan({ date: FRIDAY, members, routines, events })
  const inLane = (id) => (plan.lanes.get(id) ?? []).some((s) => s.sourceId === 'photobook')
  assert.equal(inLane('jake-id'), true)
  assert.equal(inLane('liv'), false)
})

// Friday 2026-09-25 as it happened: Giselle picks Liv up at 3:30 and the hangout at CityPlace
// starts at 3:30 with Giselle driving. That's one trip, school → CityPlace, not two at once.
const hangout = (driverId = 'giselle', driverName = 'Giselle') => ({
  id: 'hangout', title: 'Liv and Layla Hangout', event_type: 'event', all_day: false,
  start_time: at(25, 15, 30).toISOString(), end_time: at(25, 18, 0).toISOString(),
  location_name: 'CityPlace', address: '700 S Rosemary Ave, West Palm Beach, FL 33401',
  members: [{ family_member_id: 'liv', role: 'primary' }],
  enrichment: { drive_time_mins: 13, departure_time: null },
  plan_override: { transportation_plan: { legs: [
    { purpose: 'appointment', timing: 'arrive_by', time: '15:30', driverId, driverName },
    { purpose: 'return', timing: 'depart_at', time: '18:00', driverId, driverName },
  ] } },
})

test('a pickup that goes straight on to the next place is one trip: school → CityPlace', () => {
  const plan = buildDayPlan({ date: FRIDAY, members, routines, events: [...events, hangout()] })
  const pickup = trip(plan, (t) => t.kind === 'pickup' && t.travelerIds.includes('liv'))
  const outing = trip(plan, (t) => t.id === 'event:hangout')
  assert.equal(pickup.continuesTo, 'event:hangout')
  assert.equal(outing.chainedFrom, pickup.id)
  assert.equal(time(outing.leaveAt), time(at(25, 15, 30)), 'leaves from school at pickup time')
  assert.equal(outing.arrivesLateBy, 13, 'about 13 minutes after it starts (estimated with the drive from home)')

  const giselle = plan.lanes.get('giselle').filter((s) => s.kind === 'drive')
  for (const a of giselle) for (const b of giselle) {
    if (a !== b) assert.ok(!(a.start < b.end && b.start < a.end), `Giselle's drives overlap: ${a.label} / ${b.label}`)
  }
  const livDrives = plan.lanes.get('liv').filter((s) => s.kind === 'drive' && s.start >= at(25, 15, 0) && s.end <= at(25, 16, 0))
  assert.deepEqual(livDrives.map((s) => [s.label, time(s.start), time(s.end)]), [['Pick up Liv → CityPlace', time(at(25, 15, 30)), time(at(25, 15, 43))]])
})

test('with different drivers there is no chain (and nothing is merged)', () => {
  const plan = buildDayPlan({ date: FRIDAY, members, routines, events: [...events, hangout('kelly', 'Kelly')] })
  const pickup = trip(plan, (t) => t.kind === 'pickup' && t.travelerIds.includes('liv'))
  assert.equal(pickup.continuesTo, undefined)
  assert.equal(trip(plan, (t) => t.id === 'event:hangout').chainedFrom, undefined)
})
