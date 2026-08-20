import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveFocusedEventDeterministicAnswer, deriveEventTransportation } from '../src/lib/focusedEventDeterministicAnswer.ts'

test('focusedEventDeterministicAnswer: resolves driver inquiries with explicit plan', () => {
  const mockEvent = {
    id: 'evt-1',
    title: "Liv's Well Child Checkup",
    start_time: '2026-08-21T15:40:00Z',
    end_time: '2026-08-21T16:30:00Z',
    plan_override: {
      transportation_plan: {
        legs: [
          {
            driverName: 'Jake',
            time: '3:05 PM',
            passengers: ['Jake', 'Liv'],
          },
        ],
      },
    },
    members: [],
    checklist: [],
    actions: [],
  }

  const res1 = resolveFocusedEventDeterministicAnswer('Who is driving?', mockEvent)
  assert.equal(res1.matched, true)
  assert.match(res1.content, /Jake.*assigned to drive.*Liv's Well Child Checkup/)

  const res2 = resolveFocusedEventDeterministicAnswer('who is the driver?', mockEvent)
  assert.equal(res2.matched, true)
  assert.match(res2.content, /Jake/)
})

test('focusedEventDeterministicAnswer: resolves driver from parent attendee (e.g. Jake + Emme drop off)', () => {
  const mockEvent = {
    id: 'evt-2',
    title: 'Drop off Emme @ Palm Beach Public Elementary School',
    start_time: '2026-08-18T06:45:00Z',
    end_time: '2026-08-18T07:15:00Z',
    address: 'Palm Beach Public Elementary School',
    members: [
      { id: 'm-1', role: 'attendee', family_member: { id: 'fm-1', name: 'Jake', role: 'parent', can_drive: true } },
      { id: 'm-2', role: 'attendee', family_member: { id: 'fm-2', name: 'Emme', role: 'child', can_drive: false } },
    ],
    checklist: [],
    actions: [],
  }

  const res = resolveFocusedEventDeterministicAnswer('Who is driving?', mockEvent)
  assert.equal(res.matched, true)
  assert.match(res.content, /Jake.*assigned to drive.*Drop off Emme/)
  assert.match(res.content, /driving Jake, Emme/)

  const transport = deriveEventTransportation(mockEvent)
  assert.equal(transport.driverName, 'Jake')
  assert.deepEqual(transport.passengers, ['Jake', 'Emme'])
  assert.equal(transport.driveMinutes, 10)
  assert.equal(transport.bufferMinutes, 5)
})

test('focusedEventDeterministicAnswer: resolves driving time and buffer inquiries instantly', () => {
  const mockEvent = {
    id: 'evt-1',
    title: "Liv's Well Child Checkup",
    start_time: '2026-08-21T15:40:00Z',
    end_time: '2026-08-21T16:30:00Z',
    plan_override: {
      transportation_plan: {
        legs: [
          {
            driverName: 'Jake',
            time: '3:05 PM',
          },
        ],
      },
    },
    members: [],
    checklist: [],
    actions: [],
  }

  const res = resolveFocusedEventDeterministicAnswer('Check driving time and buffer', mockEvent)
  assert.equal(res.matched, true)
  assert.match(res.content, /leave home by \*\*3:05 PM\*\*/)
})

test('focusedEventDeterministicAnswer: resolves preparation notes inquiries instantly', () => {
  const mockEvent = {
    id: 'evt-1',
    title: 'Soccer Practice',
    start_time: '2026-08-21T17:00:00Z',
    end_time: '2026-08-21T18:30:00Z',
    enrichment: {
      prep_notes: 'Bring shin guards and water bottle',
      what_to_bring: ['Cleats', 'Ball'],
    },
    members: [],
    checklist: [{ id: 'chk-1', label: 'Pump ball', checked: false }],
    actions: [],
  }

  const res = resolveFocusedEventDeterministicAnswer('View preparation notes', mockEvent)
  assert.equal(res.matched, true)
  assert.match(res.content, /Bring shin guards and water bottle/)
  assert.match(res.content, /Cleats/)
  assert.match(res.content, /Pump ball/)
})

test('focusedEventDeterministicAnswer: returns matched: false for unrelated queries', () => {
  const mockEvent = {
    id: 'evt-1',
    title: 'Dinner at Home',
    start_time: '2026-08-21T19:00:00Z',
    end_time: '2026-08-21T20:00:00Z',
    members: [],
    checklist: [],
    actions: [],
  }

  const res = resolveFocusedEventDeterministicAnswer('What is the recipe for lasagna?', mockEvent)
  assert.equal(res.matched, false)
})
