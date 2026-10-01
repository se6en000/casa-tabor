import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { buildTrips } from '../src/wall/engine/travel.ts'
import { choreOnDay } from '../src/wall/engine/chores.ts'
import { tripCoverage } from '../src/wall/coverage.ts'
import { members, routines, tripEvents, travelPrefs } from './fixtures/wall-trip-2026-10-07.mjs'

// Jake, 2026-10-01: "add a recurring reminder for chores (Trash to street Monday/Thursday, landscaping to street
// Tuesdays), Give Liv her meds at 7PM M-F … for me to see on the wall as reminders for that day, maybe show up on the
// score for that day" — and "kids chores as well, like change the cat litter every 4 weeks".
const chore = (id, title, member_id, days, time, extra = {}) => ({ id, title, member_id, for_member_id: null, days_of_week: days, time_local: time, minutes: 10, enabled: true, every_weeks: 1, starts_on: '2026-09-01', ...extra })
const chores = [
  chore('trash', 'Trash to the street', 'jake-id', [1, 4], '20:00:00'),
  chore('yard', 'Landscaping to the street', 'jake-id', [2], '20:00:00'),
  chore('meds', 'Give Liv her meds', null, [1, 2, 3, 4, 5], '19:00:00', { for_member_id: 'liv' }),
  chore('litter', 'Change the cat litter', 'owen', [0], '10:00:00', { every_weeks: 4, starts_on: '2026-10-04' }),
]
const day = (d, extra = {}) => buildDayPlan({ date: new Date(2026, 9, d), members, routines, events: [], chores, ...extra })
const choresOn = (plan, id) => plan.lanes.get(id).filter((s) => s.chore).map((s) => [s.label, s.start.toTimeString().slice(0, 5)])

test('a chore shows on its day on the doer’s lane; one with no doer on the lane of who it’s for', () => {
  assert.deepEqual(choresOn(day(8), 'jake-id'), [['Trash to the street', '20:00']])
  assert.deepEqual(choresOn(day(6), 'jake-id'), [['Landscaping to the street', '20:00']])
  assert.deepEqual(choresOn(day(8), 'liv'), [['Give Liv her meds', '19:00']])
  assert.deepEqual(choresOn(day(10), 'liv'), [])
})

test('every 4 weeks counts from its first week', () => {
  const on = (d) => choreOnDay(chores[3], new Date(2026, 9, d))
  assert.deepEqual([on(4), on(11), on(18), on(25), on(1 + 31)], [true, false, false, false, true])
  assert.equal(choreOnDay(chores[3], new Date(2026, 8, 6)), false)
})

test('away on a trip: his chore that night needs someone and goes on the trip’s coverage list; back by then, it stays his', () => {
  const [trip] = buildTrips(tripEvents, members, travelPrefs)
  // Wednesday night he's in Dallas; Thursday's 8 PM trash is after he's home (~7:19).
  const withWed = [...chores, chore('recycling', 'Recycling to the street', 'jake-id', [3], '20:00:00')]
  const plan = (d, state) => buildDayPlan({ date: new Date(2026, 9, d), members, routines, events: tripEvents, travel: [trip], chores: withWed, tripState: state ?? { drivers: {}, departed: {} } })
  const wed = plan(7).chores.find((c) => c.choreId === 'recycling')
  assert.deepEqual([wed.doerId, wed.usualAway?.memberId], [null, 'jake-id'])
  assert.equal(plan(8).chores.find((c) => c.choreId === 'trash').doerId, 'jake-id')
  const runs = tripCoverage(trip, (d) => plan(d.getDate()))
  assert.deepEqual(runs.map((r) => [r.title, r.time, r.driverId]), [['Recycling to the street', '8:00', null], ['Drop off Emme & Owen', '7:35', null]])
  const covered = tripCoverage(trip, (d) => plan(d.getDate(), d.getDate() === 7 ? { drivers: { 'chore:recycling': 'kelly' }, departed: {} } : undefined))
  assert.equal(covered.find((r) => r.title === 'Recycling to the street').driverId, 'kelly')
  assert.deepEqual(choresOn(plan(7, { drivers: { 'chore:recycling': 'kelly' }, departed: {} }), 'kelly'), [['Recycling to the street', '20:00']])
})

test('on the Score a chore is its own small mark with its words, and hides with Hide routines', async () => {
  const { buildScore } = await import('../src/wall/score.ts')
  const lane = (opts) => buildScore(day(8), members, new Date(2026, 9, 8, 12, 0), opts).lanes.find((l) => l.member.id === 'jake-id')
  assert.deepEqual(lane().blocks.filter((b) => b.kind === 'chore').map((b) => b.label), ['Trash to the street'])
  assert.equal(lane({ hideRoutines: true }).blocks.some((b) => b.kind === 'chore'), false)
})

test('a chore right after "Home ~" keeps its words; the home mark keeps its line', async () => {
  const { buildScore } = await import('../src/wall/score.ts')
  const [trip] = buildTrips(tripEvents, members, travelPrefs)
  const thu = buildDayPlan({ date: new Date(2026, 9, 8), members, routines, events: tripEvents, travel: [trip], chores })
  const lane = buildScore(thu, members, new Date(2026, 9, 8, 9, 0)).lanes.find((l) => l.member.id === 'jake-id')
  assert.equal(lane.home.label, '')
  assert.equal(lane.blocks.find((b) => b.kind === 'chore').label, 'Trash to the street')
})
