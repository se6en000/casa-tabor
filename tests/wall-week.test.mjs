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
  assert.deepEqual(days.map((d) => d.weekday), ['Today', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'])
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
