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

import { fitPackingColumns } from '../src/wall/packing.ts'

test('in columns, a whole event moves to the next column rather than splitting; the last column cuts and counts', () => {
  const fit = fitPackingColumns([
    group('a', 'A · 7:00', [['1', false], ['2', false]]),              // 3 lines
    group('b', 'B · 9:00', [['3', false], ['4', false], ['5', false]]), // 4 lines: doesn't fit under A, goes right
    group('c', 'C · 11:00', [['6', false], ['7', false]]),             // nowhere left: counted
  ], 4, 2)
  assert.deepEqual(fit.columns.map((col) => col.map((g) => g.eventId)), [['a'], ['b']])
  assert.equal(fit.hidden, 2)
})

test('an event too long for any column starts one and is cut there', () => {
  const fit = fitPackingColumns([group('big', 'Big · 7:00', [['1', false], ['2', false], ['3', false], ['4', false], ['5', false]])], 4, 2)
  assert.deepEqual(fit.columns[0][0].items.map((i) => i.label), ['1', '2', '3'])
  assert.equal(fit.hidden, 2)
})

// Jake, 2026-10-01: "the home page/today should show the get and pack section so I can check off the things I need …
// able to see what was checked off", then: "use that area to show as much as possible … only use 'see all' when the
// things truly won't fit". An event already under way keeps its list (what wasn't ticked); it's only marked started,
// so it's the first to give up its column when there are more events than room.
test('today: an event under way keeps its list, marked started; the count is the whole day', () => {
  const items = [item('birthday', 'Card'), item('baseball', 'Glove', true), item('softball', 'Cleats')]
  // At 10:00 on Saturday the 9:00 birthday has started; the 12:30 games are still ahead.
  const today = packingGroups(saturday, items, { from: new Date(2026, 8, 26, 10, 0) })
  assert.deepEqual(today.groups.map((g) => [g.eventId, Boolean(g.started)]), [['birthday', true], ['baseball', false], ['softball', false]])
  assert.deepEqual([today.packed, today.total], [1, 3])
})

test('with more events than columns, the ones under way give up their place first, and are counted', async () => {
  const { fitPackingColumns } = await import('../src/wall/packing.ts')
  const g = (id, started = false) => ({ eventId: id, heading: id, started, items: [item(id, 'One'), item(id, 'Two')] })
  // Room for all three: every one shows, in time order, started or not.
  assert.deepEqual(fitPackingColumns([g('trip', true), g('bat'), g('gym')], 6, 4).columns.map((c) => c.map((x) => x.eventId)), [['trip'], ['bat'], ['gym']])
  // Five events, four columns: the one under way steps aside.
  const five = fitPackingColumns([g('trip', true), g('a'), g('b'), g('c'), g('d')], 6, 4)
  assert.deepEqual(five.columns.map((c) => c.map((x) => x.eventId)), [['a'], ['b'], ['c'], ['d']])
  assert.equal(five.hidden, 2)
})

// Jake, 2026-10-01: "for get and pack on the today page, don't you think you can fit 3 or 4 columns instead of 2?"
test('today\'s get & pack spreads across 3 columns (4 with no decision beside it); what still doesn\'t fit is counted', async () => {
  const { fitPackingColumns } = await import('../src/wall/packing.ts')
  const groups = ['a', 'b', 'c', 'd'].map((id) => ({ eventId: id, heading: id, items: [item(id, 'One'), item(id, 'Two')] }))
  const three = fitPackingColumns(groups, 3, 3)
  assert.deepEqual(three.columns.map((c) => c.map((g) => g.eventId)), [['a'], ['b'], ['c']])
  assert.equal(three.hidden, 2)
  const four = fitPackingColumns(groups, 3, 4)
  assert.equal(four.columns.length, 4)
  assert.equal(four.hidden, 0)
})
