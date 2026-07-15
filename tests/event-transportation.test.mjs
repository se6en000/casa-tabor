import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appendReturnHomeLeg,
  createDefaultTransportationPlan,
  hydrateTransportationEventPlaces,
  isTransportationEventPlace,
  normalizeTransportationPlan,
  transportationTimeIso,
  updateTransportationDriver,
  updateTransportationEventPlace,
  updateTransportationPlace,
} from '../src/lib/eventTransportation.ts'

const event = {
  id: 'event-1',
  title: 'Owen appointment',
  start_time: '2026-07-15T14:30:00.000-04:00',
  end_time: '2026-07-15T17:00:00.000-04:00',
  location_name: 'ABA Hope Center',
  address: '100 Therapy Way',
}

test('default transportation starts at home and arrives at the event location', () => {
  const plan = createDefaultTransportationPlan(event, '1 Casa Way', { id: 'jake', name: 'Jake' })
  assert.equal(plan.legs.length, 1)
  assert.deepEqual(plan.legs[0].origin, { name: 'Home', address: '1 Casa Way' })
  assert.deepEqual(plan.legs[0].destination, { name: 'ABA Hope Center', address: '100 Therapy Way', kind: 'event' })
  assert.equal(plan.legs[0].driverName, 'Jake')
  assert.equal(plan.legs[0].timing, 'arrive_by')
})

test('return-home action appends a separate leg from the previous destination', () => {
  const outbound = createDefaultTransportationPlan(event, '1 Casa Way', { id: 'giselle', name: 'Giselle' })
  const plan = appendReturnHomeLeg(outbound, event, '1 Casa Way')
  assert.equal(plan.legs.length, 2)
  assert.deepEqual(plan.legs[1].origin, outbound.legs[0].destination)
  assert.deepEqual(plan.legs[1].destination, { name: 'Home', address: '1 Casa Way' })
  assert.equal(plan.legs[1].purpose, 'return')
  assert.equal(plan.legs[1].timing, 'depart_at')
})

test('transportation timing anchors a leg time to the event day', () => {
  const plan = createDefaultTransportationPlan(event, '1 Casa Way', null)
  plan.legs[0].time = '13:45'
  const iso = transportationTimeIso(event, plan.legs[0])
  assert.equal(new Date(iso).getHours(), 13)
  assert.equal(new Date(iso).getMinutes(), 45)
})

test('normalization rejects malformed plans and preserves valid multi-stop plans', () => {
  assert.equal(normalizeTransportationPlan({ version: 2, legs: [] }), null)
  assert.equal(normalizeTransportationPlan({ version: 1, legs: [{ origin: null }] }), null)

  const plan = appendReturnHomeLeg(
    createDefaultTransportationPlan(event, '1 Casa Way', { id: 'giselle', name: 'Giselle' }),
    event,
    '1 Casa Way',
  )
  assert.deepEqual(normalizeTransportationPlan(plan), plan)
})

test('quick stop editing keeps adjacent route legs connected', () => {
  const original = appendReturnHomeLeg(
    createDefaultTransportationPlan(event, '1 Casa Way', { id: 'jake', name: 'Jake' }),
    event,
    '1 Casa Way',
  )
  const nextPlace = { name: 'New Clinic', address: '200 New Way' }
  const updated = updateTransportationPlace(original, 0, 'destination', nextPlace)
  assert.deepEqual(updated.legs[0].destination, nextPlace)
  assert.deepEqual(updated.legs[1].origin, nextPlace)
  assert.deepEqual(original.legs[0].destination, { name: 'ABA Hope Center', address: '100 Therapy Way', kind: 'event' })
})

test('legacy event-location placeholders hydrate from the authoritative event address', () => {
  const legacy = {
    version: 1,
    legs: [{
      id: 'legacy',
      origin: { name: 'Event location', address: '' },
      destination: { name: "Giselle's house", address: '2691 Kentucky Street' },
      driverId: null,
      driverName: 'Giselle',
      passengers: ['Owen'],
      purpose: 'pickup',
      timing: 'arrive_by',
      time: '14:45',
    }],
  }
  const hydrated = hydrateTransportationEventPlaces(legacy, event)
  assert.deepEqual(hydrated.legs[0].origin, {
    name: 'ABA Hope Center',
    address: '100 Therapy Way',
    kind: 'event',
  })
  assert.equal(isTransportationEventPlace(hydrated.legs[0].origin), true)
})

test('changing the event place updates every linked trip endpoint', () => {
  const outbound = createDefaultTransportationPlan(event, '1 Casa Way', null)
  const plan = appendReturnHomeLeg(outbound, event, '1 Casa Way')
  const next = updateTransportationEventPlace(plan, { name: 'New Clinic', address: '200 New Way' })
  assert.deepEqual(next.legs[0].destination, { name: 'New Clinic', address: '200 New Way', kind: 'event' })
  assert.deepEqual(next.legs[1].origin, { name: 'New Clinic', address: '200 New Way', kind: 'event' })
})

test('quick driver editing can update one leg or all remaining legs', () => {
  const original = appendReturnHomeLeg(
    createDefaultTransportationPlan(event, '1 Casa Way', { id: 'jake', name: 'Jake' }),
    event,
    '1 Casa Way',
  )
  const oneLeg = updateTransportationDriver(original, 0, { id: null, name: 'Giselle' }, false)
  assert.equal(oneLeg.legs[0].driverName, 'Giselle')
  assert.equal(oneLeg.legs[1].driverName, 'Jake')

  const remaining = updateTransportationDriver(original, 0, { id: null, name: 'Giselle' }, true)
  assert.deepEqual(remaining.legs.map((leg) => leg.driverName), ['Giselle', 'Giselle'])
})
