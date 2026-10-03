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

test('the yes puts it there before the save, keeps it when saved, and before the calendar is fetched again', () => {
  const src = readFileSync(new URL('../src/wall/useAssistantTurn.ts', import.meta.url), 'utf8')
  const shown = src.indexOf('showBeforeSaving(queryClient, action.tool, args')
  const save = src.indexOf("supabase.functions.invoke('execute-ai-action'")
  const failed = src.indexOf("if (result.kind !== 'done') shown?.failed()")
  const kept = src.indexOf('shown?.saved(result.eventId)')
  const refetch = src.indexOf('invalidateAllCalendarQueries(queryClient, String(args.event_id')
  assert.ok(shown > 0 && save > shown && failed > save && kept > failed && refetch > kept)
})

// Instant everywhere (Jake, Oct 2: "there are other opportunities in the app for more experiential responsiveness"):
// Casa's changes show at once; a place still being looked up says so rather than guessing.
import { changedEvent, PLACE_PENDING } from '../src/lib/optimisticEvent.ts'

test('a change, as it will be: time, title, people; a new place waits for its address', () => {
  const before = { id: 'ev1', title: 'Dentist', start_time: '2026-10-05T19:30:00Z', end_time: '2026-10-05T20:30:00Z', location_name: 'Smile Dental', address: '1 Tooth St', members: [{ id: 'm1', role: 'primary', family_member: { id: 'liv', name: 'Liv' } }] }
  const moved = changedEvent(before, { id: 'ev1', start: '2026-10-05T20:00:00Z', end: '2026-10-05T21:00:00Z', members_add: ['Kelly'] }, family)
  assert.equal(moved.start_time, '2026-10-05T20:00:00Z')
  assert.equal(moved.title, 'Dentist')
  assert.equal(moved.address, '1 Tooth St') // the place didn't change
  assert.deepEqual(moved.members.map((m) => m.family_member.id), ['liv', 'kelly'])
  const elsewhere = changedEvent(before, { id: 'ev1', location: 'Bright Smiles', members_remove: ['Liv'] }, [...family, { id: 'liv', name: 'Liv' }])
  assert.equal(elsewhere.location_name, 'Bright Smiles')
  assert.equal(elsewhere.address, null)
  assert.equal(elsewhere[PLACE_PENDING], true)
  assert.deepEqual(elsewhere.members, [])
})

test('an add with a place it hasn’t looked up yet is marked as waiting for it', () => {
  const e = optimisticEvent('ev3', { title: 'Gym', start: '2026-10-02T23:30:00Z', end: '2026-10-03T01:00:00Z', location: 'Amped Fitness' }, family)
  assert.equal(e[PLACE_PENDING], true)
  const home = optimisticEvent('ev4', { title: 'Call', start: '2026-10-02T23:30:00Z', end: '2026-10-03T01:00:00Z' }, family)
  assert.equal(home[PLACE_PENDING], undefined)
})

test('the form and Scan put their adds there too, before the fetch', () => {
  const src = readFileSync(new URL('../src/wall/createEvent.ts', import.meta.url), 'utf8')
  const put = src.indexOf('showAdded(queryClient, result.eventId, requestArgs)')
  assert.ok(put > 0 && src.indexOf('invalidateAllCalendarQueries(queryClient, result.eventId', put) > put)
})

import { QueryClient } from '@tanstack/query-core'
import { holdWhileSaving } from '../src/lib/optimisticEvent.ts'

test('an edit holds over a refresh that lands mid-save, then the server’s copy takes over', async () => {
  const qc = new QueryClient()
  const key = ['events', 'week', 'w1']
  qc.setQueryData(key, [{ id: 'a', title: 'Old place' }])
  let finish
  const saving = new Promise((resolve) => { finish = resolve })
  const held = holdWhileSaving(qc, 'a', (e) => ({ ...e, title: 'New place' }), saving)
  assert.equal(qc.getQueryData(key)[0].title, 'New place')
  // A refresh halfway through the save (the server doesn't have the change yet).
  await qc.fetchQuery({ queryKey: key, queryFn: async () => [{ id: 'a', title: 'Old place' }], staleTime: 0 })
  assert.equal(qc.getQueryData(key)[0].title, 'New place')
  finish()
  await held
  // Saved: what the server says stands.
  await qc.fetchQuery({ queryKey: key, queryFn: async () => [{ id: 'a', title: 'Server place' }], staleTime: 0 })
  assert.equal(qc.getQueryData(key)[0].title, 'Server place')
})

