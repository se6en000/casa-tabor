import test from 'node:test'
import assert from 'node:assert/strict'
import { toggleEventAttendee } from '../src/lib/eventMutations.ts'

// A stand-in for the Supabase client and React Query cache that records every write,
// in order, and answers every call with success.
function recorder() {
  const writes = []
  const chain = (table, op, payload) => {
    const call = { table, op, payload, filters: [] }
    writes.push(call)
    const builder = new Proxy({}, {
      get(_, key) {
        if (key === 'then') return (resolve) => resolve({ data: null, error: null })
        if (key === 'eq') return (col, val) => { call.filters.push([col, val]); return builder }
        return () => builder
      },
    })
    return builder
  }
  const supabase = {
    from: (table) => ({
      insert: (payload) => chain(table, 'insert', payload),
      update: (payload) => chain(table, 'update', payload),
      upsert: (payload) => chain(table, 'upsert', payload),
      delete: () => chain(table, 'delete'),
      select: () => chain(table, 'select'),
    }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  }
  const queryClient = new Proxy({}, { get: () => () => undefined })
  return { writes, supabase, queryClient }
}

const kelly = { id: 'kelly', name: 'Kelly' }
const nightOut = {
  id: 'night-out', title: 'Kelly BD Night Out',
  start_time: '2026-09-26T21:00:00Z', end_time: '2026-09-27T01:00:00Z',
  location_name: "Katherine Cooper's House", address: '238 Edgewood Dr, West Palm Beach, FL 33405',
  // As stored in production: setting her as the driver had turned her attendee row into "driver".
  members: [{ id: 'row-1', role: 'driver', family_member: kelly }],
  plan_override: { transportation_plan: { legs: [{ purpose: 'appointment', driverId: 'kelly', driverName: 'Kelly', passengers: [] }], attendeeRoster: [] } },
}

test('marking the driver as going changes her row to attendee instead of inserting a duplicate', async () => {
  const { writes, supabase, queryClient } = recorder()
  await toggleEventAttendee(supabase, queryClient, nightOut, 'kelly', true, [kelly])
  const members = writes.filter((w) => w.table === 'event_members')
  assert.equal(members.some((w) => w.op === 'insert'), false, 'no insert: (event, person) is unique and she already has a row')
  const update = members.find((w) => w.op === 'update')
  assert.deepEqual(update?.payload, { role: 'attendee' })
  assert.deepEqual(update.filters, [['event_id', 'night-out'], ['family_member_id', 'kelly']])
})

test('the attendee row is written before the trip roster, so a failed member write leaves nothing half-saved', async () => {
  const { writes, supabase, queryClient } = recorder()
  await toggleEventAttendee(supabase, queryClient, nightOut, 'kelly', true, [kelly])
  const firstMember = writes.findIndex((w) => w.table === 'event_members')
  const firstPlan = writes.findIndex((w) => w.table === 'event_plan_overrides')
  assert.ok(firstMember >= 0 && firstPlan >= 0, 'both are written')
  assert.ok(firstMember < firstPlan, `event_members (#${firstMember}) before event_plan_overrides (#${firstPlan})`)
})

test('someone with no row yet is inserted as an attendee, as before', async () => {
  const { writes, supabase, queryClient } = recorder()
  await toggleEventAttendee(supabase, queryClient, { ...nightOut, members: [] }, 'kelly', true, [kelly])
  const insert = writes.find((w) => w.table === 'event_members' && w.op === 'insert')
  assert.equal(insert?.payload.role, 'attendee')
})
