import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { draftFromEvent, setGoing, setDriver, draftChanges, previewEvent, consequenceLine, savePlanFor } from '../src/wall/editing.ts'
import { driverChoices } from '../src/wall/people.ts'
import { SATURDAY, FRIDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

const softball = events.find((e) => e.id === 'softball')
const planWith = (date, list) => buildDayPlan({ date, members, routines, events: list })
const replace = (event) => events.map((e) => (e.id === event.id ? event : e))
const before = planWith(SATURDAY, events)

test('the draft knows who is going and who drives', () => {
  const d = draftFromEvent(softball)
  assert.deepEqual(d.going, ['jake-id'])
  assert.equal(d.driverId, 'jake-id')
})

test('adding someone and changing the driver say what they were', () => {
  let d = setGoing(draftFromEvent(softball), ['jake-id', 'owen'])
  d = setDriver(d, 'giselle')
  assert.deepEqual(draftChanges(softball, d, members), [
    { field: 'going', was: 'Jake' },
    { field: 'driver', was: 'Jake' },
  ])
})

test('the preview puts the new person on the wall and the drive in the new driver\'s lane', () => {
  let d = setGoing(draftFromEvent(softball), ['jake-id', 'owen'])
  d = setDriver(d, 'giselle')
  const after = planWith(SATURDAY, replace(previewEvent(softball, d)))
  const trip = after.trips.find((t) => t.sourceId === 'softball')
  assert.equal(trip.driverId, 'giselle')
  assert.ok(after.lanes.get('owen').some((s) => s.sourceId === 'softball'))
  assert.ok(after.lanes.get('giselle').some((s) => s.sourceId === 'softball' && s.kind === 'drive'))
  assert.equal(consequenceLine(before, after, 'softball', members), 'Owen goes too. Giselle drives instead of Jake, leaving at 11:56.')
})

test('removing someone is said plainly', () => {
  const d = setGoing(draftFromEvent(softball), [])
  const after = planWith(SATURDAY, replace(previewEvent(softball, d)))
  assert.match(consequenceLine(before, after, 'softball', members), /^Jake doesn't go any more\./)
})

test('driver choices: people who can drive, each free or busy during the trip, from the wall\'s own plan', () => {
  const trip = before.trips.find((t) => t.sourceId === 'softball')
  const choices = driverChoices(before, members, trip, 'softball')
  assert.deepEqual(choices.map((c) => c.memberId), ['jake-id', 'kelly', 'giselle'])
  assert.equal(choices.find((c) => c.memberId === 'giselle').note, 'free')
  // Kelly's Birthday (9–10) ends before the 11:56 departure: she's free for this trip.
  assert.equal(choices.find((c) => c.memberId === 'kelly').note, 'free')
  const early = { ...trip, leaveAt: at(26, 9, 30) }
  assert.equal(driverChoices(before, members, early, 'softball').find((c) => c.memberId === 'kelly').note, "busy until 10:00 · Kelly's Birthday")
})

test('saving runs people, then driver, then the time and place steps', () => {
  let d = setGoing(draftFromEvent(softball), ['jake-id', 'owen'])
  d = setDriver(d, 'giselle')
  const steps = savePlanFor(softball, d)
  assert.deepEqual(steps.map((s) => s.kind), ['people', 'driver'])
  assert.deepEqual(steps[0].add, ['owen'])
  assert.deepEqual(steps[0].remove, [])
  assert.equal(steps[1].driverId, 'giselle')
})

test('friday is unaffected', () => {
  const d = setDriver(draftFromEvent(softball), 'giselle')
  assert.deepEqual(planWith(FRIDAY, replace(previewEvent(softball, d))).trips.map((t) => t.driverId), planWith(FRIDAY, events).trips.map((t) => t.driverId))
})

test('adding someone to an at-home item still says so, even though the wall only draws its main person', () => {
  const photobook = { ...events.find((e) => e.id === 'photobook'), location_name: 'Home' }
  const list = events.map((e) => (e.id === 'photobook' ? photobook : e))
  const d = setGoing(draftFromEvent(photobook), [...draftFromEvent(photobook).going, 'owen'])
  const fri = (l) => buildDayPlan({ date: FRIDAY, members, routines, events: l })
  const going = { before: draftFromEvent(photobook).going, after: d.going }
  assert.equal(consequenceLine(fri(list), fri(list.map((e) => (e.id === 'photobook' ? previewEvent(photobook, d) : e))), 'photobook', members, going), 'Owen goes too.')
})