import { showAdded } from '../src/lib/optimisticEvent.ts'

test('an add lands only in the calendar’s ranges — never in the packing list or the trip legs kept under “events”', () => {
  const qc = new QueryClient()
  qc.setQueryData(['events', 'rolling', 'x'], [{ id: 'a' }])
  qc.setQueryData(['events', 'wall-checklist', 'e1'], [{ id: 'c1', event_id: 'e1', label: 'Glove' }])
  qc.setQueryData(['events', 'wall-travel', 'd'], [{ id: 't1' }])
  showAdded(qc, 'ev9', { title: 'Gym', start: '2026-10-02T23:30:00Z', end: '2026-10-03T01:00:00Z' })
  assert.deepEqual(qc.getQueryData(['events', 'rolling', 'x']).map((e) => e.id), ['a', 'ev9'])
  assert.deepEqual(qc.getQueryData(['events', 'wall-checklist', 'e1']).map((e) => e.id), ['c1'])
  assert.deepEqual(qc.getQueryData(['events', 'wall-travel', 'd']).map((e) => e.id), ['t1'])
})

// Jake, Oct 3: "from a UX experience everything will just visually update fast so im not wondering while looking at
// the screen if it worked or not?" A yes on Casa's card moves the calendar before the save (2–3 s on the wall); when the
// save comes back, an add takes its real id; a save that fails puts the screen back as it was.
import { showBeforeSaving } from '../src/lib/optimisticEvent.ts'

test('a yes shows at once: an add, a change, a delete — kept when saved, undone when it fails', () => {
  const qc = new QueryClient()
  qc.setQueryData(['family-members'], family)
  const dentist = { id: 'a', title: 'Dentist', start_time: '2026-10-05T19:30:00Z', end_time: '2026-10-05T20:30:00Z', members: [] }
  qc.setQueryData(['events', 'week', '2026-10-05'], [dentist])
  qc.setQueryData(['events', 'wall-checklist', 'a'], [])
  const week = () => qc.getQueryData(['events', 'week', '2026-10-05'])
  const gym = { title: 'Gym', start: '2026-10-05T23:30:00Z', end: '2026-10-06T01:00:00Z', members: ['Kelly'] }

  const add = showBeforeSaving(qc, 'create_event', gym, 'saving-1')
  assert.deepEqual(week().map((e) => e.id), ['a', 'saving-1'])
  assert.deepEqual(qc.getQueryData(['events', 'wall-checklist', 'a']), [])
  add.saved('ev9')
  assert.deepEqual(week().map((e) => e.id), ['a', 'ev9'])

  const lost = showBeforeSaving(qc, 'create_event', { ...gym, title: 'Swim' }, 'saving-2')
  assert.equal(week().length, 3)
  lost.failed()
  assert.deepEqual(week().map((e) => e.id), ['a', 'ev9'])

  const move = showBeforeSaving(qc, 'update_event', { id: 'a', title: 'Dentist, moved' })
  assert.equal(week()[0].title, 'Dentist, moved')
  move.failed()
  assert.equal(week()[0].title, 'Dentist')

  const gone = showBeforeSaving(qc, 'delete_event', { id: 'a' })
  assert.deepEqual(week().map((e) => e.id), ['ev9'])
  gone.failed()
  assert.deepEqual(week().map((e) => e.id).sort(), ['a', 'ev9'])
  showBeforeSaving(qc, 'delete_event', { id: 'a' }).saved()
  assert.deepEqual(week().map((e) => e.id), ['ev9'])

  assert.equal(showBeforeSaving(qc, 'apply_plan', {}), null) // a plan says what it saved on its own card
})
