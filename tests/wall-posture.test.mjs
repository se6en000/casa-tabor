import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { selectPosture, eveningFocus, calmHeadline, calmNextLine, forecastLine } from '../src/wall/posture.ts'
import { describeNextMove } from '../src/wall/header.ts'
import { selectNextMove } from '../src/wall/engine/nextMove.ts'
import { FRIDAY, SATURDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const friday = buildDayPlan({ date: FRIDAY, members, routines, events })
const saturday = buildDayPlan({ date: SATURDAY, members, routines, events })

test('the morning rush is launch, from 6 AM until the last school run arrives', () => {
  assert.equal(selectPosture(friday, at(25, 5, 59)), 'evening')
  assert.equal(selectPosture(friday, at(25, 6, 0)), 'launch')
  assert.equal(selectPosture(friday, at(25, 7, 50)), 'launch') // Kelly and Liv arrive 8:00
  assert.equal(selectPosture(friday, at(25, 8, 0)), 'launch') // Kelly is still driving home from the drop-off
  assert.equal(selectPosture(friday, at(25, 8, 30)), 'calm')
})

test('a departure within 2 hours is the full day; further out is calm', () => {
  assert.equal(selectPosture(friday, at(25, 11, 49)), 'calm') // Giselle leaves 1:50
  assert.equal(selectPosture(friday, at(25, 11, 50)), 'launch')
})

test('while someone is out on a trip, it stays the full day', () => {
  assert.equal(selectPosture(saturday, at(26, 13, 30)), 'launch') // Jake is at softball until 2:30, home 2:59
  assert.equal(selectPosture(saturday, at(26, 15, 5)), 'calm') // everyone home
})

test('a weekend with no school runs has no morning rush', () => {
  assert.equal(selectPosture(saturday, at(26, 7, 0)), 'calm')
  assert.equal(selectPosture(saturday, at(26, 10, 0)), 'launch') // softball leaves 11:56, within 2 hours
})

test('from 7 PM until 5 AM it is evening', () => {
  assert.equal(selectPosture(friday, at(25, 16, 30)), 'calm')
  assert.equal(selectPosture(friday, at(25, 19, 0)), 'evening')
  assert.equal(selectPosture(friday, at(26, 2, 0)), 'evening')
})

test('while loading, the wall stays on the launch layout', () => {
  assert.equal(selectPosture(null, at(25, 13, 0)), 'launch')
})

test('the evening looks ahead to tomorrow, or to today after midnight', () => {
  assert.deepEqual(eveningFocus(at(25, 20, 15)), { day: 'tomorrow', label: 'Friday evening' })
  assert.deepEqual(eveningFocus(at(26, 1, 0)), { day: 'today', label: 'Late Friday night' })
})

test('the calm headline says how long the quiet lasts, or what still needs a driver', () => {
  assert.equal(calmHeadline(friday, at(25, 10, 0)), 'A quiet stretch until 1:50.')
  assert.equal(calmHeadline(friday, at(25, 16, 0)), 'Nothing else on the road today.')
  assert.equal(calmHeadline(saturday, at(26, 9, 0)), 'Baseball at 12:30 still needs a driver.')
})

test('the calm "next" line is one sentence', () => {
  const view = describeNextMove(selectNextMove(friday, at(25, 13, 40)), members, at(25, 13, 40))
  assert.equal(calmNextLine(view), '1:50 · Giselle → Palm Beach Public · Pick up Emme & Owen · in 10 min')
  assert.equal(calmNextLine(null), null)
})

test('tomorrow\'s forecast is read from the first outing that has one', () => {
  const wet = events.map((e) => (e.id === 'softball' ? { ...e, enrichment: { ...e.enrichment, weather_at_event: 'Overcast, 86°F, 2% rain chance' } } : e))
  const plan = buildDayPlan({ date: SATURDAY, members, routines, events: wet })
  assert.equal(forecastLine(plan), 'Overcast, 86° at 12:30 · Ferrin Park Field 1')
  assert.equal(forecastLine(saturday), null)
})


import { tomorrowLine } from '../src/wall/posture.ts'

const kit = [
  { id: 'c6', event_id: 'birthday', label: 'Birthday card', checked: false, sort_order: 1 },
  { id: 'c7', event_id: 'birthday', label: 'Gift', checked: false, sort_order: 2 },
  { id: 'c1', event_id: 'softball', label: 'Glove', checked: true, sort_order: 1 },
  { id: 'c2', event_id: 'softball', label: 'Water bottle', checked: false, sort_order: 2 },
]

test('from 1 PM, tomorrow speaks up with what is still to do, and when the day starts', () => {
  assert.equal(tomorrowLine(saturday, kit, 0, at(25, 12, 59)), null) // too early
  assert.equal(tomorrowLine(saturday, kit, 0, at(25, 13, 0)), "Kelly's Birthday: Birthday card and Gift still to do · 1 more · first out 11:56")
  assert.equal(tomorrowLine(saturday, kit, 0, at(25, 19, 0)), null) // the evening shows tomorrow itself
})

test('tomorrow with a question but nothing to pack still speaks up; with nothing at all it stays quiet', () => {
  const done = kit.map((i) => ({ ...i, checked: true }))
  assert.equal(tomorrowLine(saturday, done, 1, at(25, 14, 0)), '1 to decide · first out 11:56')
  assert.equal(tomorrowLine(saturday, done, 0, at(25, 14, 0)), null)
})
