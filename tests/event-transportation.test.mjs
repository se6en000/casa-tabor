import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appendReturnHomeLeg,
  createDefaultTransportationPlan,
  normalizeTransportationPlan,
  transportationTimeIso,
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
  assert.deepEqual(plan.legs[0].destination, { name: 'ABA Hope Center', address: '100 Therapy Way' })
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
