import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildEventTransportationPlanForMode,
  applyLogisticsModeToPlan,
  applyWaitBehaviorToPlan,
  buildLogisticsStepsFromRoute,
} from '../src/lib/eventTransportation.ts'

const mockEvent = {
  id: 'event-school-1',
  title: 'School Pictures',
  start_time: '2026-08-18T08:00:00.000-04:00',
  end_time: '2026-08-18T08:45:00.000-04:00',
  location_name: 'Bak Middle School of the Arts',
  address: '1725 Echo Lake Dr',
  members: [
    { role: 'primary', family_member: { name: 'Liv' } },
  ],
}

const homeAddress = '3209 Washington Road, West Palm Beach, FL'

test('buildEventTransportationPlanForMode creates 1 leg for dropoff_only with dropoff purpose', () => {
  const plan = buildEventTransportationPlanForMode(
    mockEvent,
    homeAddress,
    'dropoff_only',
    { driver1: { id: 'jake-id', name: 'Jake' } },
  )

  assert.equal(plan.legs.length, 1)
  assert.equal(plan.waitOnSite, false)
  assert.equal(plan.legs[0].purpose, 'dropoff')
  assert.equal(plan.legs[0].timing, 'arrive_by')
  assert.equal(plan.legs[0].driverName, 'Jake')
  assert.deepEqual(plan.legs[0].passengers, ['Liv'])
  assert.equal(plan.legs[0].origin.name, 'Home')
  assert.equal(plan.legs[0].destination.name, 'Bak Middle School of the Arts')
})

test('buildEventTransportationPlanForMode creates 1 leg for pickup_only with pickup purpose', () => {
  const plan = buildEventTransportationPlanForMode(
    mockEvent,
    homeAddress,
    'pickup_only',
    { driver2: { id: 'sarah-id', name: 'Sarah' } },
  )

  assert.equal(plan.legs.length, 1)
  assert.equal(plan.waitOnSite, false)
  assert.equal(plan.legs[0].purpose, 'pickup')
  assert.equal(plan.legs[0].timing, 'depart_at')
  assert.equal(plan.legs[0].driverName, 'Sarah')
  assert.deepEqual(plan.legs[0].passengers, ['Liv'])
  assert.equal(plan.legs[0].origin.name, 'Bak Middle School of the Arts')
  assert.equal(plan.legs[0].destination.name, 'Home')
})

test('buildEventTransportationPlanForMode creates 2 legs for two_way with independent drivers', () => {
  const plan = buildEventTransportationPlanForMode(
    mockEvent,
    homeAddress,
    'two_way',
    {
      driver1: { id: 'jake-id', name: 'Jake' },
      driver2: { id: 'sarah-id', name: 'Sarah' },
    },
  )

  assert.equal(plan.legs.length, 2)
  assert.equal(plan.waitOnSite, false)
  assert.equal(plan.legs[0].purpose, 'dropoff')
  assert.equal(plan.legs[0].driverName, 'Jake')
  assert.equal(plan.legs[1].purpose, 'pickup')
  assert.equal(plan.legs[1].driverName, 'Sarah')
})

test('buildEventTransportationPlanForMode creates 2 legs for stay with waitOnSite true and same driver', () => {
  const plan = buildEventTransportationPlanForMode(
    mockEvent,
    homeAddress,
    'stay',
    { driver1: { id: 'jake-id', name: 'Jake' } },
  )

  assert.equal(plan.legs.length, 2)
  assert.equal(plan.waitOnSite, true)
  assert.equal(plan.legs[0].purpose, 'appointment')
  assert.equal(plan.legs[0].driverName, 'Jake')
  assert.equal(plan.legs[1].purpose, 'return')
  assert.equal(plan.legs[1].driverName, 'Jake')
})

test('buildEventTransportationPlanForMode creates empty legs for none', () => {
  const plan = buildEventTransportationPlanForMode(
    mockEvent,
    homeAddress,
    'none',
  )

  assert.equal(plan.legs.length, 0)
  assert.equal(plan.waitOnSite, false)
})

