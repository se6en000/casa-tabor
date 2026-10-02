import test from 'node:test'
import assert from 'node:assert/strict'
import { monthCells, monthDots, dayLine } from '../src/phone/month.ts'

// Canvas 30b (Jake, Oct 2): any date — the month's grid, who has something each day, and the chosen day's first line.
const ev = (id, title, from, to, who, extra = {}) => ({ id, title, start_time: from.toISOString(), end_time: to.toISOString(), all_day: false, event_type: 'event', status: 'confirmed', members: who.map((w) => ({ family_member_id: w, role: 'primary' })), ...extra })
const members = [{ id: 'jake' }, { id: 'kelly' }, { id: 'emme' }]
const events = [
  ev('build', 'Emme’s build night', new Date(2026, 9, 17, 18), new Date(2026, 9, 17, 20), ['emme']),
  ev('dentist', 'Owen dentist', new Date(2026, 9, 17, 15, 30), new Date(2026, 9, 17, 16, 30), ['kelly']),
  ev('trip', 'Dallas', new Date(2026, 9, 7, 0), new Date(2026, 9, 9, 0), ['jake'], { all_day: true }),
  ev('todo', 'Call the vet', new Date(2026, 9, 17, 9), new Date(2026, 9, 17, 9, 15), ['jake'], { event_type: 'reminder' }),
  ev('gone', 'Cancelled', new Date(2026, 9, 20, 9), new Date(2026, 9, 20, 10), ['jake'], { status: 'cancelled' }),
]

test('month: October 2026 starts on a Thursday — four blanks, then 31 days', () => {
  const cells = monthCells(new Date(2026, 9, 1))
  assert.deepEqual(cells.slice(0, 5), [null, null, null, null, 1])
  assert.equal(cells.filter(Boolean).length, 31)
})

test('month: a dot for each person with something that day, in the family’s order; reminders and cancelled don’t count', () => {
  const dots = monthDots(events, new Date(2026, 9, 1), members)
  assert.deepEqual(dots.get(17), ['kelly', 'emme'])
  assert.deepEqual([dots.get(7), dots.get(8), dots.get(9)], [['jake'], ['jake'], undefined])
  assert.equal(dots.get(20), undefined)
})

test('month: the chosen day’s first line', () => {
  assert.equal(dayLine(events, new Date(2026, 9, 17)), 'Owen dentist · 3:30 · +1 more')
  assert.equal(dayLine(events, new Date(2026, 9, 7)), 'Dallas · all day')
  assert.equal(dayLine(events, new Date(2026, 9, 21)), 'Nothing on the calendar')
})
