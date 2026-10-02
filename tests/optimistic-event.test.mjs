import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { optimisticEvent, withEvent } from '../src/lib/optimisticEvent.ts'

// Jake, Oct 2 (Kelly's gym add): "It's all about when the open button shows up on the chat that I can press the button
// and the event shows up. That was the delay." The saved add goes into the phone's copy of the calendar at once.
const family = [{ id: 'kelly', name: 'Kelly', full_name: 'Kelly Tabor' }, { id: 'jake-id', name: 'Jake', full_name: 'Jacob Tabor' }]

test('the add, as the calendar keeps it: times, place, who', () => {
  const e = optimisticEvent('ev1', { title: 'Gym', start: '2026-10-02T23:30:00Z', end: '2026-10-03T01:00:00Z', location: 'Amped Fitness Signature', members: ['Kelly'], event_type: 'event' }, family)
  assert.equal(e.id, 'ev1')
  assert.equal(e.title, 'Gym')
  assert.equal(e.start_time, '2026-10-02T23:30:00Z')
  assert.equal(e.end_time, '2026-10-03T01:00:00Z')
  assert.equal(e.location_name, 'Amped Fitness Signature')
  assert.equal(e.status, 'confirmed')
  assert.equal(e.all_day, false)
  assert.deepEqual(e.members.map((m) => [m.family_member.id, m.role]), [['kelly', 'primary']])
  assert.equal(optimisticEvent('ev2', { title: 'x' }, family), null) // no times: nothing to show
})

test('into a cached range once, as a plain list or a range result', () => {
  const e = optimisticEvent('ev1', { title: 'Gym', start: '2026-10-02T23:30:00Z', end: '2026-10-03T01:00:00Z', members: [] }, family)
  assert.deepEqual(withEvent([{ id: 'a' }], e).map((x) => x.id), ['a', 'ev1'])
  assert.deepEqual(withEvent([{ id: 'ev1' }], e).map((x) => x.id), ['ev1'])
  assert.deepEqual(withEvent({ active: [{ id: 'a' }], other: 1 }, e).active.map((x) => x.id), ['a', 'ev1'])
  assert.equal(withEvent(undefined, e), undefined)
})

test('the yes puts it there before the calendar is fetched again', () => {
  const src = readFileSync(new URL('../src/wall/useAssistantTurn.ts', import.meta.url), 'utf8')
  const put = src.indexOf('withEvent(old, added)')
  const refetch = src.indexOf('invalidateAllCalendarQueries(queryClient, String(args.event_id')
  assert.ok(put > 0 && refetch > put)
})
