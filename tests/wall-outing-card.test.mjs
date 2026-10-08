import test from 'node:test'
import assert from 'node:assert/strict'
import { addArgs, eveningLine, goingFor, leaveBy, ticketsDue } from '../src/wall/outingCard.ts'

// Canvas 77 (Jake, Oct 8: "build it"): an outing's card — Add to calendar with who's going, when, leave by, that evening,
// a reminder to get tickets. Thursday Oct 8; Taste of West Palm Beach, Friday Oct 16 at 6.
const members = [
  { id: 'j', name: 'Jake', role: 'parent', can_drive: true }, { id: 'k', name: 'Kelly', role: 'parent', can_drive: true },
  { id: 'l', name: 'Liv', role: 'child', can_drive: false }, { id: 'e', name: 'Emme', role: 'child', can_drive: false },
  { id: 'g', name: 'Giselle', role: 'caregiver', can_drive: true },
]
const taste = { id: 't', kind: 'couple', title: 'Taste of West Palm Beach', when: '2026-10-16 18:00', place: 'CityPlace', address: '700 S. Rosemary Avenue, West Palm Beach', url: 'https://example.org/taste', free: false, drive_min: 8, status: 'new' }

test('who goes: the two of them for an evening out, everyone for a family one (never the sitter)', () => {
  assert.deepEqual(goingFor('couple', members), ['j', 'k'])
  assert.deepEqual(goingFor('music', members), ['j', 'k'])
  assert.deepEqual(goingFor('family', members), ['j', 'k', 'l', 'e'])
})

test('leave by: the start, less the drive and a few minutes', () => {
  assert.equal(leaveBy(taste), '5:45 · 8 min drive')
  assert.equal(leaveBy({ ...taste, drive_min: null }), null)
})

test('a reminder to get tickets a few days before — for a ticketed one only', () => {
  assert.deepEqual(ticketsDue(taste, null, '2026-10-08'), { due: '2026-10-12', day: 'Monday' })
  // Close in: tomorrow.
  assert.deepEqual(ticketsDue({ ...taste, when: '2026-10-10 18:00' }, null, '2026-10-08'), { due: '2026-10-09', day: 'tomorrow' })
  assert.equal(ticketsDue({ ...taste, free: true }, null, '2026-10-08'), null)
  // Its page said tickets.
  assert.deepEqual(ticketsDue({ ...taste, free: null }, { ticket_url: 'https://x' }, '2026-10-08'), { due: '2026-10-12', day: 'Monday' })
})

test('that evening: what else the ones going have on, or that nothing is', () => {
  const ev = (title, start, end, ids) => ({ id: title, title, start_time: start, end_time: end, all_day: false, location_name: null, address: null, members: ids.map((id) => ({ family_member_id: id })) })
  assert.equal(eveningLine(taste, ['j', 'k'], [], members), 'Nothing else on for Jake or Kelly')
  const gym = ev('Gym', new Date(2026, 9, 16, 19, 0).toISOString(), new Date(2026, 9, 16, 20, 0).toISOString(), ['k'])
  const lunch = ev('Lunch', new Date(2026, 9, 16, 12, 0).toISOString(), new Date(2026, 9, 16, 13, 0).toISOString(), ['j'])
  assert.equal(eveningLine(taste, ['j', 'k'], [gym, lunch], members), 'Kelly: Gym at 7:00')
})

test('the event it adds: its time, place and people, and what to know in its notes', () => {
  const a = addArgs(taste, { facts: [{ label: 'Tickets', text: '$75 general · $130 VIP' }], ticket_url: 'https://tickets', ends: '20:30' }, ['j', 'k'], members)
  assert.equal(a.title, 'Taste of West Palm Beach')
  assert.equal(a.start, new Date(2026, 9, 16, 18, 0).toISOString())
  assert.equal(a.end, new Date(2026, 9, 16, 20, 30).toISOString())
  assert.equal(a.location, '700 S. Rosemary Avenue, West Palm Beach')
  assert.deepEqual(a.members, ['Jake', 'Kelly'])
  assert.equal(a.event_type, 'event')
  assert.equal(a.notes, 'Tickets: $75 general · $130 VIP\nTickets: https://tickets\nIts page: https://example.org/taste')
  // No end said: two hours.
  assert.equal(addArgs(taste, null, ['j'], members).end, new Date(2026, 9, 16, 20, 0).toISOString())
})
