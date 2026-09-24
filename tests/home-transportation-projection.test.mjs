import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  projectHomeTransportation,
  transportationLegTimeIso,
} from '../src/lib/homeTransportationProjection.mjs'

const event = {
  start_time: '2026-07-16T18:30:00.000Z',
  end_time: '2026-07-16T21:00:00.000Z',
}

function leg({
  id,
  time,
  driverName,
  driverId = driverName?.toLowerCase() ?? null,
  purpose = 'drive',
  timing = 'arrive_by',
  origin = 'Home',
  destination = 'Hope Center',
}) {
  return {
    id,
    time,
    driverId,
    driverName: driverName ?? '',
    purpose,
    timing,
    passengers: ['Owen'],
    origin: { name: origin, address: `${origin} address` },
    destination: { name: destination, address: `${destination} address` },
  }
}

function plan(legs, extra = {}) {
  return { version: 1, source: 'manual', legs, ...extra }
}

test('Owen plan uses Giselle and the next saved leg instead of inventing Jake or a stay', () => {
  const now = new Date(event.start_time)
  now.setHours(12, 0, 0, 0)
  const projection = projectHomeTransportation(event, plan([
    leg({ id: 'out', time: '14:30', driverName: 'Giselle', origin: "Giselle's house" }),
    leg({ id: 'mid', time: '14:45', driverName: 'Giselle', origin: 'Hope Center', destination: "Giselle's house" }),
    leg({ id: 'return', time: '17:00', driverName: 'Giselle', origin: "Giselle's house", destination: 'Home' }),
  ]), now)

  assert.equal(projection.summary, 'Giselle drives')
  assert.deepEqual(projection.drivers.map((driver) => driver.name), ['Giselle'])
  assert.equal(projection.nextLeg.leg.id, 'out')
  assert.equal(projection.nextLeg.origin, "Giselle's house address")
  assert.equal(projection.nextLeg.destination, 'Hope Center address')
})

test('next saved leg and emphasized driver advance during the event', () => {
  const now = new Date(event.start_time)
  now.setHours(15, 0, 0, 0)
  const projection = projectHomeTransportation(event, plan([
    leg({ id: 'drop', time: '14:30', driverName: 'Giselle' }),
    leg({ id: 'pickup', time: '16:30', driverName: 'Jake', origin: 'Hope Center', destination: 'Home' }),
  ]), now)

  assert.equal(projection.summary, 'Giselle drops off · Jake picks up')
  assert.equal(projection.nextDriver.name, 'Jake')
  assert.deepEqual(projection.drivers.map((driver) => driver.name), ['Jake', 'Giselle'])
  assert.equal(projection.nextLeg.leg.id, 'pickup')
})

test('three drivers collapse to a count while retaining next-driver ordering', () => {
  const now = new Date(event.start_time)
  now.setHours(14, 45, 0, 0)
  const projection = projectHomeTransportation(event, plan([
    leg({ id: 'one', time: '14:00', driverName: 'Giselle' }),
    leg({ id: 'two', time: '15:00', driverName: 'Kelly' }),
    leg({ id: 'three', time: '16:00', driverName: 'Jake' }),
  ]), now)

  assert.equal(projection.summary, '3 drivers · View plan')
  assert.deepEqual(projection.drivers.map((driver) => driver.name), ['Kelly', 'Giselle', 'Jake'])
})

test('saved unassigned next leg fails visibly instead of guessing', () => {
  const now = new Date(event.start_time)
  now.setHours(12, 0, 0, 0)
  const projection = projectHomeTransportation(event, plan([
    leg({ id: 'drop', time: '14:30', driverName: null, driverId: null }),
    leg({ id: 'pickup', time: '17:00', driverName: 'Jake' }),
  ]), now)

  assert.equal(projection.summary, 'Driver needed')
  assert.equal(projection.nextDriver, null)
  assert.deepEqual(projection.drivers, [])
  assert.equal(projection.hasUnassignedLeg, true)
})

