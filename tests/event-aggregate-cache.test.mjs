import assert from 'node:assert/strict'
import test from 'node:test'
import { QueryClient } from '@tanstack/react-query'

import {
  applyEventAggregatePatch,
  publishEventAggregatePatch,
} from '../src/lib/eventAggregateCache.ts'

function createEvent() {
  return {
    id: 'silverball',
    title: 'Silverball Arcade',
    start_time: '2026-08-09T18:30:00.000Z',
    end_time: '2026-08-09T20:00:00.000Z',
    members: [],
    enrichment: null,
    plan_override: {
      event_id: 'silverball',
      transportation_plan: {
        version: 1,
        source: 'manual',
        legs: [
          { id: 'out', driverId: 'jake', driverName: 'Jake' },
          { id: 'return', driverId: 'jake', driverName: 'Jake' },
        ],
      },
    },
    logistics: [],
    checklist: [],
    actions: [],
  }
}

test('driver updates synchronously patch event lists, details, and transportation caches', () => {
  const queryClient = new QueryClient()
  const event = createEvent()
  const nextPlan = {
    ...event.plan_override.transportation_plan,
    legs: [
      event.plan_override.transportation_plan.legs[0],
      { id: 'return', driverId: 'kelly', driverName: 'Kelly' },
    ],
  }

  queryClient.setQueryData(['events', 'rolling', '2026-08-09'], [event])
  queryClient.setQueryData(['event-details', event.id], event)
  queryClient.setQueryData(['event-transportation-plans', '2026-08-01'], [{
    event_id: event.id,
    transportation_plan: event.plan_override.transportation_plan,
  }])

  applyEventAggregatePatch(queryClient, event.id, {
    plan_override: { ...event.plan_override, transportation_plan: nextPlan },
  })

  const listEvent = queryClient.getQueryData(['events', 'rolling', '2026-08-09'])[0]
  const detailEvent = queryClient.getQueryData(['event-details', event.id])
  const transportationRow = queryClient.getQueryData(['event-transportation-plans', '2026-08-01'])[0]

  assert.equal(listEvent.plan_override.transportation_plan.legs[1].driverName, 'Kelly')
  assert.equal(detailEvent.plan_override.transportation_plan.legs[1].driverName, 'Kelly')
  assert.equal(transportationRow.transportation_plan.legs[1].driverName, 'Kelly')
})

test('title, time, attendee, and checklist patches fan out to every event cache', () => {
  const queryClient = new QueryClient()
  const event = createEvent()
  queryClient.setQueryData(['events', 'rolling', '2026-08-09'], [event])
  queryClient.setQueryData(['event-details', event.id], event)

  const patch = {
    title: 'Silverball Arcade Updated',
    start_time: '2026-08-09T19:00:00.000Z',
    end_time: '2026-08-09T20:30:00.000Z',
    members: [{ id: 'member-kelly', role: 'attendee', family_member: { id: 'kelly', name: 'Kelly' } }],
    checklist: [{ id: 'bring-socks', event_id: event.id, label: 'Bring socks', checked: false, sort_order: 0 }],
  }
  applyEventAggregatePatch(queryClient, event.id, patch)

  const listEvent = queryClient.getQueryData(['events', 'rolling', '2026-08-09'])[0]
  const detailEvent = queryClient.getQueryData(['event-details', event.id])
  assert.equal(listEvent.title, patch.title)
  assert.equal(listEvent.start_time, patch.start_time)
  assert.equal(listEvent.members[0].family_member.name, 'Kelly')
  assert.equal(listEvent.checklist[0].label, 'Bring socks')
  assert.deepEqual(detailEvent, listEvent)
})

test('publishing an event patch emits one typed compatibility notification after cache fan-out', () => {
  const queryClient = new QueryClient()
  const event = createEvent()
  const target = new EventTarget()
  queryClient.setQueryData(['events', 'rolling', '2026-08-09'], [event])
  let received
  target.addEventListener('casa:event-updated', (notification) => {
    received = notification.detail
  })

  publishEventAggregatePatch(queryClient, event.id, { title: 'New title' }, target)

  assert.equal(queryClient.getQueryData(['events', 'rolling', '2026-08-09'])[0].title, 'New title')
  assert.deepEqual(received, {
    eventId: event.id,
    patch: { title: 'New title' },
  })
})
