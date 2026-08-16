import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  generateRoutineActionEvents,
  deriveAmbientRoutineStatus,
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

test('ambient status is active at 10:00 AM and informs kiosk glanceability', () => {
  const midMorning = new Date('2026-08-19T10:00:00.000-04:00')
  const ambient = deriveAmbientRoutineStatus([mockRoutine], [mockChild], midMorning)

  assert.equal(ambient.length, 1)
  assert.equal(ambient[0].childName, 'Liv')
  assert.equal(ambient[0].venueName, 'Bak Middle School')
  assert.equal(ambient[0].text, 'Liv: At Bak Middle School until 2:00 PM')
})

test('at 1:40 PM pickup departure event activates for afternoon hero', () => {
  const afternoonDate = new Date('2026-08-19T13:40:00.000-04:00')
  const events = generateRoutineActionEvents({
    routine: mockRoutine,
    child: mockChild,
    date: afternoonDate,
    driveMinutes: 15,
    bufferMinutes: 5,
  })

  assert.equal(events.length, 2)
  const pickupEvent = events[1]
  assert.equal(pickupEvent.title, 'Pick up Liv @ Bak Middle School')
  assert.equal(pickupEvent.source_member_id, 'kelly-id')

  // Check dismissal event start time is 2:00 PM (14:00) and calculated departure is ~1:42 PM
  const eventStart = new Date(pickupEvent.start_time)
  assert.equal(eventStart.getHours(), 14)
  assert.equal(eventStart.getMinutes(), 0)

  const departureDate = new Date(pickupEvent.enrichment.departure_time)
  assert.equal(departureDate.getHours(), 13)
  assert.equal(departureDate.getMinutes(), 45)
})

test('CalmKioskView and useCalmKioskPresenter bind ambient routine projection', () => {
  const presenterCode = readFileSync(new URL('../src/hooks/useCalmKioskPresenter.ts', import.meta.url), 'utf8')
  assert.match(presenterCode, /ambientRoutineStatuses/)
  assert.match(presenterCode, /deriveAmbientRoutineStatus/)
  assert.match(presenterCode, /effectiveTodayEvents/)

  const kioskViewCode = readFileSync(new URL('../src/components/canvas/CalmKioskView.tsx', import.meta.url), 'utf8')
  assert.match(kioskViewCode, /ambientRoutineStatuses/)
})
