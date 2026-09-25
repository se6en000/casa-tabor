import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { packingEventIds, packingGroups } from '../src/wall/packing.ts'
import { FRIDAY, SATURDAY, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const saturday = buildDayPlan({ date: SATURDAY, members, routines, events })
const item = (event_id, label, checked = false, sort_order = 0) => ({ id: `${event_id}:${label}`, event_id, label, checked, sort_order })

test('packing covers the day\'s outings and timed activities, in time order', () => {
  assert.deepEqual(packingEventIds(saturday), ['birthday', 'baseball', 'softball'])
  // Friday: the photobook reminder, spirit day and violin, but never a routine (school has no checklist).
  assert.deepEqual(packingEventIds(buildDayPlan({ date: FRIDAY, members, routines, events })), ['photobook', 'spirit-day', 'violin'])
})

test('items are grouped under their event with its time, packed ones counted', () => {
  const items = [
    item('softball', 'Cleats', false, 2),
    item('softball', 'Glove', true, 1),
    item('baseball', 'Glove'),
    item('not-tomorrow', 'Sunscreen'),
  ]
  const { groups, packed, total } = packingGroups(saturday, items)
  assert.deepEqual(groups.map((g) => g.heading), ['Baseball · 12:30', 'Softball · 12:30'])
  assert.deepEqual(groups[1].items.map((i) => i.label), ['Glove', 'Cleats'])
  assert.equal(packed, 1)
  assert.equal(total, 3)
})

test('nothing to pack: no groups', () => {
  assert.deepEqual(packingGroups(saturday, []).groups, [])
})
