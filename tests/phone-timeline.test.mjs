import test from 'node:test'
import assert from 'node:assert/strict'
import { dayTimeline, isPast, untilWords, foldLabel } from '../src/phone/timeline.ts'

// Canvas 30a (Jake, Oct 2): where we are in the day — what's started above the NOW line (the last two in view, the
// rest folded), finished ones faded, the next lifted with how long until it.
const at = (h, m = 0) => new Date(2026, 9, 2, h, m)
const item = (id, title, from, to, time = 'x') => ({ id, title, at: from, end: to, time })
const day = [
  item('ad', 'Spirit Day', at(0), at(23, 59), 'All day'),
  item('pbp', 'Palm Beach Public', at(7, 35), at(14)),
  item('bak', 'Bak Middle School', at(8), at(15, 30)),
  item('coach', 'Message Coach Salas', at(8, 26), at(8, 41)),
  item('milo', 'Milo grooming', at(9), at(10)),
  item('sci', 'Science Diagnostic Assessment', at(9), at(9, 45)),
  item('towid', 'Conference with Towid', at(11, 30), at(12, 30)),
  item('olivia', 'Work on Olivia’s dedication page', at(12, 15), at(12, 30)),
]

test('now: what has started goes above the line — two in view, the rest folded; the first after is next', () => {
  const t = dayTimeline(day, at(10, 5))
  assert.deepEqual(t.allDay.map((i) => i.id), ['ad'])
  assert.deepEqual(t.folded.map((i) => i.id), ['pbp', 'bak', 'coach'])
  assert.deepEqual(t.before.map((i) => i.id), ['milo', 'sci'])
  assert.deepEqual(t.after.map((i) => i.id), ['towid', 'olivia'])
  assert.equal(t.nextId, 'towid')
})

test('now: finished fades; still going (school until 2:00) doesn’t', () => {
  assert.equal(isPast(day[4], at(10, 5)), true)
  assert.equal(isPast(day[1], at(10, 5)), false)
})

test('now: before anything starts nothing folds; after everything there is no next', () => {
  const early = dayTimeline(day, at(6))
  assert.deepEqual([early.folded.length, early.before.length, early.nextId], [0, 0, 'pbp'])
  const late = dayTimeline(day, at(21))
  assert.equal(late.nextId, null)
  assert.equal(late.after.length, 0)
})

test('now: how long until, and what folded', () => {
  assert.equal(untilWords(at(11, 30), at(10, 5)), 'In 1 hr 25 min')
  assert.equal(untilWords(at(10, 30), at(10, 5)), 'In 25 min')
  assert.equal(untilWords(at(12, 5), at(10, 5)), 'In 2 hr')
  assert.equal(foldLabel(day.slice(1, 4)), '3 earlier · Palm Beach Public, Bak Middle School, Message Coach Salas')
})
