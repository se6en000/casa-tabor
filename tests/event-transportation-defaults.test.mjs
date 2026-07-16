import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildGeneratedTransportationPlan,
  classifyTransportationDefault,
  mayReplaceTransportationPlan,
  selectAttendingDriver,
} from '../supabase/functions/_shared/event-transportation-defaults.mjs'

const event = {
  id: 'event-1',
  title: 'Owen doctor appointment',
  start_time: '2026-07-15T14:30:00-04:00',
  end_time: '2026-07-15T17:00:00-04:00',
  all_day: false,
  event_type: 'event',
  status: 'confirmed',
  location_name: 'Hope Center',
  address: '100 Therapy Way, West Palm Beach, FL',
  category: 'medical',
}
const jake = { id: 'jake', name: 'Jake', role: 'parent', can_drive: true, assignment_role: 'attendee' }
const owen = { id: 'owen', name: 'Owen', role: 'child', can_drive: false, assignment_role: 'primary' }
const kelly = { id: 'kelly', name: 'Kelly', role: 'parent', can_drive: true }

test('ordinary appointments generate a durable round trip with on-site waiting', () => {
  const result = buildGeneratedTransportationPlan({
    event,
    homeAddress: '1 Casa Way',
    members: [owen, jake],
    householdMembers: [jake, kelly],
  })
  assert.equal(result.classification.kind, 'appointment')
  assert.equal(result.plan.source, 'generated')
  assert.equal(result.plan.waitOnSite, true)
  assert.deepEqual(result.plan.legs.map((leg) => leg.purpose), ['appointment', 'return'])
  assert.deepEqual(result.plan.legs.map((leg) => leg.driverName), ['Jake', 'Jake'])
  assert.deepEqual(result.plan.legs.map((leg) => leg.time), ['14:30', '17:00'])
  assert.deepEqual(result.plan.legs[0].origin, { name: 'Home', address: '1 Casa Way' })
  assert.deepEqual(result.plan.legs[1].destination, { name: 'Home', address: '1 Casa Way' })
})

test('driver defaults to an attending adult and never an absent household parent', () => {
  assert.equal(selectAttendingDriver([owen, jake])?.id, 'jake')
  assert.equal(selectAttendingDriver([owen]), null)
  const result = buildGeneratedTransportationPlan({
    event,
    homeAddress: '1 Casa Way',
    members: [owen],
    householdMembers: [kelly],
  })
  assert.deepEqual(result.plan.legs.map((leg) => leg.driverId), [null, null])
})

test('pickup and drop-off events generate one leg without waiting', () => {
  const pickup = buildGeneratedTransportationPlan({
    event: { ...event, title: 'Pick up Owen' },
    homeAddress: '1 Casa Way',
    members: [jake, owen],
    householdMembers: [jake],
  })
  assert.equal(pickup.classification.kind, 'pickup')
  assert.equal(pickup.plan.waitOnSite, false)
  assert.equal(pickup.plan.legs.length, 1)
  assert.equal(pickup.plan.legs[0].purpose, 'pickup')

  const dropoff = buildGeneratedTransportationPlan({
    event: { ...event, title: 'Owen drop off' },
    homeAddress: '1 Casa Way',
    members: [jake, owen],
    householdMembers: [jake],
  })
  assert.equal(dropoff.plan.legs[0].purpose, 'dropoff')
})

test('flights and destination trips never receive invented local legs', () => {
  assert.deepEqual(
    classifyTransportationDefault({ ...event, title: 'Flight AA2467 PBI→DFW' }),
    { kind: 'no_route', reason: 'flight' },
  )
  assert.deepEqual(
    classifyTransportationDefault({ ...event, title: 'Myrtle Beach family trip' }),
    { kind: 'no_route', reason: 'trip' },
  )
  assert.equal(buildGeneratedTransportationPlan({
    event: { ...event, title: 'Flight AA2467 PBI→DFW' },
    homeAddress: '1 Casa Way',
    members: [jake],
    householdMembers: [jake],
  }).plan, null)
})

test('hidden recurrence templates remain eligible while ordinary cancelled events do not', () => {
  assert.equal(classifyTransportationDefault({
    ...event,
    status: 'cancelled',
    record_kind: 'series_template',
  }).kind, 'appointment')
  assert.deepEqual(classifyTransportationDefault({
    ...event,
    status: 'cancelled',
    record_kind: 'standalone',
  }), { kind: 'none', reason: 'inactive' })
})

test('legacy wait and per-leg driver choices override generated defaults', () => {
  const result = buildGeneratedTransportationPlan({
    event,
    homeAddress: '1 Casa Way',
    members: [jake, owen],
    householdMembers: [jake, kelly],
    legacy: {
      waits: false,
      driver_overrides: { 0: 'kelly', 2: 'jake' },
    },
  })
  assert.equal(result.plan.waitOnSite, false)
  assert.deepEqual(result.plan.legs.map((leg) => leg.driverName), ['Kelly', 'Jake'])
})

test('automation may refresh generated plans but never manual or legacy explicit plans', () => {
  assert.equal(mayReplaceTransportationPlan(null), true)
  assert.equal(mayReplaceTransportationPlan({ version: 1, source: 'generated', legs: [] }), true)
  assert.equal(mayReplaceTransportationPlan({ version: 1, source: 'manual', legs: [] }), false)
  assert.equal(mayReplaceTransportationPlan({ version: 1, legs: [] }), false)
})

test('addressless appointments wait for Places resolution before plan generation', () => {
  const result = buildGeneratedTransportationPlan({
    event: { ...event, address: null },
    homeAddress: '1 Casa Way',
    members: [jake, owen],
    householdMembers: [jake],
  })
  assert.deepEqual(result.classification, { kind: 'none', reason: 'missing_event_address' })
  assert.equal(result.plan, null)
})
