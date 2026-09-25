import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { selectPosture, eveningFocus, calmHeadline, calmNextLine, forecastLine, decisions } from '../src/wall/posture.ts'
import { describeNextMove } from '../src/wall/header.ts'
import { selectNextMove } from '../src/wall/engine/nextMove.ts'
import { FRIDAY, SATURDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const friday = buildDayPlan({ date: FRIDAY, members, routines, events })
const saturday = buildDayPlan({ date: SATURDAY, members, routines, events })

test('the morning rush is launch, from 6 AM until the last school run arrives', () => {
  assert.equal(selectPosture(friday, at(25, 5, 59)), 'evening')
  assert.equal(selectPosture(friday, at(25, 6, 0)), 'launch')
  assert.equal(selectPosture(friday, at(25, 7, 50)), 'launch') // Kelly and Liv arrive 8:00
  assert.equal(selectPosture(friday, at(25, 8, 0)), 'calm')
})

test('a departure within 5 minutes is launch; further out is calm', () => {
  assert.equal(selectPosture(friday, at(25, 13, 44)), 'calm') // Giselle leaves 1:50
  assert.equal(selectPosture(friday, at(25, 13, 45)), 'launch')
})

test('a weekend with no school runs has no morning rush', () => {
  assert.equal(selectPosture(saturday, at(26, 7, 0)), 'calm')
  assert.equal(selectPosture(saturday, at(26, 11, 52)), 'launch') // softball leaves 11:56
})

test('from 7 PM until 5 AM it is evening', () => {
  assert.equal(selectPosture(friday, at(25, 18, 59)), 'calm')
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

test('decisions: trips with no driver, and trips one car could share', () => {
  assert.deepEqual(decisions(saturday, at(25, 20, 0)), [
    'Baseball at 12:30 needs a driver.',
    'Baseball and Softball are both at Ferrin Park Field 1 at 12:30 — one car could do both.',
  ])
  assert.deepEqual(decisions(saturday, at(26, 13, 0)), [])
  assert.deepEqual(decisions(friday, at(25, 7, 0)), [])
})
