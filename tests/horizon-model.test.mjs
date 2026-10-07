import test from 'node:test'
import assert from 'node:assert/strict'
import { horizonDate, horizonGroups, horizonPages, horizonTone } from '../src/wall/comingUp.ts'

// On the Horizon (canvas 63–64; Jake, Oct 7): a reading list by time, nearest first.
const item = (key, date, daysAway) => ({ key, kind: 'event', title: key, date, daysAway, nextStep: '', pokeOn: date, late: false })
const items = [
  item('Heather’s birthday', '2026-10-08', 1), item('Columbus Day', '2026-10-12', 5), item('Picture Day', '2026-10-20', 13),
  item('Emme’s concert', '2026-10-24', 17), item('Orthodontist', '2026-10-28', 21), item('Halloween', '2026-10-31', 24),
  item('Thanksgiving break', '2026-11-23', 47), item('Christmas', '2026-12-25', 79),
]

test('the groups: this week, next two weeks, later this month, next month and on', () => {
  const g = horizonGroups(items, '2026-10-07')
  assert.deepEqual(g.map((x) => [x.heading, x.items.map((i) => i.key)]), [
    ['This week', ['Heather’s birthday', 'Columbus Day']],
    ['Next two weeks', ['Picture Day', 'Emme’s concert']],
    ['Later in October', ['Orthodontist', 'Halloween']],
    ['November and on', ['Thanksgiving break', 'Christmas']],
  ])
  assert.equal(horizonDate('2026-10-08'), 'Thu Oct 8')
  assert.deepEqual(items.slice(0, 4).map(horizonTone), ['rust', 'brass', 'brass', 'brass'])
  assert.equal(horizonTone(items[7]), 'stone')
})

test('pages: two columns of rows; a heading carried to a new column says so again', () => {
  const pages = horizonPages(horizonGroups(items, '2026-10-07'), 4)
  const show = pages.map((p) => p.map((c) => c.map((e) => (e.heading ? `${e.item.key} | ${e.heading}` : e.item.key))))
  assert.deepEqual(show, [
    [['Heather’s birthday | This week', 'Columbus Day', 'Picture Day | Next two weeks'], ['Emme’s concert | Next two weeks', 'Orthodontist | Later in October', 'Halloween']],
    [['Thanksgiving break | November and on', 'Christmas'], []],
  ])
})
