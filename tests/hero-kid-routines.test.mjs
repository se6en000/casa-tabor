import test from 'node:test'
import assert from 'node:assert/strict'
import {
  serializeRoutineToAvailabilityRules,
  deserializeRoutineFromAvailabilityRules,
  isRoutineDropoffException,
  generateConsolidatedRoutineActionEvents,
} from '../src/lib/familyRoutines.ts'

const mockEmme = {
  id: 'fb1649b7-cb87-43f0-870b-59cc2f104211',
  name: 'Emme',
  full_name: 'Emerson Tabor',
  role: 'child',
  color_hex: '#C47A8A',
}

const mockOwen = {
  id: '45e4d6d6-94b9-4499-9941-e3c6c84ea0d6',
  name: 'Owen',
  full_name: 'Owen Tabor',
  role: 'child',
  color_hex: '#2980B9',
}

const mockLiv = {
  id: '5ce6c603-ca19-403b-b5e1-f89af298e83b',
  name: 'Liv',
  full_name: 'Olivia Tabor',
  role: 'child',
  color_hex: '#6B7FD7',
}

const mockJake = {
  id: '8bf81a21-f2b8-4232-91c6-5a5e9d5b9488',
  name: 'Jake',
  role: 'parent',
  can_drive: true,
}

const mockKelly = {
  id: '0d69812c-9710-4e92-9dbc-cfb784c2d902',
  name: 'Kelly',
  role: 'parent',
  can_drive: true,
}

const mockGiselle = {
  id: '3b0404d3-82db-4321-bc0b-5af07c154ce3',
  name: 'Giselle',
  role: 'caregiver',
  can_drive: true,
}

const mockMembers = [mockJake, mockKelly, mockGiselle, mockEmme, mockOwen, mockLiv]

const baseEmmeRoutine = {
  memberId: mockEmme.id,
  title: 'School Routine',
  routineType: 'school',
  venueName: 'Palm Beach Public Elementary School',
  venueAddress: '239 Cocoanut Row, Palm Beach, FL, 33480',
  daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: '08:00',
  endLocal: '14:00',
  dropoffDriverName: 'Jake',
  dropoffDriverId: mockJake.id,
  pickupDriverName: 'Giselle',
  pickupDriverId: mockGiselle.id,
  syncMode: 'exceptions_only',
  syncToGoogle: true,
  enabled: true,
  dayOverrides: [
    {
      dayOfWeek: 2, // Tuesday
      startLocal: '07:00',
      endLocal: '14:00',
      dropoffDriverName: 'Jake',
      dropoffDriverId: mockJake.id,
      pickupDriverName: 'Giselle',
      pickupDriverId: mockGiselle.id,
      enabled: true,
      label: 'Early Beethoven Strings',
    },
    {
      dayOfWeek: 4, // Thursday
      startLocal: '08:00',
      endLocal: '15:00',
      dropoffDriverName: 'Jake',
      dropoffDriverId: mockJake.id,
      pickupDriverName: 'Giselle',
      pickupDriverId: mockGiselle.id,
      enabled: true,
      label: 'Late Strings Pickup',
    },
  ],
}

const baseOwenRoutine = {
  memberId: mockOwen.id,
  title: 'School Routine',
  routineType: 'school',
  venueName: 'Palm Beach Public Elementary School',
  venueAddress: '239 Cocoanut Row, Palm Beach, FL, 33480',
  daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: '08:00',
  endLocal: '14:00',
  dropoffDriverName: 'Jake',
  dropoffDriverId: mockJake.id,
  pickupDriverName: 'Giselle',
  pickupDriverId: mockGiselle.id,
  syncMode: 'exceptions_only',
  syncToGoogle: true,
  enabled: true,
}

const baseLivRoutine = {
  memberId: mockLiv.id,
  title: 'School Routine',
  routineType: 'school',
  venueName: 'Bak Middle School of the Arts',
  venueAddress: '1725 Echo Lake Dr, West Palm Beach, FL',
  daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: '08:00',
  endLocal: '15:30',
  dropoffDriverName: 'Kelly',
  dropoffDriverId: mockKelly.id,
  pickupDriverName: 'Giselle',
  pickupDriverId: mockGiselle.id,
  syncMode: 'exceptions_only',
  syncToGoogle: true,
  enabled: true,
}

