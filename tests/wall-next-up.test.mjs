import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { choreDoneKey, comingHours, fitNextUp, nextUpItems, outTonight, stillTonight, tagFor, todoTimeToday } from '../src/wall/nextUp.ts'
import { events, members, routines } from './fixtures/wall-day-2026-09-25.mjs'

// Canvas 27a / 27c (Jake, 2026-10-01, approved): today's chores and timed to-dos as NEXT UP by day, and from 7 PM,
// while the wall looks at tomorrow, what's left of today (and who's still out) as STILL TONIGHT.
const FRIDAY = new Date(2026, 8, 25)
const at = (h, m = 0) => new Date(2026, 8, 25, h, m)
const chores = [
  { id: 'meds', title: 'Take meds', member_id: 'liv', for_member_id: null, days_of_week: [1, 2, 3, 4, 5], time_local: '19:00:00', minutes: 5, enabled: true, every_weeks: 1, starts_on: '2026-09-01' },
  { id: 'trash', title: 'Trash to the street', member_id: 'jake-id', for_member_id: null, days_of_week: [5], time_local: '20:00:00', minutes: 10, enabled: true, every_weeks: 1, starts_on: '2026-09-01' },
]
const gym = { id: 'kelly-gym', title: 'Gym', start_time: at(19).toISOString(), end_time: at(21, 30).toISOString(), all_day: false, event_type: 'event', status: 'confirmed', location_name: 'Gym', address: '1500 N Flagler Dr, West Palm Beach, FL', members: [{ family_member_id: 'kelly', role: 'primary' }] }
const plan = buildDayPlan({ date: FRIDAY, members, routines, events: [...events, gym], chores })
const todo = (id, title, dueAt, extra = {}) => ({ id, title, shape: 'nudge', minutes: 5, costCents: null, nextStep: null, needs: [], due: '2026-09-25', dueAt: dueAt?.toISOString() ?? null, overdue: false, snoozedUntil: null, snoozeCount: 0, projectId: null, suggestion: null, ...extra })
const list = (items) => ({ nextUp: [], groups: { quick: [], fix: [], nudge: items, dated: [], unsorted: [] } })

test('next up: the day’s chores and timed to-dos, in time order, with whose they are', () => {
  const items = nextUpItems(plan, list([todo('call', 'Call Grandma', at(20, 30))]), new Set(), at(17, 50))
  assert.deepEqual(items.map((i) => [i.title, i.kind, i.whoId]), [['Take meds', 'chore', 'liv'], ['Trash to the street', 'chore', 'jake-id'], ['Call Grandma', 'todo', null]])
  assert.ok(items.every((i) => i.state === 'later' && i.tag === null))
})

test('next up: late in rust with how late, due within half an hour in brass, later plain', () => {
  const items = nextUpItems(plan, null, new Set(), at(19, 40))
  assert.deepEqual(items.map((i) => [i.title, i.state, i.tag]), [['Take meds', 'late', '40 min late'], ['Trash to the street', 'soon', 'in 20 min']])
  assert.equal(tagFor(at(15), at(17, 50)), 'Late')
  assert.equal(tagFor(at(20, 31), at(20)), null)
})

test('next up: a ticked chore leaves for that day only; a to-do done leaves', () => {
  const done = new Set([choreDoneKey('meds', FRIDAY), 'todo:call'])
  const items = nextUpItems(plan, list([todo('call', 'Call Grandma', at(20, 30))]), done, at(18))
  assert.deepEqual(items.map((i) => i.title), ['Trash to the street'])
  assert.equal(choreDoneKey('meds', at(23, 59)), choreDoneKey('meds', FRIDAY))
})

test('next up: a to-do without a time today (midnight, or the iOS 5 PM), another day’s, or snoozed is not timed', () => {
  assert.equal(todoTimeToday(todo('a', 'A', at(0)), at(9)), null)
  assert.equal(todoTimeToday(todo('b', 'B', at(17)), at(9)), null)
  assert.equal(todoTimeToday(todo('c', 'C', new Date(2026, 8, 26, 9)), at(9)), null)
  assert.equal(todoTimeToday(todo('d', 'D', at(9), { snoozedUntil: '2026-09-25T20:00:00Z' }), at(8)), null)
  assert.equal(todoTimeToday(todo('e', 'E', at(9, 15)), at(8))?.getTime(), at(9, 15).getTime())
})

test('next up: the same job as a Reminder and a chore, at the same minute, is one line', () => {
  const items = nextUpItems(plan, list([todo('td-trash', 'Trash out to the street', at(20))]), new Set(), at(18))
  assert.deepEqual(items.map((i) => i.title), ['Take meds', 'Trash to the street'])
})

