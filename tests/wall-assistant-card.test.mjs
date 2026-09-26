import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { assistantCard, replacedAction, timeRange } from '../src/wall/assistantCard.ts'
import { members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const planDay = (date, evs) => buildDayPlan({ date, members, routines, events: evs })
const ctx = (extra = {}) => ({ events, members, planDay, ...extra })
const local = (d, h, m) => new Date(2026, 8, d, h, m).toISOString()
const add = (args) => ({ tool: 'create_event', args: { title: 'Dentist', event_type: 'event', start: local(25, 16, 0), end: local(25, 17, 0), members: ['Liv'], ...args } })

test('an add says when, where it lands in the first person’s day, and who can drive', () => {
  const card = assistantCard(add({ location: 'Palm Beach Pediatric Dentistry' }), null, ctx({ driveMinutes: 24 }))
  assert.equal(card.kind, 'add')
  assert.equal(card.when, 'Fri, Sep 25 · 4:00 – 5:00 PM')
  assert.equal(card.place, 'Palm Beach Pediatric Dentistry')
  assert.equal(card.lane.memberId, 'liv')
  assert.ok(card.lane.segments.some((s) => s.sourceId === 'new'), 'the draft is in Liv’s lane')
  assert.ok(card.lane.segments.some((s) => /Bak Middle/.test(s.label)), 'with her school day')
  assert.equal(card.leaveBy, '3:36')
  assert.ok(card.drivers.length >= 2)
  assert.ok(card.drivers.every((d) => typeof d.note === 'string'))
  assert.deepEqual(card.touches, ['Nothing else then for Liv'])
})

test('without a known drive there is no leave-by, and no place means no drive at all', () => {
  assert.equal(assistantCard(add({ location: 'Somewhere new' }), null, ctx()).leaveBy, null)
  const home = assistantCard(add({}), null, ctx())
  assert.equal(home.drivers, null)
  assert.equal(home.place, null)
})

test('an add during school says it clashes', () => {
  const card = assistantCard(add({ start: local(25, 10, 0), end: local(25, 11, 0) }), null, ctx())
  assert.ok(card.touches.some((t) => /^Clashes with .*Bak Middle.* \(Liv\)$/.test(t)), card.touches.join(' | '))
})

test('the card says what the latest turn changed on it', () => {
  const before = add({ start: local(25, 15, 30), end: local(25, 16, 30) })
  const after = add({ location: 'Palm Beach Pediatric Dentistry', members: ['Liv', 'Emme'] })
  assert.deepEqual(assistantCard(after, before, ctx()).justChanged, ['3:30 → 4:00', 'place added', 'Emme added'])
  assert.deepEqual(assistantCard(after, null, ctx()).justChanged, [])
})

test('a change says before → after, keeps who is on it, and a new driver is chosen', () => {
  const move = { tool: 'update_event', args: { id: 'softball', start: local(26, 13, 0), end: local(26, 15, 0) } }
  const card = assistantCard(move, null, ctx())
  assert.equal(card.kind, 'change')
  assert.equal(card.when, 'Sat, Sep 26 · 1:00 – 3:00 PM')
  assert.equal(card.before, '12:30 – 2:30 PM')
  const handoff = { tool: 'update_event', args: { id: 'softball', driver_name: 'Kelly' } }
  const kelly = assistantCard(handoff, null, ctx())
  assert.equal(kelly.before, null, 'the time did not move')
  assert.equal(kelly.drivers.find((d) => d.chosen)?.name, 'Kelly')
  assert.deepEqual(assistantCard(handoff, { tool: 'update_event', args: { id: 'softball' } }, ctx()).justChanged, ['Kelly drives'])
})

test('anything else is not a calendar card', () => {
  assert.equal(assistantCard({ tool: 'add_grocery_items', args: {} }, null, ctx()), null)
  assert.equal(assistantCard({ tool: 'update_event', args: { id: 'nope' } }, null, ctx()), null)
  assert.equal(assistantCard(null, null, ctx()), null)
})

test('the card it replaced is the latest earlier one of the same kind and target', () => {
  const m = (tool, args) => ({ toolAction: { tool, args } })
  const a = m('create_event', { title: 'A' })
  const b = m('update_event', { id: 'x' })
  const c = m('create_event', { title: 'A2' })
  assert.deepEqual(replacedAction([a, b, c], c), { tool: 'create_event', args: { title: 'A' } })
  assert.equal(replacedAction([a, b, c], b), null)
})

test('times read like a wall clock', () => {
  assert.equal(timeRange(new Date(2026, 8, 25, 11, 30), new Date(2026, 8, 25, 13, 0)), '11:30 AM – 1:00 PM')
})
