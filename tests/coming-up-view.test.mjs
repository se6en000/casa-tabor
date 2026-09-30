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
    [
      { name: 'Jebb', ideas: ['sweatshirt', 'hat'], items: [{ for_name: 'Jebb', idea: 'sweatshirt' }, { for_name: 'jebb', idea: 'hat' }] },
      { name: 'Kelly', ideas: ['ceramic class'], items: [{ for_name: 'Kelly', idea: 'ceramic class' }] },
    ])
})

// Live on the kiosk 2026-09-27 the list had 9 items: split by count, the left column held five rows
// and three headings, and the fifth ran under the week strip. Columns fill by height, and what
// doesn't fit two columns goes to the next page ("N more").
import { comingUpPages, COMING_UP_SIZES } from '../src/wall/comingUp.ts'

const live = [
  item('ac', '2026-09-23', '2026-09-30', 3, { late: true }),
  item('columbus', '2026-09-28', '2026-10-12', 15),
  item('dentist', '2026-10-02', '2026-10-09', 12),
  item('cats', '2026-10-03', '2026-10-10', 13),
  item('forms', '2026-10-05', '2026-10-12', 15),
  item('tryouts', '2026-10-05', '2026-10-19', 22),
  item('carl', '2026-10-05', '2026-12-04', 68, { ideas: ['a fly-fishing reel'] }),
  item('thanks', '2026-10-27', '2026-11-26', 60),
  item('veterans', '2026-10-28', '2026-11-11', 45),
]
const heightOf = (col) => col.reduce((h, e) => h + (e.heading ? COMING_UP_SIZES.heading : 0) + COMING_UP_SIZES.row + (e.item.ideas?.length ? COMING_UP_SIZES.ideas : 0), 0)

test('every column fits the space, whatever the headings and gift ideas add', () => {
  const pages = comingUpPages(live, today)
  for (const page of pages) {
    assert.ok(page.length <= 2)
    for (const col of page) assert.ok(heightOf(col) <= COMING_UP_SIZES.area, `a column is ${heightOf(col)}px`)
  }
  assert.deepEqual(pages.flat(2).map((e) => e.item.key), live.map((i) => i.key), 'every item once, in order')
  assert.ok(pages.length >= 2, 'nine live items need a second page')
})

test('a section split across a column or a page says so', () => {
  const pages = comingUpPages(live, today)
  const firsts = pages.flatMap((page) => page.map((col) => col[0]))
  for (const e of firsts) assert.ok(e.heading, `${e.item.key} opens a column without a heading`)
  assert.ok(firsts.slice(1).some((e) => /CONTINUED$/.test(e.heading)))
})

test('a short list is one page, as before', () => {
  const pages = comingUpPages(items, today)
  assert.equal(pages.length, 1)
  assert.deepEqual(pages[0].map((col) => col.map((e) => e.item.key)), [['ac', 'columbus', 'dentist'], ['carl', 'thanks']])
  assert.deepEqual(comingUpPages([], today), [])
})

test('on a phone, an item keeps its gift ideas from the person they are for', async () => {
  const { forViewer } = await import('../src/wall/comingUp.ts')
  const liv = item('liv', '2026-09-27', '2026-11-02', 36, { kind: 'birthday', ideas: ['a gymnastics coach'], ideasFor: ['m-liv'] })
  assert.equal(forViewer([liv], 'm-liv')[0].ideas, undefined)
  assert.deepEqual(forViewer([liv], 'm-jake')[0].ideas, ['a gymnastics coach'])
})