test('wait, single-purpose, external driver, and malformed plans stay truthful', () => {
  const now = new Date(event.start_time)
  now.setHours(12, 0, 0, 0)
  assert.equal(
    projectHomeTransportation(event, plan([
      leg({ id: 'wait', time: '14:30', driverName: 'Grandma', driverId: null }),
    ], { waitOnSite: true }), now).summary,
    'Grandma drives & stays',
  )
  assert.equal(
    projectHomeTransportation(event, plan([
      leg({ id: 'drop', time: '14:30', driverName: 'Giselle', purpose: 'dropoff' }),
    ]), now).summary,
    'Giselle drops off',
  )
  assert.equal(projectHomeTransportation(event, null), null)
  assert.equal(projectHomeTransportation(event, { version: 1, legs: [] }), null)
})

test('arrive-by and depart-at leg times anchor to the event day', () => {
  const arriveExpected = new Date(event.start_time)
  arriveExpected.setHours(14, 30, 0, 0)
  const departExpected = new Date(event.end_time)
  departExpected.setHours(17, 0, 0, 0)
  assert.equal(
    transportationLegTimeIso(event, leg({ id: 'arrive', time: '14:30', driverName: 'Giselle' })),
    arriveExpected.toISOString(),
  )
  assert.equal(
    transportationLegTimeIso(event, leg({
      id: 'depart',
      time: '17:00',
      driverName: 'Giselle',
      timing: 'depart_at',
    })),
    departExpected.toISOString(),
  )
})

// Since 2026-09-24, HomePage's Today/Tomorrow lists render real events through the
// same shared EventCard the calendar's stacking view uses (src/components/calendar/
// EventCard.tsx), rather than a homepage-only row — see calendar-card-attendee-avatar-
// stack.test.mjs for the attendee-avatar-stack half of that. EventCard's own driver/
// summary text still goes through the authoritative saved-plan projection (via
// deriveCalendarCardResponsibility); its "Leave by" caption is the calendar's own
// simpler enrichment-based estimate, not a saved-leg/live-ETA one — a deliberate
// consequence of matching the calendar's own card exactly, not a gap. No current
// caller passes LeaveByCard an explicit origin/departureTimeIso pair anymore (DayView
// uses its destination/eventStartIso form) — LeaveByCard still supports both, it's
// just unused right now; not asserted here since there's no live caller to pin it to.
test('the shared EventCard and DayView consume authoritative projection contracts', () => {
  const responsibility = readFileSync(new URL('../src/lib/calendarResponsibility.ts', import.meta.url), 'utf8')
  const dayView = readFileSync(new URL('../src/components/calendar/DayView.tsx', import.meta.url), 'utf8')
  const eventCard = readFileSync(new URL('../src/components/calendar/EventCard.tsx', import.meta.url), 'utf8')
  const avatars = readFileSync(new URL('../src/components/ui/PersonAvatarStack.tsx', import.meta.url), 'utf8')

  assert.match(responsibility, /projectHomeTransportation\(event, persisted\.transportationPlan, now\)/)
  assert.match(eventCard, /<PersonAvatarStack/)
  assert.match(dayView, /<LeaveByCard/)
  assert.match(dayView, /eventStartIso=/)
  assert.match(avatars, /role="img"/)
  assert.match(avatars, /aria-label=\{label\}/)
})

// The calendar's stacking view (StackedView.tsx) has only ever listened for
// 'casa:overrides-updated' on EventCard; HomePage's old, homepage-only timeline row
// listened for both — a defensive extra that predated the shared component and isn't
// part of "the calendar's own card." DayView listens for both, unchanged by this.
test('the shared EventCard listens for override broadcasts, matching the calendar', () => {
  const eventCard = readFileSync(new URL('../src/components/calendar/EventCard.tsx', import.meta.url), 'utf8')
  const dayView = readFileSync(new URL('../src/components/calendar/DayView.tsx', import.meta.url), 'utf8')
  assert.match(eventCard, /window\.addEventListener\('casa:overrides-updated', handleOverridesUpdated\)/)
  assert.match(dayView, /window\.addEventListener\('casa:event-updated', handleEventUpdated\)/)
  assert.match(dayView, /window\.addEventListener\('casa:overrides-updated', handleOverridesUpdated\)/)
})
