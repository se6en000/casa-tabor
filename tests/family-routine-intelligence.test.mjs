import test from 'node:test'
import assert from 'node:assert/strict'

import {
  generateConsolidatedRoutineActionEvents,
  isRoutineDropoffException,
  isRoutinePickupException,
  isRoutineExceptionForDate,
  getEstimatedDriveMinutes,
} from '../src/lib/familyRoutines.ts'

const mockChildEmme = {
  id: 'child-emme-id',
  name: 'Emme',
  role: 'child',
  color_hex: '#a855f7',
}

const mockChildOwen = {
  id: 'child-owen-id',
  name: 'Owen',
  role: 'child',
  color_hex: '#3b82f6',
}

const mockChildLiv = {
  id: 'child-liv-id',
  name: 'Liv',
  role: 'child',
  color_hex: '#ec4899',
}

const mockFamilyMembers = [
  { id: 'parent-jake-id', name: 'Jake', role: 'parent', color_hex: '#1e3a8a' },
  { id: 'parent-kelly-id', name: 'Kelly', role: 'parent', color_hex: '#059669' },
  { id: 'caregiver-giselle-id', name: 'Giselle', role: 'caregiver', color_hex: '#d97706' },
  mockChildEmme,
  mockChildOwen,
  mockChildLiv,
]

const mockEmmeRoutine = {
  memberId: 'child-emme-id',
  title: 'School Routine',
  venueName: 'Palm Beach Public Elementary School',
  venueAddress: '239 Cocoanut Row, Palm Beach, FL 33480',
  daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: '08:00',
  endLocal: '14:00',
  dropoffDriverName: 'Jake',
  pickupDriverName: 'Giselle',
  syncMode: 'exceptions_only',
  syncToGoogle: true,
  enabled: true,
  dayOverrides: [
    {
      dayOfWeek: 2, // Tuesday
      label: 'Early Strings Program',
      startLocal: '07:00',
      endLocal: '14:00',
      dropoffDriverName: 'Jake',
      pickupDriverName: 'Giselle',
      enabled: true,
    },
    {
      dayOfWeek: 4, // Thursday
      label: 'Late Strings Program',
      startLocal: '08:00',
      endLocal: '15:15',
      dropoffDriverName: 'Jake',
      pickupDriverName: 'Giselle',
      enabled: true,
    },
  ],
}

const mockOwenRoutine = {
  memberId: 'child-owen-id',
  title: 'School Routine',
  venueName: 'Palm Beach Public Elementary School',
  venueAddress: '239 Cocoanut Row, Palm Beach, FL 33480',
  daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: '08:00',
  endLocal: '14:00',
  dropoffDriverName: 'Jake',
  pickupDriverName: 'Giselle',
  syncMode: 'exceptions_only',
  syncToGoogle: true,
  enabled: true,
}

test('isRoutineDropoffException detects Tuesday 7:00 AM early dropoff exception for Emme', () => {
  const tuesday = new Date('2026-08-18T10:00:00.000-04:00') // Tue
  assert.equal(isRoutineDropoffException(mockEmmeRoutine, tuesday), true)

  // Pickup is standard 2:00 PM on Tuesday, so pickup must NOT be an exception
  assert.equal(isRoutinePickupException(mockEmmeRoutine, tuesday), false)
})

test('isRoutinePickupException detects Thursday 3:15 PM late pickup exception for Emme', () => {
  const thursday = new Date('2026-08-20T10:00:00.000-04:00') // Thu
  // Morning dropoff is standard 8:00 AM on Thursday, so dropoff must NOT be an exception
  assert.equal(isRoutineDropoffException(mockEmmeRoutine, thursday), false)

  // Afternoon pickup is 3:15 PM on Thursday, so pickup IS an exception
  assert.equal(isRoutinePickupException(mockEmmeRoutine, thursday), true)
})

test('standard days (Mon, Wed, Fri) are neither dropoff nor pickup exceptions in exceptions_only mode', () => {
  const wednesday = new Date('2026-08-19T10:00:00.000-04:00') // Wed
  assert.equal(isRoutineDropoffException(mockEmmeRoutine, wednesday), false)
  assert.equal(isRoutinePickupException(mockEmmeRoutine, wednesday), false)
  assert.equal(isRoutineExceptionForDate(mockEmmeRoutine, wednesday), false)
})

test('generateConsolidatedRoutineActionEvents generates only the Early Strings dropoff card on Tuesday', () => {
  const tuesday = new Date('2026-08-18T10:00:00.000-04:00')
  const events = generateConsolidatedRoutineActionEvents({
    routines: [mockEmmeRoutine, mockOwenRoutine],
    members: mockFamilyMembers,
    date: tuesday,
    filterBySyncMode: true,
  })

  // Should only have 1 event: The 6:45 AM Dropoff for Emme (Early Strings)
  assert.equal(events.length, 1)
  assert.match(events[0].title, /Drop off Emme.*Early Strings Program/)
  assert.equal(events[0].location_name, 'Palm Beach Public Elementary School')
})

test('getEstimatedDriveMinutes accurately returns drive time for Palm Beach Public and Bak Middle', () => {
  assert.equal(getEstimatedDriveMinutes('Palm Beach Public Elementary School', '239 Cocoanut Row'), 10)
  assert.equal(getEstimatedDriveMinutes('Bak Middle School of the Arts', '1725 Echo Lake Dr'), 18)
})
