import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { selectHeaderLead, thenItems, describeHomeLead, isFyi } from '../src/wall/headerLead.ts'
import { events, members, routines } from './fixtures/wall-day-2026-09-25.mjs'

// Canvas 29e/29f (Jake, 2026-10-01): the header leads with a one-off at home over a routine run the sitter covers
// when the two are within 45 minutes, keeps it until it's over, and lists the next three under THEN.
const at = (h, m = 0) => new Date(2026, 8, 25, h, m)
const item = (id, title, from, to, who) => ({ id, title, start_time: from.toISOString(), end_time: to.toISOString(), all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [{ family_member_id: who, role: 'primary' }] })
const plumber = item('plumber', 'Plumber · water heater', at(15, 15), at(16, 15), 'jake-id')
const call = item('call', 'Video call with Towid', at(16), at(16, 30), 'kelly')
const plan = (extra = [], state) => buildDayPlan({ date: new Date(2026, 8, 25), members, routines, events: [...events, ...extra], tripState: state })
const lead = (p, now) => {
  const l = selectHeaderLead(p, members, now)
  return l?.kind === 'move' ? `move:${l.move.trips[0].title}` : l ? `home:${l.item.title}${l.now ? ' (now)' : ''}` : null
}

test('header: Giselle’s routine pickup is FYI; one Jake drives is not', () => {
  const p = plan()
  assert.equal(isFyi(p.trips.find((t) => t.title === 'Pick up Liv'), members), true)
  assert.equal(isFyi(p.trips.find((t) => t.title === 'Drop off Emme & Owen'), members), false)
})

test('header: the race — the plumber at 3:15 takes it from Giselle’s 3:12 routine pickup; the pickup is first under THEN', () => {
  const p = plan([plumber, call])
  assert.equal(lead(p, at(14, 45)), 'home:Plumber · water heater')
  const then = thenItems(p, members, selectHeaderLead(p, members, at(14, 45)), at(14, 45))
  assert.deepEqual(then.map((i) => [i.kind, i.title, i.routine, i.before]), [['move', 'Pick up Liv', true, true], ['home', 'Video call with Towid', false, false]].concat(then.length > 2 ? [[then[2].kind, then[2].title, then[2].routine, then[2].before]] : []))
})

test('header: earlier, nothing one-off is close — the next move leads; THEN shows the race coming', () => {
  const p = plan([plumber, call])
  assert.equal(lead(p, at(13, 15)), 'move:Pick up Emme & Owen')
  assert.deepEqual(thenItems(p, members, selectHeaderLead(p, members, at(13, 15)), at(13, 15)).map((i) => i.title), ['Pick up Liv', 'Plumber · water heater', 'Video call with Towid'])
})

test('header: more than 45 minutes apart, the sooner one leads', () => {
  const late = item('plumber', 'Plumber · water heater', at(16, 5), at(17), 'jake-id')
  assert.equal(lead(plan([late]), at(14, 45)), 'move:Pick up Liv')
})

test('header: an appointment keeps the header until it’s over', () => {
  const p = plan([plumber, call])
  assert.equal(lead(p, at(15, 40)), 'home:Plumber · water heater (now)')
  // The call at 4:00 waits under THEN while the plumber's still here.
  assert.equal(lead(p, at(16, 5)), 'home:Plumber · water heater (now)')
  assert.equal(lead(p, at(16, 20)), 'home:Video call with Towid (now)')
})

test('header: a run Jake has to make is not FYI — it leads when it’s sooner', () => {
  const p = plan([plumber])
  // Jake picks Liv up instead of Giselle.
  const mine = { ...p, trips: p.trips.map((t) => (t.title === 'Pick up Liv' ? { ...t, driverId: 'jake-id' } : t)) }
  assert.equal(lead(mine, at(14, 45)), 'move:Pick up Liv')
  // And at 3:00, still before he leaves at 3:12.
  assert.equal(lead(mine, at(15, 0)), 'move:Pick up Liv')
})

test('header: the words for something at home', () => {
  const h = { id: 'plumber', title: 'Plumber · water heater', start: at(15, 15), end: at(16, 15), memberIds: ['jake-id'] }
  const before = describeHomeLead(h, false, members, at(14, 45))
  assert.equal(before.eyebrow, 'AT HOME · 3:15')
  assert.equal(before.detail, 'Jake · 3:15 to 4:15 · about an hour')
  assert.deepEqual([before.ring.value, before.ring.unit], ['30', 'MIN'])
  const during = describeHomeLead(h, true, members, at(15, 40))
  assert.equal(during.eyebrow, 'AT HOME · NOW · UNTIL 4:15')
  assert.equal(during.detail, 'Jake · until 4:15 · about an hour')
})
