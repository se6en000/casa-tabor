import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { deserializeRoutinesFromAvailabilityRules, serializeRoutineToAvailabilityRules } from '../src/lib/familyRoutines.ts'
import { FRIDAY, members, routines } from './fixtures/wall-day-2026-09-25.mjs'

// Jake, Oct 7: "Owen is getting out of school at 2, giselle picks him up … takes Owen out for the afternoon … takes
// owen to her house till 5 where she bring him home" — and Liv "gets picked up at the tri rail train station".
const withGiselle = {
  id: 'routine-owen-giselle', key: 'care-giselle', memberId: 'owen', title: 'With Giselle', routineType: 'care',
  venueName: 'Giselle’s house', venueAddress: '2691 Kentucky St', daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: '14:00', endLocal: '17:00', dropoffDriverName: '', pickupDriverName: '', enabled: true, syncMode: 'none',
}
const livByTrain = (r) => (r.memberId === 'liv' ? { ...r, pickupVenueName: 'West Palm Beach Tri-Rail Station', pickupVenueAddress: '209 S Tamarind Ave' } : r)

test('With Giselle: Owen is with her 2–5 on his lane, and nothing is driven or asked for it', () => {
  const plain = buildDayPlan({ date: FRIDAY, members, routines, events: [], chores: [] })
  const plan = buildDayPlan({ date: FRIDAY, members, routines: [...routines, withGiselle], events: [], chores: [] })
  const owen = plan.lanes.get('owen').filter((s) => s.kind === 'at_place')
  assert.deepEqual(owen.map((s) => [s.label, s.start.getHours(), s.end.getHours()]), [['Palm Beach Public', 7, 14], ['With Giselle', 14, 17]])
  assert.equal(plan.trips.length, plain.trips.length)
  assert.equal(plan.gaps.length, plain.gaps.length)
})

test('Liv picked up at the Tri-Rail station: the 3:30 pickup goes there; the morning drop-off stays at Bak', () => {
  const plan = buildDayPlan({ date: FRIDAY, members, routines: routines.map(livByTrain), events: [], chores: [] })
  const liv = plan.trips.filter((t) => t.travelerIds.includes('liv'))
  assert.deepEqual(liv.map((t) => [t.kind, t.destination.name]), [['dropoff', 'Bak Middle School of the Arts'], ['pickup', 'West Palm Beach Tri-Rail Station']])
})

test('care routines and pickup places survive saving: no made-up drivers for someone having them', () => {
  const rows = serializeRoutineToAvailabilityRules(withGiselle).map((r, i) => ({ ...r, id: `r${i}`, created_at: '', updated_at: '' }))
  const [back] = deserializeRoutinesFromAvailabilityRules('owen', rows)
  assert.equal(back.routineType, 'care')
  assert.equal(back.dropoffDriverName, '')
  assert.equal(back.pickupDriverName, '')
  const liv = serializeRoutineToAvailabilityRules({ ...livByTrain(routines[0]), key: 'main' }).map((r, i) => ({ ...r, id: `l${i}`, created_at: '', updated_at: '' }))
  const [livBack] = deserializeRoutinesFromAvailabilityRules('liv', liv)
  assert.equal(livBack.pickupVenueName, 'West Palm Beach Tri-Rail Station')
  assert.equal(livBack.pickupVenueAddress, '209 S Tamarind Ave')
})
