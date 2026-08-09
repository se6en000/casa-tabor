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
  const projection = projectHomeTransportation(event, plan([
    leg({ id: 'out', time: '14:30', driverName: 'Giselle', origin: "Giselle's house" }),
    leg({ id: 'mid', time: '14:45', driverName: 'Giselle', origin: 'Hope Center', destination: "Giselle's house" }),
    leg({ id: 'return', time: '17:00', driverName: 'Giselle', origin: "Giselle's house", destination: 'Home' }),
  ]), new Date('2026-07-16T17:00:00.000Z'))

  assert.equal(projection.summary, 'Giselle drives')
  assert.deepEqual(projection.drivers.map((driver) => driver.name), ['Giselle'])
  assert.equal(projection.nextLeg.leg.id, 'out')
  assert.equal(projection.nextLeg.origin, "Giselle's house address")
  assert.equal(projection.nextLeg.destination, 'Hope Center address')
})

test('next saved leg and emphasized driver advance during the event', () => {
  const projection = projectHomeTransportation(event, plan([
    leg({ id: 'drop', time: '14:30', driverName: 'Giselle' }),
    leg({ id: 'pickup', time: '16:30', driverName: 'Jake', origin: 'Hope Center', destination: 'Home' }),
  ]), new Date('2026-07-16T19:00:00.000Z'))

  assert.equal(projection.summary, 'Giselle drops off · Jake picks up')
  assert.equal(projection.nextDriver.name, 'Jake')
  assert.deepEqual(projection.drivers.map((driver) => driver.name), ['Jake', 'Giselle'])
  assert.equal(projection.nextLeg.leg.id, 'pickup')
})

test('three drivers collapse to a count while retaining next-driver ordering', () => {
  const projection = projectHomeTransportation(event, plan([
    leg({ id: 'one', time: '14:00', driverName: 'Giselle' }),
    leg({ id: 'two', time: '15:00', driverName: 'Kelly' }),
    leg({ id: 'three', time: '16:00', driverName: 'Jake' }),
  ]), new Date('2026-07-16T18:45:00.000Z'))

  assert.equal(projection.summary, '3 drivers · View plan')
  assert.deepEqual(projection.drivers.map((driver) => driver.name), ['Kelly', 'Giselle', 'Jake'])
})

test('saved unassigned next leg fails visibly instead of guessing', () => {
  const projection = projectHomeTransportation(event, plan([
    leg({ id: 'drop', time: '14:30', driverName: null, driverId: null }),
    leg({ id: 'pickup', time: '17:00', driverName: 'Jake' }),
  ]), new Date('2026-07-16T17:00:00.000Z'))

  assert.equal(projection.summary, 'Driver needed')
  assert.equal(projection.nextDriver, null)
  assert.deepEqual(projection.drivers, [])
  assert.equal(projection.hasUnassignedLeg, true)
})

test('wait, single-purpose, external driver, and malformed plans stay truthful', () => {
  assert.equal(
    projectHomeTransportation(event, plan([
      leg({ id: 'wait', time: '14:30', driverName: 'Grandma', driverId: null }),
    ], { waitOnSite: true }), new Date('2026-07-16T17:00:00.000Z')).summary,
    'Grandma drives & stays',
  )
  assert.equal(
    projectHomeTransportation(event, plan([
      leg({ id: 'drop', time: '14:30', driverName: 'Giselle', purpose: 'dropoff' }),
    ]), new Date('2026-07-16T17:00:00.000Z')).summary,
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

test('homepage and shared leave-by UI consume authoritative projection contracts', () => {
  const home = readFileSync(new URL('../src/pages/HomePage.tsx', import.meta.url), 'utf8')
  const leaveBy = readFileSync(new URL('../src/components/shared/LeaveByCard.tsx', import.meta.url), 'utf8')
  const avatars = readFileSync(new URL('../src/components/ui/PersonAvatarStack.tsx', import.meta.url), 'utf8')

  assert.match(home, /projectHomeTransportation\(event, persisted\.transportationPlan, now\)/)
  assert.match(home, /<PersonAvatarStack/)
  assert.match(home, /origin=\{nextSavedLeg\?\.origin\}/)
  assert.match(home, /departureTimeIso=/)
  assert.match(leaveBy, /origin,/)
  assert.match(leaveBy, /departureTimeIso/)
  assert.match(avatars, /role="img"/)
  assert.match(avatars, /aria-label=\{label\}/)
})

test('homepage hero cards listen to both override and event update broadcasts', () => {
  const home = readFileSync(new URL('../src/pages/HomePage.tsx', import.meta.url), 'utf8')
  assert.match(home, /window\.addEventListener\('casa:event-updated', handleEventUpdated\)/)
  assert.match(home, /window\.addEventListener\('casa:overrides-updated', handleOverridesUpdated\)/)
})
