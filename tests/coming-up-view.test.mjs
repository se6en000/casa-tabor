import test from 'node:test'
import assert from 'node:assert/strict'
import { comingUpSections, planByLine, comingUpTile, ideasByPerson } from '../src/wall/comingUp.ts'

// The Coming up screen (boards 07a/07b, approved 2026-09-27: "ok lets build it all … approved").
const item = (key, pokeOn, date, daysAway, extra = {}) => ({ key, kind: 'deadline', title: key, date, daysAway, nextStep: 'Get it done', pokeOn, late: false, ...extra })
const today = '2026-09-27'
const items = [
  item('ac', '2026-09-23', '2026-09-30', 3, { late: true }),
  item('columbus', '2026-09-27', '2026-10-12', 15),
  item('dentist', '2026-10-02', '2026-10-09', 12),
  item('carl', '2026-10-05', '2026-12-04', 68, { ideas: [] }),
  item('thanks', '2026-10-27', '2026-11-26', 60),
]

test('start now (late, or its day is today), this week, later', () => {
  assert.deepEqual(comingUpSections(items, today).map((s) => [s.heading, s.items.map((i) => i.key)]), [
    ['START NOW', ['ac', 'columbus']],
    ['THIS WEEK', ['dentist']],
    ['LATER', ['carl', 'thanks']],
  ])
  assert.deepEqual(comingUpSections([], today), [])
})

test('the plan-by line: when to start, how far off, and late in words', () => {
  assert.equal(planByLine(items[0], today), 'Plan by Sep 23 · late · in 3 days')
  assert.equal(planByLine(items[1], today), 'Plan by today · in 15 days')
  assert.equal(planByLine(items[3], today), 'Plan by Oct 5 · in 68 days')
  assert.equal(planByLine(item('x', '2026-09-28', '2026-09-28', 1), today), 'Plan by tomorrow · tomorrow')
})

test('the eighth tile: how many, and how many to start now', () => {
  assert.deepEqual(comingUpTile(items, today), { count: 5, startNow: 2 })
})

test('gift ideas by person, for the Gift ideas sheet', () => {
  assert.deepEqual(ideasByPerson([{ for_name: 'Jebb', idea: 'sweatshirt' }, { for_name: 'Kelly', idea: 'ceramic class' }, { for_name: 'jebb', idea: 'hat' }]),
    [{ name: 'Jebb', ideas: ['sweatshirt', 'hat'] }, { name: 'Kelly', ideas: ['ceramic class'] }])
})
