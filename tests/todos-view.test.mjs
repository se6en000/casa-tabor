import test from 'node:test'
import assert from 'node:assert/strict'
import { todoTile, sizeLine, sizeChips, GROUPS, nextUpRoom } from '../src/wall/todos.ts'

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

// Step 5: a project's edits, as the database makes them (todo_project_edit) — used by the fixture.
import { applyProjectEdit } from '../src/wall/todos.ts'
import { timeOf } from '../src/wall/todos.ts'
const detail = () => ({
  project: { id: 'p', title: 'Paint the house', aim_date: null, status: 'active' },
  steps: ['Fix cracks', 'Get 3 quotes', 'Pick colours'].map((title, i) => ({ id: `s${i + 1}`, position: i + 1, title, minutes: null, cost_cents: null, done_at: null, reminder_event_id: null })),
})
const titles = (d) => d.steps.map((s) => `${s.title}${s.done_at ? '✓' : ''}`)

test('project edits: move, rename, add after, delete, done and undo, target date, delete project', () => {
  let d = applyProjectEdit(detail(), 'move_step', { step_id: 's3', dir: 'up' })
  assert.deepEqual(titles(d), ['Fix cracks', 'Pick colours', 'Get 3 quotes'])
  d = applyProjectEdit(d, 'edit_step', { step_id: 's1', title: 'Fix the wall cracks' })
  d = applyProjectEdit(d, 'add_step', { step_id: 's1', title: 'Pick a crack guy' })
  assert.deepEqual(titles(d), ['Fix the wall cracks', 'Pick a crack guy', 'Pick colours', 'Get 3 quotes'])
  d = applyProjectEdit(d, 'delete_step', { step_id: 's3' })
  d = applyProjectEdit(d, 'done_step', { step_id: 's1' })
  assert.deepEqual(titles(d), ['Fix the wall cracks✓', 'Pick a crack guy', 'Get 3 quotes'])
  d = applyProjectEdit(d, 'undo_step', { step_id: 's1' })
  assert.deepEqual(titles(d), ['Fix the wall cracks', 'Pick a crack guy', 'Get 3 quotes'])
  d = applyProjectEdit(d, 'target', { date: '2026-11-26' })
  d = applyProjectEdit(d, 'rename', { title: 'Paint the outside' })
  assert.equal(d.project.aim_date, '2026-11-26')
  assert.equal(d.project.title, 'Paint the outside')
  assert.equal(applyProjectEdit(d, 'delete_project', {}).project.status, 'dropped')
})

test('a to-do\'s time: a date stored at 5 PM means no time (the iOS sync\'s way)', () => {
  assert.equal(timeOf({ due: '2026-10-02', dueAt: new Date(2026, 9, 2, 18, 30).toISOString() }), '18:30')
  assert.equal(timeOf({ due: '2026-10-02', dueAt: new Date(2026, 9, 2, 17, 0).toISOString() }), null)
  assert.equal(timeOf({ due: null, dueAt: null }), null)
})

test('beside the projects shelf, Next up keeps three; the tile says the same', () => {
  const nextUp = ['a', 'b', 'c', 'd'].map((id) => item(id))
  const groups = { quick: [], fix: [], nudge: [], dated: [], unsorted: [] }
  assert.equal(nextUpRoom({ projects: [{ id: 'p', detail: {} }] }), 3)
  assert.equal(todoTile({ nextUp, groups, projects: [{ id: 'p', detail: {} }], suggestions: [] }).ready, 3)
  assert.equal(todoTile({ nextUp, groups, projects: [], suggestions: [] }).ready, 4)
})

// Board 10a's Next up: what it is and what it takes as pills; a project's step says its project instead.
test('size as pills: kind, when, time, cost, needs — late in rust; a project step leaves the kind to its tag', () => {
  assert.deepEqual(sizeChips(item('x', { shape: 'fix', minutes: 20, costCents: 0, needs: ['Hot water'] })), [{ text: 'Fix' }, { text: '20 min' }, { text: 'Hot water' }])
  assert.deepEqual(sizeChips(item('v', { minutes: 15, due: '2026-08-24', overdue: true, needs: ['Call'] })), [{ text: 'Quick one' }, { text: 'was due Aug 24', late: true }, { text: '15 min' }, { text: 'Call' }])
  assert.deepEqual(sizeChips(item('p', { shape: 'project', minutes: 60, costCents: 4000, projectId: 'paint' })), [{ text: '1 hr' }, { text: '$40' }])
})

// A project step's calendar event, tapped: which step of which project it is.
import { stepForEvent } from '../src/wall/todos.ts'
test('a calendar event that is a project step knows its step', () => {
  const list = { projects: [{ id: 'hc', title: 'Halloween costumes', detail: { project: { id: 'hc', title: 'Halloween costumes' }, steps: [
    { id: 'ask', grp: 1, position: 1, title: 'Ask the kids', done_at: null, child_project_id: null, cal_event_id: 'ev-ask' },
    { id: 'order', grp: 2, position: 2, title: 'Order them', done_at: null, child_project_id: null, cal_event_id: null },
  ] } }] }
  assert.deepEqual(stepForEvent(list, 'ev-ask'), { projectId: 'hc', stepId: 'ask', project: 'Halloween costumes', title: 'Ask the kids', number: 1, total: 2, done: false })
  assert.equal(stepForEvent(list, 'other'), null)
})