test('still tonight: Kelly at the gym until 9:30 sits among the to-dos by when she went', () => {
  const out = outTonight(plan, members, at(19, 40))
  assert.deepEqual(out.map((i) => [i.title, i.tag, i.whoId]), [['Kelly at the gym', 'until 9:30', 'kelly']])
  const all = stillTonight(nextUpItems(plan, null, new Set(), at(19, 40)), out)
  assert.deepEqual(all.map((i) => i.title), ['Take meds', 'Kelly at the gym', 'Trash to the street'])
  // Home again: off the card.
  assert.deepEqual(outTonight(plan, members, at(21, 45)), [])
})

// Canvas 74C1: one card a box — four across with nothing else in the row, fewer beside get & pack or a decision.
test('next up fits a card a box; the rest are "+N later"', () => {
  assert.deepEqual(fitNextUp([1, 2, 3, 4, 5], 4), { shown: [1, 2, 3, 4], more: 1 })
  assert.deepEqual(fitNextUp([1, 2, 3], 2), { shown: [1, 2], more: 1 })
  assert.deepEqual(fitNextUp([1], 4), { shown: [1], more: 0 })
})

test('next up gets the boxes nothing else needs', async () => {
  const { nextUpBoxes } = await import('../src/wall/nextUp.ts')
  assert.equal(nextUpBoxes({ packing: false, deciding: false }), 4)
  assert.equal(nextUpBoxes({ packing: false, deciding: true }), 3)
  assert.equal(nextUpBoxes({ packing: true, deciding: false }), 2)
  assert.equal(nextUpBoxes({ packing: true, deciding: true }), 1)
})

test('next up by day: the coming four hours and anything late — not 8 PM’s trash at 7 AM', () => {
  const titles = (now) => comingHours(nextUpItems(plan, null, new Set(), now), now).map((i) => i.title)
  assert.deepEqual(titles(at(7, 12)), [])
  assert.deepEqual(titles(at(16)), ['Take meds', 'Trash to the street'])
  assert.deepEqual(titles(at(15, 30)), ['Take meds'])
  // Late stays (Liv's 7 PM meds, unticked, at 9 PM on the full day).
  assert.deepEqual(titles(at(21)), ['Take meds', 'Trash to the street'])
})

test('next up: the half of the day is said when it isn’t now’s — 8 AM’s to-do on the evening card', () => {
  const items = nextUpItems(plan, list([todo('olivia', 'Work on Olivia’s dedication page', at(8))]), new Set(), at(21, 40))
  assert.deepEqual(items.map((i) => [i.title, i.meridiem]), [['Work on Olivia’s dedication page', 'AM'], ['Take meds', null], ['Trash to the street', null]])
})

// Canvas 74C1 (Jake, Oct 8: "is this an event, a reminder, a get and prep and project? how did it get here"): each card
// says what it is above its name and where it came from at its foot.
test('Next up cards: what it is, and how it got here', async () => {
  const { cardKind, originLine } = await import('../src/wall/nextUp.ts')
  const now = new Date(2026, 9, 8, 11, 43)
  assert.equal(cardKind({ kind: 'todo', todoKind: 'reminder' }), 'Reminder')
  assert.equal(cardKind({ kind: 'todo', todoKind: 'step', project: { step: 2, of: 5 } }), 'Project · step 2 of 5')
  assert.equal(cardKind({ kind: 'todo', todoKind: 'step', project: { step: null, of: null } }), 'Project step')
  assert.equal(cardKind({ kind: 'chore' }, 'Jake'), 'Chore · Jake')
  assert.equal(cardKind({ kind: 'out' }), 'Out')
  const at = (d, h, m) => new Date(2026, 9, d, h, m).toISOString()
  assert.equal(originLine({ via: 'alexa', where: 'wall', text: null, at: at(8, 7, 17) }, null, now), 'By Alexa · 7:17 AM')
  assert.equal(originLine({ via: 'alexa', where: 'phone', text: null, at: at(7, 16, 26) }, null, now), 'By Alexa on a phone · Wed 4:26 PM')
  assert.equal(originLine({ via: 'hand', where: 'wall', text: null, at: at(6, 9, 0) }, null, now), 'Added on the wall · Tue 9:00 AM')
  assert.equal(originLine({ via: 'email', where: null, text: 'From Palm Beach Public’s email · Oct 6', at: at(6, 9, 0) }, null, now), 'From Palm Beach Public’s email · Oct 6')
  assert.equal(originLine({ via: 'project', where: null, text: null, at: at(1, 9, 0) }, 'Install Tesla charger in garage', now), 'Install Tesla charger in garage')
  assert.equal(originLine({ via: null, where: null, text: null, at: at(1, 9, 0) }, null, now), 'Added Oct 1')
  assert.equal(originLine(null, null, now), null)
})
