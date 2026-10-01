import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { WEDNESDAY, THURSDAY, FRIDAY, on, members, routines, tripEvents, travelPrefs } from './fixtures/wall-trip-2026-10-07.mjs'

const plan = (date) => buildDayPlan({ date, members, routines, events: tripEvents, travelPrefs })
const parts = (p, id = 'jake-id') => p.lanes.get(id).filter((s) => s.travel).map((s) => [s.travel, s.label, s.start.toTimeString().slice(0, 5), s.end.toTimeString().slice(0, 5)])

test('leaving day: the ride, an hour at the airport, the flight, then away — his morning drop-off is still his', () => {
  const wed = plan(WEDNESDAY)
  assert.deepEqual(parts(wed), [
    ['drive', 'Uber to DJT', '12:58', '13:13'],
    ['wait', 'At DJT · 1 hr', '13:13', '14:13'],
    ['flight', '1419 → DFW', '14:13', '16:30'],
    ['away', 'Away · Dallas', '16:30', '23:59'],
  ])
  const ride = wed.trips.find((t) => t.travel?.direction === 'out')
  assert.equal(ride.leaveAt.getTime(), on(7, 12, 58).getTime())
  assert.equal(ride.arriveAt.getTime(), on(7, 13, 13).getTime())
  assert.equal(ride.driverId, 'jake-id')
  assert.equal(ride.travel.way, 'uber')
  assert.equal(ride.destination.name, 'DJT airport')
  // The flight is the trip's, not an outing of its own (no Verizon office, no drive to Irving).
  assert.equal(wed.trips.filter((t) => t.sourceId === 'f1419' && !t.travel).length, 0)
  const dropoff = wed.trips.find((t) => t.kind === 'dropoff' && t.travelerIds.includes('owen'))
  assert.equal(dropoff.driverId, 'jake-id')
  // The hotel's all-day event is the trip chip: who, where, day 1 of 2.
  assert.deepEqual(wed.allDay.filter((a) => a.trip).map((a) => [a.title, a.trip.dayIndex, a.trip.dayCount]), [['Jake in Dallas', 1, 2]])
  assert.equal(wed.allDay.some((a) => a.title === 'JRT Trip Dallas'), false)
  assert.deepEqual(wed.travel.map((t) => [t.memberId, t.phase, t.city]), [['jake-id', 'leaving', 'Dallas']])
})

test('coming-home day: away until the flight, off the plane, the ride, home ~7:19; his 7:35 drop-off needs someone', () => {
  const thu = plan(THURSDAY)
  assert.deepEqual(parts(thu), [
    ['away', 'Away · Dallas', '00:00', '14:45'],
    ['flight', '2640 → DJT', '14:45', '18:34'],
    ['wait', 'Off the plane', '18:34', '19:04'],
    ['drive', 'Uber home', '19:04', '19:19'],
  ])
  const home = thu.trips.find((t) => t.travel?.direction === 'home')
  assert.equal(home.homeAt.getTime(), on(8, 19, 19).getTime())
  const dropoff = thu.trips.find((t) => t.kind === 'dropoff' && t.travelerIds.includes('owen'))
  assert.equal(dropoff.driverId, null)
  const gap = thu.gaps.find((g) => g.kind === 'no_driver' && g.sourceId === dropoff.sourceId)
  assert.deepEqual(gap.away, { memberId: 'jake-id', city: 'Dallas' })
  assert.deepEqual(thu.allDay.filter((a) => a.trip).map((a) => [a.trip.dayIndex, a.trip.dayCount]), [[2, 2]])
})

test('the day after, the trip is over: no travel, the drop-off is his again', () => {
  const fri = plan(FRIDAY)
  assert.deepEqual(fri.travel, [])
  assert.equal(fri.trips.find((t) => t.kind === 'dropoff' && t.travelerIds.includes('owen')).driverId, 'jake-id')
})

test('a hand-off made on the wall still wins over "away"', () => {
  const thu = plan(THURSDAY)
  const dropoff = thu.trips.find((t) => t.kind === 'dropoff' && t.travelerIds.includes('owen'))
  const handed = buildDayPlan({ date: THURSDAY, members, routines, events: tripEvents, travelPrefs, tripState: { drivers: { [dropoff.id]: 'kelly' }, departed: {} } })
  assert.equal(handed.trips.find((t) => t.id === dropoff.id).driverId, 'kelly')
  assert.equal(handed.gaps.some((g) => g.sourceId === dropoff.sourceId), false)
})

