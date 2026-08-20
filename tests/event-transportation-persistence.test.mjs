import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildEventTransportationPlan,
  applyDriverChangeToPlan,
  applyWaitBehaviorToPlan,
} from '../src/lib/eventTransportation.ts'

import {
  createEventPlanOverridePayload,
  locationSignature,
} from '../src/lib/eventPlanOverrides.ts'

const testEvent = {
  id: 'event-test-123',
  title: "Liv going to Piper's 13th Birthday Party",
  start_time: '2026-08-16T17:00:00.000Z',
  end_time: '2026-08-16T19:00:00.000Z',
  location_name: 'Altitude Trampoline Park',
  address: '4340 Okeechobee Blvd, West Palm Beach, FL 33409',
  members: [
    {
      id: 'member-liv',
      role: 'attendee',
      family_member: {
        id: 'fm-liv',
        name: 'Liv',
        role: 'child',
      },
    },
  ],
}

const homeAddress = '3209 Washington Road, West Palm Beach, FL, 33405-1646'

test('buildEventTransportationPlan creates complete 2-leg plan with accurate timing and roster', () => {
  const plan = buildEventTransportationPlan(testEvent, homeAddress, {
    id: 'fm-kelly',
    name: 'Kelly',
  }, { waitOnSite: true })

  assert.equal(plan.version, 1)
  assert.equal(plan.source, 'manual')
  assert.equal(plan.waitOnSite, true)
  assert.deepEqual(plan.attendeeRoster, ['Liv'])
  assert.equal(plan.legs.length, 2)

  // Leg 1: Outbound to venue
  assert.equal(plan.legs[0].purpose, 'drive')
  assert.equal(plan.legs[0].timing, 'arrive_by')
  assert.equal(plan.legs[0].driverName, 'Kelly')
  assert.equal(plan.legs[0].driverId, 'fm-kelly')
  assert.deepEqual(plan.legs[0].origin, { name: 'Home', address: homeAddress })
  assert.equal(plan.legs[0].destination.name, 'Altitude Trampoline Park')
  assert.deepEqual(plan.legs[0].passengers, ['Liv'])

  // Leg 2: Return from venue to home
  assert.equal(plan.legs[1].purpose, 'return')
  assert.equal(plan.legs[1].timing, 'depart_at')
  assert.equal(plan.legs[1].driverName, 'Kelly')
  assert.equal(plan.legs[1].driverId, 'fm-kelly')
  assert.equal(plan.legs[1].origin.name, 'Altitude Trampoline Park')
  assert.deepEqual(plan.legs[1].destination, { name: 'Home', address: homeAddress })
  assert.deepEqual(plan.legs[1].passengers, ['Liv'])
})

test('applyDriverChangeToPlan updates single leg or synchronizes both legs', () => {
  const initialPlan = buildEventTransportationPlan(testEvent, homeAddress, {
    id: 'fm-kelly',
    name: 'Kelly',
  }, { waitOnSite: false })

  // Update only leg 2 (return drive) to Jake
  const separateReturnPlan = applyDriverChangeToPlan(initialPlan, 1, {
    id: 'fm-jake',
    name: 'Jake',
  }, false)

  assert.equal(separateReturnPlan.legs[0].driverName, 'Kelly')
  assert.equal(separateReturnPlan.legs[1].driverName, 'Jake')

  // Synchronize both legs to Jake
  const syncedPlan = applyDriverChangeToPlan(initialPlan, 0, {
    id: 'fm-jake',
    name: 'Jake',
  }, true)

  assert.equal(syncedPlan.legs[0].driverName, 'Jake')
  assert.equal(syncedPlan.legs[0].driverId, 'fm-jake')
  assert.equal(syncedPlan.legs[1].driverName, 'Jake')
  assert.equal(syncedPlan.legs[1].driverId, 'fm-jake')
})

test('applyWaitBehaviorToPlan toggles waitOnSite and syncs return driver when staying on site', () => {
  const dropoffPlan = buildEventTransportationPlan(testEvent, homeAddress, {
    id: 'fm-kelly',
    name: 'Kelly',
  }, { waitOnSite: false })
  dropoffPlan.legs[1].driverName = 'Jake'
  dropoffPlan.legs[1].driverId = 'fm-jake'

  // Switch to stay on site -> waitOnSite becomes true and return driver syncs to leg 1 driver
  const stayPlan = applyWaitBehaviorToPlan(dropoffPlan, 'stay', testEvent, homeAddress)
  assert.equal(stayPlan.waitOnSite, true)
  assert.equal(stayPlan.legs[0].driverName, 'Kelly')
  assert.equal(stayPlan.legs[1].driverName, 'Kelly')

  // Switch back to dropoff -> waitOnSite becomes false
  const dropoffAgain = applyWaitBehaviorToPlan(stayPlan, 'dropoff', testEvent, homeAddress)
  assert.equal(dropoffAgain.waitOnSite, false)
})

test('createEventPlanOverridePayload generates valid Supabase payload with accurate signature and overrides', () => {
  const plan = buildEventTransportationPlan(testEvent, homeAddress, {
    id: 'fm-jake',
    name: 'Jake',
  }, { waitOnSite: true })

  const payload = createEventPlanOverridePayload({
    event: testEvent,
    transportationPlan: plan,
    waits: true,
    modeOverride: 'appointment',
  })

  assert.equal(payload.event_id, testEvent.id)
  assert.equal(payload.verified, true)
  assert.equal(payload.waits, true)
  assert.equal(payload.mode_override, 'appointment')
  assert.equal(payload.two_driver_confirmed, false)
  assert.deepEqual(payload.driver_overrides, { 0: 'fm-jake', 1: 'fm-jake' })
  assert.equal(payload.location_signature, locationSignature(testEvent))
  assert.deepEqual(payload.transportation_plan, plan)
})
