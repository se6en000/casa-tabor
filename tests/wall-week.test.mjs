import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { weekDays } from '../src/wall/week.ts'
import { FRIDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const week = Array.from({ length: 7 }, (_, i) => {
  const date = new Date(FRIDAY)
  date.setDate(FRIDAY.getDate() + i)
  return buildDayPlan({ date, members, routines, events })
})

test('seven days from today: today first, then weekday and date', () => {
  const days = weekDays(week, members, [], at(25, 7, 12))
  assert.equal(days.length, 7)
  assert.deepEqual(days.map((d) => d.weekday), ['Today', 'Tomorrow', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'])
  assert.deepEqual(days.map((d) => d.dayNumber), [25, 26, 27, 28, 29, 30, 1])
  assert.equal(days[0].isToday, true)
})

test('each day names who has something, in lane order, and the first time anyone leaves', () => {
  const [, saturday] = weekDays(week, members, [], at(25, 7, 12))
  const order = members.map((m) => m.id)
  assert.ok(saturday.memberIds.includes('jake-id'))
  assert.deepEqual(saturday.memberIds, [...saturday.memberIds].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
  assert.equal(saturday.firstOut, 'First out 11:56')
})

test('a day with nothing planned says so rather than showing empty space', () => {
  const quiet = buildDayPlan({ date: new Date(2026, 9, 3), members, routines: [], events: [] })
  const [day] = weekDays([quiet], members, [], at(25, 7, 12))
  assert.deepEqual(day.memberIds, [])
  assert.equal(day.firstOut, 'Nothing planned')
})

test('decisions are counted on the day they are about', () => {
  const days = weekDays(week, members, [{ date: week[1].date }, { date: week[1].date }], at(25, 7, 12))
  assert.deepEqual(days.map((d) => d.decisionCount), [0, 2, 0, 0, 0, 0, 0])
})

test('each day counts the prep still to do for its own events', () => {
  const kit = [
    { id: 'a', event_id: 'birthday', label: 'Card', checked: false, sort_order: 1 },
    { id: 'b', event_id: 'birthday', label: 'Gift', checked: true, sort_order: 2 },
    { id: 'c', event_id: 'softball', label: 'Glove', checked: false, sort_order: 1 },
  ]
  const days = weekDays(week, members, [], at(25, 7, 12), kit)
  assert.deepEqual(days.map((d) => d.toDo), [0, 2, 0, 0, 0, 0, 0])
})

test("today counts only prep for what hasn't happened yet", () => {
  const kit = [
    { id: 'p', event_id: 'photobook', label: 'Card', checked: false, sort_order: 1 }, // 10:25 AM
    { id: 'v', event_id: 'violin', label: 'Violin', checked: false, sort_order: 1 },  // 4:30 PM
  ]
  const morning = weekDays(week, members, [], at(25, 7, 12), kit)
  assert.equal(morning[0].toDo, 2)
  const evening = weekDays(week, members, [], at(25, 20, 0), kit)
  assert.equal(evening[0].toDo, 0)
})

// Jake, 2026-10-01: "when hide routines is on, update the bottom tile row with the correct active events vs the
// routine ones … with routines hidden I expect there to be fewer dots in the tiles, no?"
test('with routines hidden, a tile\'s dots and "first out" leave out school, work and the regular runs', async () => {
  const { buildDayPlan } = await import('../src/wall/engine/dayPlan.ts')
  const { weekDays } = await import('../src/wall/week.ts')
  const fx = await import('./fixtures/wall-day-2026-09-25.mjs')
  const friday = buildDayPlan({ date: fx.FRIDAY, members: fx.members, routines: fx.routines, events: fx.events })
  const now = new Date(2026, 8, 25, 6, 0)
  const [shown] = weekDays([friday], fx.members, [], now)
  const [hidden] = weekDays([friday], fx.members, [], now, [], { hideRoutines: true })
  // Shown: everyone with school or a school run has a dot; the first trip is the 7:25 drop-off.
  assert.ok(shown.memberIds.includes('liv') && shown.memberIds.includes('giselle'))
  assert.equal(shown.firstOut, 'First out 7:25')
  // Hidden: Liv (only school) and Giselle (only the pickups) drop out; Jake (the photobook) and Emme (violin) stay.
  assert.deepEqual(hidden.memberIds.filter((id) => ['liv', 'giselle'].includes(id)), [])
  assert.ok(hidden.memberIds.includes('jake-id') && hidden.memberIds.includes('emme'))
  assert.ok(hidden.memberIds.length < shown.memberIds.length)
  // The photobook pickup has no address and violin is at home: with the school runs hidden there's no trip at all.
  assert.equal(hidden.firstOut, 'No trips')
})