// The Score draws it (canvas 19a/b): the flight, the airport and the time away as their own blocks, "Home ~" on the
// lane, and the lane's words say when he leaves and when he's back.
test('the Score: travel blocks, the home mark, and the lane status before, during and after', async () => {
  const { buildScore } = await import('../src/wall/score.ts')
  const jakeLane = (date, now) => buildScore(plan(date), members, now).lanes.find((l) => l.member.id === 'jake-id')
  const morning = jakeLane(WEDNESDAY, on(7, 11, 40))
  assert.deepEqual(morning.blocks.filter((b) => ['flight', 'wait', 'away'].includes(b.kind)).map((b) => [b.kind, b.label]), [
    ['wait', 'At DJT · 1 hr'], ['flight', '1419 → DFW'], ['away', 'Away · Dallas'],
  ])
  assert.equal(morning.status, 'Away 12:58 · back Thu ~7:19')
  assert.equal(jakeLane(WEDNESDAY, on(7, 18, 0)).status, 'In Dallas · home Thu ~7:19')
  const thu = jakeLane(THURSDAY, on(8, 9, 0))
  assert.equal(thu.status, 'In Dallas · home ~7:19')
  assert.equal(thu.home.label, 'Home ~7:19')
  assert.notEqual(jakeLane(THURSDAY, on(8, 20, 0)).status.startsWith('In Dallas'), true)
  const chip = buildScore(plan(THURSDAY), members, on(8, 9, 0)).allDay.find((a) => a.trip)
  assert.deepEqual([chip.title, chip.trip.dayIndex, chip.trip.dayCount], ['Jake in Dallas', 2, 2])
})

test('the decision says why and asks who; the Next Move is the ride to the airport, in the family’s words', async () => {
  const { decisionsFor } = await import('../src/wall/decisions.ts')
  const { describeNextMove } = await import('../src/wall/header.ts')
  const { selectNextMove } = await import('../src/wall/engine/nextMove.ts')
  const thu = plan(THURSDAY)
  const asked = decisionsFor(thu, members, on(7, 20, 15)).find((d) => d.kind === 'no_driver')
  assert.equal(asked.text, 'Jake’s in Dallas. Who drops off Emme & Owen at 7:35?')
  // The answers are people who are here, never Jake.
  assert.equal(asked.answers.some((a) => a.label === 'Jake'), false)
  const wed = plan(WEDNESDAY)
  const view = describeNextMove(selectNextMove(wed, on(7, 11, 40)), members, on(7, 11, 40))
  assert.equal(view.title, 'Jake → DJT airport')
  assert.equal(view.detail, 'Uber · 15 min · at the airport by 1:13 · Flight 1419 to Dallas at 2:13')
  assert.equal(view.eyebrow, 'NEXT MOVE · LEAVE BY 12:58')
})

test('the trip sheet: Kelly drives him to the airport — the run is on her lane, there and back', () => {
  const wed = buildDayPlan({ date: WEDNESDAY, members, routines, events: tripEvents, travelPrefs, travelSettings: { f1419: { wayOut: 'someone', driverOutId: 'kelly' } } })
  const ride = wed.trips.find((t) => t.travel?.direction === 'out')
  assert.deepEqual([ride.driverId, ride.driverSource], ['kelly', 'plan'])
  const hers = wed.lanes.get('kelly').filter((s) => s.tripId === ride.id)
  assert.deepEqual(hers.map((s) => [s.label, s.start.toTimeString().slice(0, 5), s.end.toTimeString().slice(0, 5)]), [['Drive Jake to DJT', '12:58', '13:28']])
  // Nobody picked yet: the ride needs someone.
  const open = buildDayPlan({ date: WEDNESDAY, members, routines, events: tripEvents, travelPrefs, travelSettings: { f1419: { wayOut: 'someone' } } })
  assert.equal(open.gaps.some((g) => g.kind === 'no_driver' && g.sourceId === 'f1419'), true)
})