test('applyLogisticsModeToPlan seamlessly switches modes and preserves drivers', () => {
  const initial = buildEventTransportationPlanForMode(
    mockEvent,
    homeAddress,
    'dropoff_only',
    { driver1: { id: 'jake-id', name: 'Jake' } },
  )

  const switchedToTwoWay = applyLogisticsModeToPlan(initial, 'two_way', mockEvent, homeAddress)
  assert.equal(switchedToTwoWay.legs.length, 2)
  assert.equal(switchedToTwoWay.legs[0].driverName, 'Jake')
  assert.equal(switchedToTwoWay.legs[1].driverName, 'Jake')

  const switchedToPickupOnly = applyLogisticsModeToPlan(switchedToTwoWay, 'pickup_only', mockEvent, homeAddress)
  assert.equal(switchedToPickupOnly.legs.length, 1)
  assert.equal(switchedToPickupOnly.legs[0].purpose, 'pickup')
})

test('applyWaitBehaviorToPlan maintains backward compatibility for stay and dropoff', () => {
  const initial = buildEventTransportationPlanForMode(mockEvent, homeAddress, 'stay', { driver1: { id: 'jake-id', name: 'Jake' } })
  const dropoffPlan = applyWaitBehaviorToPlan(initial, 'dropoff', mockEvent, homeAddress)
  assert.equal(dropoffPlan.legs.length, 2)
  assert.equal(dropoffPlan.waitOnSite, false)
  assert.equal(dropoffPlan.legs[0].purpose, 'dropoff')
  assert.equal(dropoffPlan.legs[1].purpose, 'pickup')
})

test('buildLogisticsStepsFromRoute produces exact timeline steps for dropoff_only', () => {
  const steps = buildLogisticsStepsFromRoute({
    eventId: 'event-school-1',
    eventTitle: 'School Pictures',
    startTime: '2026-08-18T08:00:00.000-04:00',
    endTime: '2026-08-18T08:45:00.000-04:00',
    venueName: 'Bak Middle School of the Arts',
    venueAddress: '1725 Echo Lake Dr',
    homeAddress,
    driveMinutes: 15,
    distanceMiles: 4.2,
    driverLeg1: 'Jake',
    attendees: ['Liv'],
    mode: 'dropoff_only',
    bufferMinutes: 5,
  })

  assert.equal(steps.length, 2)
  assert.equal(steps[0].step_type, 'departure')
  assert.equal(steps[0].title, 'Leg 1: Drop Off Drive')
  assert.match(steps[0].description, /15 min drive · 4\.2 miles · Jake driving Liv/)
  // 8:00 AM EDT is 12:00 UTC. 7:40 AM EDT is 11:40 UTC.
  const depDate = new Date(steps[0].time)
  const startEventDate = new Date(mockEvent.start_time)
  const diffMinutes = Math.round((startEventDate.getTime() - depDate.getTime()) / 60000)
  assert.equal(diffMinutes, 20) // 15m drive + 5m buffer = 20m

  assert.equal(steps[1].step_type, 'arrival')
  assert.equal(steps[1].title, 'Bak Middle School of the Arts')
  assert.match(steps[1].description, /Liv at venue · Driver departs after drop-off/)
})

test('buildLogisticsStepsFromRoute produces exact timeline steps for pickup_only', () => {
  const steps = buildLogisticsStepsFromRoute({
    eventId: 'event-school-1',
    eventTitle: 'School Pictures',
    startTime: '2026-08-18T08:00:00.000-04:00',
    endTime: '2026-08-18T08:45:00.000-04:00',
    venueName: 'Bak Middle School of the Arts',
    venueAddress: '1725 Echo Lake Dr',
    homeAddress,
    driveMinutes: 15,
    distanceMiles: 4.2,
    driverLeg2: 'Sarah',
    attendees: ['Liv'],
    mode: 'pickup_only',
    bufferMinutes: 5,
  })

  assert.equal(steps.length, 2)
  assert.equal(steps[0].step_type, 'departure')
  assert.equal(steps[0].title, 'Leg 1: Pickup Departure Drive')
  assert.match(steps[0].description, /15 min drive · 4\.2 miles · Sarah leaving to pick up Liv/)
  // Pickup departure should be 20 min before 8:45 AM (8:25 AM)
  const depDate = new Date(steps[0].time)
  const endEventDate = new Date(mockEvent.end_time)
  const diffMinutes = Math.round((endEventDate.getTime() - depDate.getTime()) / 60000)
  assert.equal(diffMinutes, 20) // 15m drive + 5m buffer = 20m

  assert.equal(steps[1].step_type, 'return')
  assert.equal(steps[1].title, 'Return Home with Passengers')
  assert.match(steps[1].description, /15 min return drive · Sarah driving Liv/)
})