test('deserializeRoutineFromAvailabilityRules correctly preserves base startLocal 08:00 when Tuesday override is first in DB rows', () => {
  const serializedRules = serializeRoutineToAvailabilityRules(baseEmmeRoutine)

  // Simulate arbitrary DB ordering where Tuesday (day 2, start 07:00) is the first returned row
  const reorderedRules = [
    serializedRules.find((r) => r.day_of_week === 2),
    ...serializedRules.filter((r) => r.day_of_week !== 2),
  ].map((r, i) => ({
    ...r,
    id: `rule-${i}`,
    created_at: '2026-08-20T02:31:37.399132+00:00',
    updated_at: '2026-08-20T02:31:37.399132+00:00',
  }))

  const deserialized = deserializeRoutineFromAvailabilityRules(mockEmme.id, reorderedRules)
  assert.ok(deserialized)
  assert.equal(deserialized.startLocal, '08:00', 'Base startLocal must remain 08:00, not overridden 07:00')
  assert.equal(deserialized.endLocal, '14:00', 'Base endLocal must remain 14:00')
  assert.equal(deserialized.dayOverrides?.length, 2)
  assert.equal(deserialized.dayOverrides?.find((o) => o.dayOfWeek === 2)?.startLocal, '07:00')
})

test('Friday departure does not trigger early strings exception, while Tuesday early strings departure does', () => {
  const serializedRules = serializeRoutineToAvailabilityRules(baseEmmeRoutine)
  const reorderedRules = [
    serializedRules.find((r) => r.day_of_week === 2),
    ...serializedRules.filter((r) => r.day_of_week !== 2),
  ].map((r, i) => ({
    ...r,
    id: `rule-${i}`,
    created_at: '2026-08-20T02:31:37.399132+00:00',
    updated_at: '2026-08-20T02:31:37.399132+00:00',
  }))

  const deserialized = deserializeRoutineFromAvailabilityRules(mockEmme.id, reorderedRules)
  assert.ok(deserialized)

  // Friday, August 21, 2026
  const friday = new Date('2026-08-21T06:50:00-04:00')
  assert.equal(isRoutineDropoffException(deserialized, friday), false, 'Friday must NOT be a dropoff exception')

  // Tuesday, August 25, 2026
  const tuesday = new Date('2026-08-25T06:50:00-04:00')
  assert.equal(isRoutineDropoffException(deserialized, tuesday), true, 'Tuesday MUST be a dropoff exception for Early Beethoven Strings')
})

test('On Friday, Emme & Owen merge into 8:00 AM arrival (7:50 AM departure) and Liv departs at 7:42 AM', () => {
  const friday = new Date('2026-08-21T10:00:00-04:00')
  const events = generateConsolidatedRoutineActionEvents({
    routines: [baseEmmeRoutine, baseOwenRoutine, baseLivRoutine],
    members: mockMembers,
    date: friday,
  })

  // 2 morning dropoffs: Liv @ Bak (7:42 AM leave, 8:00 AM arrive) + Emme & Owen @ PBP (7:50 AM leave, 8:00 AM arrive)
  const dropoffs = events.filter((e) => e.title.includes('Drop off'))
  assert.equal(dropoffs.length, 2)

  const pbpDrop = dropoffs.find((e) => e.title.includes('Palm Beach Public'))
  assert.ok(pbpDrop)
  assert.equal(pbpDrop.title, 'Drop off Emme & Owen @ Palm Beach Public Elementary School')
  assert.equal(new Date(pbpDrop.enrichment.departure_time).getHours(), 7)
  assert.equal(new Date(pbpDrop.enrichment.departure_time).getMinutes(), 50)
  assert.equal(pbpDrop.members.filter((m) => m.role === 'passenger').length, 2)

  const bakDrop = dropoffs.find((e) => e.title.includes('Bak Middle'))
  assert.ok(bakDrop)
  assert.equal(bakDrop.title, 'Drop off Liv @ Bak Middle School of the Arts')
  assert.equal(new Date(bakDrop.enrichment.departure_time).getHours(), 7)
  assert.equal(new Date(bakDrop.enrichment.departure_time).getMinutes(), 42)
})

test('On Tuesday, Emme departs early at 6:50 AM for Early Beethoven Strings, while Owen departs at 7:50 AM', () => {
  const tuesday = new Date('2026-08-25T10:00:00-04:00')
  const events = generateConsolidatedRoutineActionEvents({
    routines: [baseEmmeRoutine, baseOwenRoutine, baseLivRoutine],
    members: mockMembers,
    date: tuesday,
  })

  const dropoffs = events.filter((e) => e.title.includes('Drop off'))
  // 3 separate dropoffs on Tuesday: Emme @ 6:50 AM leave, Liv @ 7:42 AM leave, Owen @ 7:50 AM leave
  assert.equal(dropoffs.length, 3)

  const emmeDrop = dropoffs.find((e) => e.title.includes('Emme'))
  assert.ok(emmeDrop)
  assert.match(emmeDrop.title, /Early Beethoven Strings/)
  assert.equal(new Date(emmeDrop.enrichment.departure_time).getHours(), 6)
  assert.equal(new Date(emmeDrop.enrichment.departure_time).getMinutes(), 50)

  const owenDrop = dropoffs.find((e) => e.title.includes('Owen'))
  assert.ok(owenDrop)
  assert.equal(new Date(owenDrop.enrichment.departure_time).getHours(), 7)
  assert.equal(new Date(owenDrop.enrichment.departure_time).getMinutes(), 50)
})
