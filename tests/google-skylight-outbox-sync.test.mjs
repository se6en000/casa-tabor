import test from 'node:test'
import assert from 'node:assert/strict'

import {
  generateRoutineActionEvents,
} from '../src/lib/familyRoutines.ts'

const mockChild = {
  id: 'child-liv-id',
  name: 'Liv',
  full_name: 'Olivia Tabor',
  role: 'child',
  color_hex: '#ec4899',
  color_name: 'Pink',
  phone: null,
  email: null,
  google_calendar_id: null,
  can_drive: false,
  availability_mode: 'strict',
  show_on_home_sidebar: true,
  is_admin: false,
  avatar_url: null,
  sort_order: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockRoutine = {
  memberId: 'child-liv-id',
  title: 'School Routine',
  venueName: 'Bak Middle School',
  venueAddress: '1725 Echo Lake Dr, West Palm Beach, FL',
  daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: '08:00',
  endLocal: '14:00',
  dropoffDriverName: 'Jake',
  dropoffDriverId: 'jake-id',
  pickupDriverName: 'Kelly',
  pickupDriverId: 'kelly-id',
  syncToGoogle: true,
  enabled: true,
}

test('routine action events create two discrete short Google Calendar events with zero midday blocking', () => {
  const wednesday = new Date('2026-08-19T10:00:00.000-04:00')
  const events = generateRoutineActionEvents({
    routine: mockRoutine,
    child: mockChild,
    date: wednesday,
    driveMinutes: 15,
    bufferMinutes: 5,
  })

  assert.equal(events.length, 2)

  // 1. Morning Drop-off (Arrival window: 7:45 AM to 8:00 AM)
  const dropEvent = events[0]
  assert.equal(dropEvent.title, 'Drop off Liv @ Bak Middle School')
  const dropStart = new Date(dropEvent.start_time)
  const dropEnd = new Date(dropEvent.end_time)
  const dropDurationMins = (dropEnd.getTime() - dropStart.getTime()) / 60000
  assert.equal(dropDurationMins, 15) // 7:45 AM to 8:00 AM window
  assert.equal(dropStart.getHours(), 7)
  assert.equal(dropStart.getMinutes(), 45)
  assert.equal(dropEnd.getHours(), 8)
  assert.equal(dropEnd.getMinutes(), 0)

  // 2. Afternoon Pick-up (Dismissal window: 2:00 PM to 2:15 PM)
  const pickEvent = events[1]
  assert.equal(pickEvent.title, 'Pick up Liv @ Bak Middle School')
  const pickStart = new Date(pickEvent.start_time)
  const pickEnd = new Date(pickEvent.end_time)
  const pickDurationMins = (pickEnd.getTime() - pickStart.getTime()) / 60000
  assert.equal(pickDurationMins, 15) // 2:00 PM to 2:15 PM window
  assert.equal(pickStart.getHours(), 14)
  assert.equal(pickStart.getMinutes(), 0)
  assert.equal(pickEnd.getHours(), 14)
  assert.equal(pickEnd.getMinutes(), 15)

  // 3. Midday Unblocked Check: The window from 8:00 AM to 2:00 PM is 100% open
  const eventsBetween8and2 = events.filter((e) => {
    const s = new Date(e.start_time)
    return s.getHours() >= 8 && s.getHours() < 14
  })
  assert.equal(eventsBetween8and2.length, 0)
})

test('routine events format cleanly for Google Calendar and Skylight sync pipeline', () => {
  const wednesday = new Date('2026-08-19T10:00:00.000-04:00')
  const events = generateRoutineActionEvents({
    routine: mockRoutine,
    child: mockChild,
    date: wednesday,
  })

  for (const ev of events) {
    // Check required fields for Google Calendar event creation
    assert.ok(ev.title.length > 0)
    assert.ok(ev.start_time)
    assert.ok(ev.end_time)
    assert.equal(ev.all_day, false)
    assert.equal(ev.location_name, 'Bak Middle School')
    assert.equal(ev.address, '1725 Echo Lake Dr, West Palm Beach, FL')
    assert.ok(ev.enrichment)
    assert.equal(ev.enrichment?.category, 'School')
  }
})