test('buildLogisticsStepsFromRoute produces 3 steps for two_way with independent drivers', () => {
  const steps = buildLogisticsStepsFromRoute({
    eventId: 'event-school-1',
    eventTitle: 'School Pictures',
    startTime: '2026-08-18T08:00:00.000-04:00',
    endTime: '2026-08-18T08:45:00.000-04:00',
    venueName: 'Bak Middle School of the Arts',
    venueAddress: '1725 Echo Lake Dr',
    homeAddress,
    driveMinutes: 15,
    distanceMiles: 4.2,
    driverLeg1: 'Jake',
    driverLeg2: 'Sarah',
    attendees: ['Liv'],
    mode: 'two_way',
    bufferMinutes: 5,
  })

  assert.equal(steps.length, 3)
  assert.equal(steps[0].title, 'Leg 1: Drop Off Drive')
  assert.match(steps[0].description, /Jake driving Liv/)
  assert.equal(steps[1].title, 'Bak Middle School of the Arts')
  assert.match(steps[1].description, /Liv at venue · Pickup scheduled at end/)
  assert.equal(steps[2].title, 'Leg 2: Return Pickup Drive')
  assert.match(steps[2].description, /Sarah driving/)
})

test('buildLogisticsStepsFromRoute returns empty array for none', () => {
  const steps = buildLogisticsStepsFromRoute({
    eventId: 'event-school-1',
    eventTitle: 'School Pictures',
    startTime: '2026-08-18T08:00:00.000-04:00',
    endTime: '2026-08-18T08:45:00.000-04:00',
    venueName: 'Bak Middle School of the Arts',
    venueAddress: '1725 Echo Lake Dr',
    driveMinutes: 15,
    distanceMiles: 4.2,
    mode: 'none',
  })

  assert.deepEqual(steps, [])
})

test('LivingRouteTimeline and LivingDepartureHero bind all 5 logistics modes', () => {
  const timelineContent = readFileSync(new URL('../src/components/calendar/living-flow/components/LivingRouteTimeline.tsx', import.meta.url), 'utf8')
  const heroContent = readFileSync(new URL('../src/components/calendar/living-flow/components/LivingDepartureHero.tsx', import.meta.url), 'utf8')
  const hookContent = readFileSync(new URL('../src/components/calendar/living-flow/hooks/useLivingFlowState.ts', import.meta.url), 'utf8')

  // Timeline renders 5-mode options and specific mode sections
  assert.match(timelineContent, /dropoff_only/)
  assert.match(timelineContent, /pickup_only/)
  assert.match(timelineContent, /two_way/)
  assert.match(timelineContent, /stay/)
  assert.match(timelineContent, /none/)
  assert.match(timelineContent, /No Family Ride Needed/)

  // Hero renders pickup_only departure vs leave home departure
  assert.match(heroContent, /activeMode === 'pickup_only'/)
  assert.match(heroContent, /Leave For Venue By/)
  assert.match(heroContent, /Leave Home By/)

  // Hook exports pickupDepartureDate
  assert.match(hookContent, /pickupDepartureDate/)
})

test('normalizeTransportationPlan preserves empty legs for mode none', async () => {
  const { normalizeTransportationPlan } = await import('../src/lib/eventTransportation.ts')
  const emptyPlan = {
    version: 1,
    source: 'manual',
    waitOnSite: false,
    legs: [],
    attendeeRoster: ['Liv'],
  }
  const normalized = normalizeTransportationPlan(emptyPlan)
  assert.ok(normalized)
  assert.equal(normalized.version, 1)
  assert.equal(normalized.legs.length, 0)
  assert.deepEqual(normalized.attendeeRoster, ['Liv'])
})

test('deriveCalendarCardResponsibility suppresses driver assignment when transportation plan legs is empty', async () => {
  const { deriveCalendarCardResponsibility } = await import('../src/lib/calendarResponsibility.ts')
  const eventWithNone = {
    ...mockEvent,
    plan_override: {
      transportation_plan: {
        version: 1,
        source: 'manual',
        waitOnSite: false,
        legs: [],
        attendeeRoster: ['Liv'],
      },
    },
  }
  const household = [
    { id: 'jake-id', name: 'Jake', role: 'parent' },
    { id: 'liv-id', name: 'Liv', role: 'child' },
  ]
  const resp = deriveCalendarCardResponsibility(eventWithNone, household, new Date())
  assert.equal(resp.responsible, null)
})

