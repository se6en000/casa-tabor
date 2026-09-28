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
