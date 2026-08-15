import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evictEventFromAllCaches,
  publishEventAggregatePatch,
} from '../src/lib/eventAggregateCache.ts'

import {
  buildEventTransportationPlan,
  applyDriverChangeToPlan,
  applyWaitBehaviorToPlan,
} from '../src/lib/eventTransportation.ts'

import {
  reconcileTransportationLegTimes,
  reconcileTransportationDestination,
  calculateSnoozeWindow,
} from '../src/lib/eventMutations.ts'

const homeAddress = '3209 Washington Road, West Palm Beach, FL, 33405-1646'

test('Canary: Multi-cache eviction removes event from array and object caches with zero residue', () => {
  const mockCacheStore = new Map()

  const mockQueryClient = {
    setQueriesData: ({ queryKey }, updater) => {
      const key = queryKey[0]
      const current = mockCacheStore.get(key)
      mockCacheStore.set(key, updater(current))
    },
    removeQueries: ({ queryKey }) => {
      const key = queryKey.join(':')
      mockCacheStore.delete(key)
    },
  }

  // Prepopulate caches
  mockCacheStore.set('events', [{ id: 'ev-1', title: 'Target Event' }, { id: 'ev-2', title: 'Keep Event' }])
  mockCacheStore.set('today-events', [{ id: 'ev-1', title: 'Target Event' }, { id: 'ev-3', title: 'Keep Today' }])
  mockCacheStore.set('rolling-events', { events: [{ id: 'ev-1', title: 'Target Event' }, { id: 'ev-4', title: 'Keep Rolling' }] })
  mockCacheStore.set('event-details:ev-1', { id: 'ev-1', title: 'Target Event' })

  // Run eviction
  evictEventFromAllCaches(mockQueryClient, 'ev-1', null)

  // Verify all caches evicted 'ev-1'
  assert.deepEqual(mockCacheStore.get('events'), [{ id: 'ev-2', title: 'Keep Event' }])
  assert.deepEqual(mockCacheStore.get('today-events'), [{ id: 'ev-3', title: 'Keep Today' }])
  assert.deepEqual(mockCacheStore.get('rolling-events'), { events: [{ id: 'ev-4', title: 'Keep Rolling' }] })
  assert.equal(mockCacheStore.has('event-details:ev-1'), false)
})

test('Canary: End-to-end event lifecycle mutations maintain transportation integrity', () => {
  const initialEvent = {
    id: 'canary-ev-1',
    title: 'Soccer Practice',
    start_time: '2026-08-16T15:00:00.000Z',
    end_time: '2026-08-16T16:30:00.000Z',
    location_name: 'Phipps Park',
    address: '4715 S Dixie Hwy, West Palm Beach, FL 33405',
    members: [{ id: 'm-1', family_member: { id: 'fm-1', name: 'Owen' } }],
  }

  // 1. Initial 2-leg plan with Kelly driving and staying on site
  let plan = buildEventTransportationPlan(initialEvent, homeAddress, { id: 'fm-k', name: 'Kelly' }, { waitOnSite: true })
  assert.equal(plan.legs.length, 2)
  assert.equal(plan.waitOnSite, true)
  assert.equal(plan.legs[0].driverName, 'Kelly')
  assert.equal(plan.legs[1].driverName, 'Kelly')

  // 2. Retime event to 16:00 - 17:30
  const nextStart = new Date(2026, 7, 16, 16, 0, 0)
  const nextEnd = new Date(2026, 7, 16, 17, 30, 0)
  plan = reconcileTransportationLegTimes(plan, nextStart, nextEnd)
  assert.equal(plan.legs[0].time, '16:00')
  assert.equal(plan.legs[1].time, '17:30')

  // 3. Update venue
  plan = reconcileTransportationDestination(plan, { name: 'Howard Park', address: '1302 Parker Ave' })
  assert.equal(plan.legs[0].destination.name, 'Howard Park')
  assert.equal(plan.legs[1].origin.name, 'Howard Park')

  // 4. Switch to dropoff and assign Jake to return leg
  plan = applyWaitBehaviorToPlan(plan, 'dropoff', initialEvent, homeAddress)
  plan = applyDriverChangeToPlan(plan, 1, { id: 'fm-j', name: 'Jake' }, false)
  assert.equal(plan.waitOnSite, false)
  assert.equal(plan.legs[0].driverName, 'Kelly')
  assert.equal(plan.legs[1].driverName, 'Jake')

  // 5. Calculate snooze window
  const snooze = calculateSnoozeWindow('2026-08-16T16:00:00.000Z', 45, 90, new Date('2026-08-16T16:00:00.000Z'))
  assert.equal(snooze.start, '2026-08-16T16:45:00.000Z')
  assert.equal(snooze.end, '2026-08-16T18:15:00.000Z')
})
