import test from 'node:test'
import assert from 'node:assert/strict'
import { todoTile, sizeLine, GROUPS } from '../src/wall/todos.ts'

// Board 09b on the wall: the To do tile, and each row's size line.
const item = (id, extra = {}) => ({ id, title: id, shape: 'quick', minutes: null, costCents: null, nextStep: null, needs: [], due: null, overdue: false, snoozedUntil: null, snoozeCount: 0, projectId: null, suggestion: null, ...extra })

test('the tile: how many are ready, and what else is waiting', () => {
  const list = { nextUp: [item('a'), item('b'), item('c')], groups: { quick: [item('d')], fix: [], nudge: [item('t', { shape: 'nudge' })], dated: [], unsorted: [] }, projects: [{ id: 'p' }], suggestions: [{ id: 's' }, { id: 's2' }] }
  assert.deepEqual(todoTile(list), { ready: 3, line: '2 for a yes · 1 project' })
  assert.deepEqual(todoTile({ nextUp: [], groups: { quick: [], fix: [], nudge: [], dated: [], unsorted: [] }, projects: [], suggestions: [] }), { ready: 0, line: 'All clear' })
})

test('a row\'s size line: kind, time, cost, what it needs; a late date says so', () => {
  assert.equal(sizeLine(item('x', { shape: 'fix', minutes: 30, costCents: 2000, needs: ['Safety', 'Buy'] })), 'Fix · 30 min · $20 · Safety · Buy')
  assert.equal(sizeLine(item('y', { minutes: 90 })), 'Quick one · 1 hr 30')
  assert.equal(sizeLine(item('z', { shape: 'dated', due: '2026-09-30' })), 'Dated · Sep 30')
  assert.equal(sizeLine(item('l', { shape: 'fix', due: '2026-09-16', overdue: true })), 'Fix · was due Sep 16')
})

test('the folded groups, in order', () => {
  assert.deepEqual(GROUPS.map((g) => g.key), ['quick', 'fix', 'projects', 'nudge', 'dated', 'unsorted'])
})

// Board 09a: the surface — tonight's nudge on the evening face, one small step in a quiet stretch.
import { tonightNudge, quietStep } from '../src/wall/todos.ts'
const at = (h, m = 0) => new Date(2026, 8, 28, h, m)
const listWith = (nextUp = [], nudge = []) => ({ nextUp, groups: { quick: [], fix: [], nudge, dated: [], unsorted: [] }, projects: [], suggestions: [] })

test('tonight\'s nudge: from two hours before its time until it\'s done or the day ends', () => {
  const trash = item('trash', { shape: 'nudge', title: 'Trash out to the street', dueAt: at(20).toISOString(), due: '2026-09-28' })
  const debris = item('debris', { shape: 'nudge', title: 'Landscaping debris out', dueAt: new Date(2026, 8, 29, 21).toISOString(), due: '2026-09-29' })
  const list = listWith([], [debris, trash])
  assert.equal(tonightNudge(list, at(17, 59)), null, 'too early')
  assert.equal(tonightNudge(list, at(18, 0)).id, 'trash')
  assert.equal(tonightNudge(list, at(23, 30)).id, 'trash', 'still up if not done')
  assert.equal(tonightNudge(listWith([], [debris]), at(20)), null, 'tomorrow\'s waits')
  assert.equal(tonightNudge(listWith([], [{ ...trash, snoozedUntil: '2026-09-29' }]), at(20)), null, 'snoozed')
})

test('a quiet stretch offers one small job that fits, with room to spare', () => {
  const list = listWith([
    item('gfi', { shape: 'fix', minutes: 45 }),
    item('anthony', { minutes: 10, title: 'Call Anthony' }),
  ])
  assert.equal(quietStep(list, at(13), at(14)).id, 'anthony', 'a fix isn\'t offered: Done would claim the whole fix')
  assert.equal(quietStep(listWith([item('gfi2', { shape: 'fix', minutes: 20 })]), at(13), at(15)), null)
  assert.equal(quietStep(listWith([item('pool', { minutes: 20 }), item('anthony', { minutes: 10 })]), at(13), at(15)).id, 'pool', 'first that fits, in Next up order')
  assert.equal(quietStep(list, at(13), at(13, 15)), null, 'no room')
  assert.equal(quietStep(list, at(13), null).id, 'anthony', 'nothing coming up: still a small one')
})
