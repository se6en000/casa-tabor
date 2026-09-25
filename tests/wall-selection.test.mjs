import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { eventForPerson } from '../src/wall/selection.ts'
import { FRIDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const plan = buildDayPlan({ date: FRIDAY, members, routines, events })
const isEvent = (id) => events.some((e) => e.id === id)

test('a person opens what they are in now, else their next calendar item; school runs are not calendar items', () => {
  assert.equal(eventForPerson(plan, 'jake-id', at(25, 9, 0), isEvent), 'photobook')
  assert.equal(eventForPerson(plan, 'emme', at(25, 14, 5), isEvent), 'spirit-day')
  assert.equal(eventForPerson(plan, 'emme', at(25, 15, 0), isEvent), 'violin')
  assert.equal(eventForPerson(plan, 'liv', at(25, 9, 0), isEvent), null)
  assert.equal(eventForPerson(plan, 'jake-id', at(25, 18, 0), isEvent), null)
})
