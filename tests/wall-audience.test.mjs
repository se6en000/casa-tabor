import test from 'node:test'
import assert from 'node:assert/strict'
import { eventsFor, routinesFor, withKeptFrom, keptFrom, keepFromSuggestion } from '../src/wall/audience.ts'

const members = [
  { id: 'jake', name: 'Jake', role: 'parent', can_drive: true, show_on_home_sidebar: true },
  { id: 'kelly', name: 'Kelly', role: 'parent', can_drive: true, show_on_home_sidebar: true },
  { id: 'liv', name: 'Liv', role: 'child', can_drive: false, show_on_home_sidebar: true },
  { id: 'owen', name: 'Owen', role: 'child', can_drive: false, show_on_home_sidebar: true },
  { id: 'tabor', name: 'Tabor Family', role: 'child', can_drive: false, show_on_home_sidebar: false },
  { id: 'giselle', name: 'Giselle', role: 'caregiver', can_drive: true, show_on_home_sidebar: true },
]
const ev = (id, title, people = [], extra = {}) => ({ id, title, start_time: '2026-09-27T16:00:00Z', end_time: '2026-09-27T17:00:00Z', members: people.map(([m, role = 'attendee']) => ({ family_member_id: m, role })), ...extra })
const events = [
  ev('party', 'Surprise party for Kelly', [['jake', 'primary']]),
  ev('yoga', 'Kelly Yoga', [['kelly', 'primary']]),
  ev('dinner', 'Jake & Kelly dinner', [['jake'], ['kelly']]),
  ev('softball', 'Softball', [['liv', 'primary'], ['kelly', 'driver']]),
  ev('haircut', 'Owen haircut', [['owen']]),
  ev('errand', 'Pick up dry cleaning', [], { plan_override: { transportation_plan: { legs: [{ driverId: 'giselle' }] } } }),
  ev('birthday', "Kelly's Birthday", []),
  ev('family', 'Tabor Family photo', [['tabor']]),
]
const ids = (list) => list.map((e) => e.id)
const keep = withKeptFrom({}, 'party', ['kelly'])

test('keep-from is a plain saved list: set, read, and cleared by an empty list', () => {
  assert.deepEqual(keptFrom(keep, 'party'), ['kelly'])
  assert.deepEqual(keptFrom(keep, 'yoga'), [])
  assert.deepEqual(withKeptFrom(keep, 'party', []), {})
})

test('the wall never shows an event kept from anyone (everyone sees the wall)', () => {
  assert.deepEqual(ids(eventsFor({ kind: 'wall' }, events, members, keep)), ['yoga', 'dinner', 'softball', 'haircut', 'errand', 'birthday', 'family'])
})

test('the person it is kept from never gets it; everyone else still does', () => {
  assert.equal(ids(eventsFor({ kind: 'member', memberId: 'kelly' }, events, members, keep)).includes('party'), false)
  assert.equal(ids(eventsFor({ kind: 'member', memberId: 'jake' }, events, members, keep)).includes('party'), true)
  assert.equal(ids(eventsFor({ kind: 'member', memberId: 'liv' }, events, members, keep)).includes('party'), true)
})

test("Giselle sees what involves the kids and what she drives — not Jake's and Kelly's own", () => {
  assert.deepEqual(ids(eventsFor({ kind: 'member', memberId: 'giselle' }, events, members, keep)), ['softball', 'haircut', 'errand'])
})

test("Giselle's school runs are the kids' routines only", () => {
  const routines = [{ memberId: 'liv' }, { memberId: 'jake' }, { memberId: 'owen' }, { memberId: 'tabor' }]
  assert.deepEqual(routinesFor({ kind: 'member', memberId: 'giselle' }, routines, members).map((r) => r.memberId), ['liv', 'owen'])
  assert.equal(routinesFor({ kind: 'member', memberId: 'jake' }, routines, members).length, 4)
  assert.equal(routinesFor({ kind: 'wall' }, routines, members).length, 4)
})

test('a celebration suggests keeping it from the person it celebrates, until it is', () => {
  assert.deepEqual(keepFromSuggestion(events[0], members, {}), ['kelly'])
  assert.deepEqual(keepFromSuggestion(events[0], members, keep), [])
  assert.deepEqual(keepFromSuggestion(events[1], members, {}), [])
})
