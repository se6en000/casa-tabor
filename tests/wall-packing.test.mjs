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

import { fitPacking } from '../src/wall/packing.ts'

const group = (eventId, heading, items) => ({ eventId, heading, items: items.map(([label, checked], i) => ({ id: `${eventId}-${i}`, event_id: eventId, label, checked, sort_order: i })) })

test('packed items fold into one "N packed" line instead of a line each', () => {
  const fit = fitPacking([group('bday', "Kelly's Birthday · 7:00", [['Card', true], ['Gift', false], ['Kids gift', true]])], 7)
  assert.deepEqual(fit.groups[0].items.map((i) => i.label), ['Gift'])
  assert.equal(fit.groups[0].packed, 2)
  assert.equal(fit.hidden, 0)
})

test('what does not fit is counted as "more", and only things still to pack count', () => {
  const fit = fitPacking([
    group('a', 'A · 7:00', [['1', false], ['2', false], ['3', true]]),
    group('b', 'B · 9:00', [['4', false], ['5', false], ['6', false], ['7', false]]),
  ], 6)
  // A: heading + 2 + "1 packed" = 4 lines; B: heading + 1 item = the last 2.
  assert.deepEqual(fit.groups.map((g) => g.items.map((i) => i.label)), [['1', '2'], ['4']])
  assert.equal(fit.hidden, 3)
})

test('a group that is all packed shows just its heading and the packed count', () => {
  const fit = fitPacking([group('done', 'Yoga · 9:00', [['Mat', true], ['Water', true]])], 7)
  assert.deepEqual(fit.groups[0].items, [])
  assert.equal(fit.groups[0].packed, 2)
})

test('when space runs out, a thing still to pack wins over the "N packed" line', () => {
  const fit = fitPacking([
    group('a', 'A · 7:00', [['1', false], ['2', false], ['3', false]]),
    group('b', 'B · 9:00', [['Glove', true], ['Water', false], ['Cleats', false]]),
  ], 6)
  assert.deepEqual(fit.groups[1].items.map((i) => i.label), ['Water'])
  assert.equal(fit.groups[1].packed, 1) // counted, shown only if there's a line left
  assert.equal(fit.groups[1].showPacked, false)
  assert.equal(fit.hidden, 1)
})
