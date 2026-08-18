import test from 'node:test'
import assert from 'node:assert/strict'

import {
  calculateSnoozeWindow,
  reconcileTransportationLegTimes,
  reconcileTransportationDestination,
} from '../src/lib/eventMutations.ts'

import {
  buildEventTransportationPlan,
  syncTransportationAttendees,
} from '../src/lib/eventTransportation.ts'

const testEvent = {
  id: 'event-mut-123',
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

test('calculateSnoozeWindow calculates future start and end times properly from reference time', () => {
  const refTime = new Date('2026-08-16T12:00:00.000Z')
  const { start, end } = calculateSnoozeWindow(
    '2026-08-16T10:00:00.000Z',
    60, // 60 mins snooze
    30, // 30 mins event duration
    refTime,
  )

  assert.equal(start, '2026-08-16T13:00:00.000Z')
  assert.equal(end, '2026-08-16T13:30:00.000Z')
})

test('reconcileTransportationLegTimes updates arrive_by and depart_at leg times when event timing changes', () => {
  const plan = buildEventTransportationPlan(testEvent, homeAddress, {
    id: 'fm-jake',
    name: 'Jake',
  })

  const newStart = new Date('2026-08-16T14:30:00.000-04:00') // 14:30
  const newEnd = new Date('2026-08-16T16:30:00.000-04:00')   // 16:30

  const updatedPlan = reconcileTransportationLegTimes(plan, newStart, newEnd)

  assert.equal(updatedPlan.legs[0].time, '14:30')
  assert.equal(updatedPlan.legs[0].timing, 'arrive_by')
  assert.equal(updatedPlan.legs[1].time, '16:30')
  assert.equal(updatedPlan.legs[1].timing, 'depart_at')
})

test('reconcileTransportationDestination updates outbound destination and return origin', () => {
  const plan = buildEventTransportationPlan(testEvent, homeAddress, {
    id: 'fm-jake',
    name: 'Jake',
  })

  const newVenue = {
    name: 'South Florida Science Center',
    address: '4801 Dreher Trail N, West Palm Beach, FL 33405',
  }

  const updatedPlan = reconcileTransportationDestination(plan, newVenue)

  assert.equal(updatedPlan.legs[0].destination.name, 'South Florida Science Center')
  assert.equal(updatedPlan.legs[0].destination.address, '4801 Dreher Trail N, West Palm Beach, FL 33405')
  assert.equal(updatedPlan.legs[1].origin.name, 'South Florida Science Center')
  assert.equal(updatedPlan.legs[1].origin.address, '4801 Dreher Trail N, West Palm Beach, FL 33405')
})

test('syncTransportationAttendees synchronizes passenger chips without duplicating', () => {
  const plan = buildEventTransportationPlan(testEvent, homeAddress, {
    id: 'fm-jake',
    name: 'Jake',
  })

  const syncedPlan = syncTransportationAttendees(plan, ['Liv', 'Owen'])

  assert.deepEqual(syncedPlan.attendeeRoster, ['Liv', 'Owen'])
  assert.deepEqual(syncedPlan.legs[0].passengers, ['Liv', 'Owen'])
  assert.deepEqual(syncedPlan.legs[1].passengers, ['Liv', 'Owen'])
})

test('updateEventSchedule with isAllDay formats ISO to full day boundaries and clears departure time', async () => {
  const { updateEventSchedule } = await import('../src/lib/eventMutations.ts')
  let updatedPayload = null
  let enrichUpdatedPayload = null
  const mockSupabase = {
    functions: {
      invoke: () => Promise.resolve(),
    },
    from: (table) => ({
      update: (payload) => {
        if (table === 'events') updatedPayload = payload
        if (table === 'event_enrichments') enrichUpdatedPayload = payload
        return {
          eq: () => Promise.resolve({ error: null }),
        }
      },
    }),
  }
  const mockQueryClient = {
    getQueryData: () => null,
    setQueryData: () => {},
    setQueriesData: () => {},
    invalidateQueries: () => Promise.resolve(),
    refetchQueries: () => Promise.resolve(),
  }

  const startDate = new Date(2026, 7, 18, 8, 0, 0) // Aug 18, 2026
  const endDate = new Date(2026, 7, 18, 8, 45, 0)
  const eventWithEnrichment = {
    ...testEvent,
    enrichment: {
      drive_time_mins: 15,
      departure_time: '2026-08-18T07:40:00.000Z',
    },
  }

  await updateEventSchedule(mockSupabase, mockQueryClient, eventWithEnrichment, startDate, endDate, true)

  assert.ok(updatedPayload)
  assert.equal(updatedPayload.all_day, true)
  assert.match(updatedPayload.start_time, /2026-08-18T00:00:00\.000Z/)
  assert.match(updatedPayload.end_time, /2026-08-18T23:59:59\.000Z/)
  assert.ok(enrichUpdatedPayload)
  assert.equal(enrichUpdatedPayload.departure_time, null)
})

test('deleteCalendarEvent cleans up child records before deleting from events', async () => {
  const { deleteCalendarEvent } = await import('../src/lib/eventMutations.ts')
  const deletedTables = []
  const mockSupabase = {
    functions: {
      invoke: () => Promise.resolve(),
    },
    from: (table) => ({
      delete: () => ({
        eq: (col, val) => {
          deletedTables.push(table)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }
  const mockQueryClient = {
    getQueryData: () => null,
    setQueryData: () => {},
    setQueriesData: () => {},
    removeQueries: () => {},
    invalidateQueries: () => Promise.resolve(),
    refetchQueries: () => Promise.resolve(),
  }

  await deleteCalendarEvent(mockSupabase, mockQueryClient, 'evt-123')

  assert.ok(deletedTables.includes('event_members'))
  assert.ok(deletedTables.includes('event_enrichments'))
  assert.ok(deletedTables.includes('event_plan_overrides'))
  assert.ok(deletedTables.includes('events'))
  assert.equal(deletedTables[deletedTables.length - 1], 'events')
})

