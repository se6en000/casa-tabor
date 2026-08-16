import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  generateRoutineActionEvents,
  generateConsolidatedRoutineActionEvents,
  deriveAmbientRoutineStatus,
  serializeRoutineToAvailabilityRules,
  deserializeRoutineFromAvailabilityRules,
  createSchoolRoutine,
  createCampRoutine,
} from '../src/lib/familyRoutines.ts'

const mockLiv = {
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

const mockOwen = {
  id: 'child-owen-id',
  name: 'Owen',
  full_name: 'Owen Tabor',
  role: 'child',
  color_hex: '#3b82f6',
  color_name: 'Blue',
  phone: null,
  email: null,
  google_calendar_id: null,
  can_drive: false,
  availability_mode: 'strict',
  show_on_home_sidebar: true,
  is_admin: false,
  avatar_url: null,
  sort_order: 2,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockEmme = {
  id: 'child-emme-id',
  name: 'Emme',
  full_name: 'Emme Tabor',
  role: 'child',
  color_hex: '#f59e0b',
  color_name: 'Amber',
  phone: null,
  email: null,
  google_calendar_id: null,
  can_drive: false,
  availability_mode: 'strict',
  show_on_home_sidebar: true,
  is_admin: false,
  avatar_url: null,
  sort_order: 3,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockJake = {
  id: 'parent-jake-id',
  name: 'Jake',
  full_name: 'Jake Tabor',
  role: 'parent',
  color_hex: '#10b981',
  color_name: 'Green',
  can_drive: true,
}

const mockGiselle = {
  id: 'caregiver-giselle-id',
  name: 'Giselle',
  full_name: 'Giselle Caregiver',
  role: 'caregiver',
  color_hex: '#8b5cf6',
  color_name: 'Purple',
  can_drive: true,
}

const mockMembers = [mockJake, mockGiselle, mockLiv, mockOwen, mockEmme]

const mockLivSchoolRoutine = {
  memberId: 'child-liv-id',
  title: 'School Routine',
  routineType: 'school',
  venueName: 'Bak Middle School of the Arts',
  venueAddress: '1725 Echo Lake Dr, West Palm Beach, FL',
  daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: '08:00',
  endLocal: '15:30',
  startDate: '2026-08-10',
  endDate: '2027-05-28',
  dropoffDriverName: 'Jake',
  dropoffDriverId: 'parent-jake-id',
  pickupDriverName: 'Giselle',
  pickupDriverId: 'caregiver-giselle-id',
  syncToGoogle: true,
  enabled: true,
}

const mockOwenSchoolRoutine = {
  memberId: 'child-owen-id',
  title: 'School Routine',
  routineType: 'school',
  venueName: 'Palm Beach Public Elementary School',
  venueAddress: '239 Cocoanut Row, Palm Beach, FL 33480',
  daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: '08:00',
  endLocal: '14:00',
  startDate: '2026-08-10',
  endDate: '2027-05-28',
  dropoffDriverName: 'Jake',
  dropoffDriverId: 'parent-jake-id',
  pickupDriverName: 'Giselle',
  pickupDriverId: 'caregiver-giselle-id',
  syncToGoogle: true,
  enabled: true,
}

const mockEmmeSchoolRoutine = {
  memberId: 'child-emme-id',
  title: 'School Routine',
  routineType: 'school',
  venueName: 'Palm Beach Public Elementary School',
  venueAddress: '239 Cocoanut Row, Palm Beach, FL 33480',
  daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: '08:00',
  endLocal: '14:00',
  startDate: '2026-08-10',
  endDate: '2027-05-28',
  dropoffDriverName: 'Jake',
  dropoffDriverId: 'parent-jake-id',
  pickupDriverName: 'Giselle',
  pickupDriverId: 'caregiver-giselle-id',
  syncToGoogle: true,
  enabled: true,
}

test('generateConsolidatedRoutineActionEvents merges Owen & Emme into 1 PBP event and Liv into 1 Bak event', () => {
  // Wednesday, Aug 19, 2026
  const wednesday = new Date('2026-08-19T10:00:00.000-04:00')

  const events = generateConsolidatedRoutineActionEvents({
    routines: [mockLivSchoolRoutine, mockOwenSchoolRoutine, mockEmmeSchoolRoutine],
    members: mockMembers,
    date: wednesday,
  })

  // 2 drop-offs (1 for Owen+Emme @ PBP, 1 for Liv @ Bak) + 2 pick-ups = 4 events total (not 6!)
  assert.equal(events.length, 4)

  // 1. PBP Morning Drop-off (Owen & Emme)
  const pbpDrop = events.find(e => e.title.includes('Palm Beach Public') && e.title.includes('Drop off'))
  assert.notEqual(pbpDrop, undefined)
  assert.equal(pbpDrop.title, 'Drop off Owen & Emme @ Palm Beach Public Elementary School')
  // PBP drive time: 10 mins
  assert.equal(pbpDrop.enrichment?.drive_time_mins, 10)
  // Drop-off window: 7:45 AM - 8:00 AM
  const pbpStart = new Date(pbpDrop.start_time)
  assert.equal(pbpStart.getHours(), 7)
  assert.equal(pbpStart.getMinutes(), 45)
  // Leave time: 7:45 AM - 10m = 7:35 AM
  const pbpDep = new Date(pbpDrop.enrichment.departure_time)
  assert.equal(pbpDep.getHours(), 7)
  assert.equal(pbpDep.getMinutes(), 35)
  // Check passengers: Owen & Emme
  const pbpPassengers = pbpDrop.members.filter(m => m.role === 'passenger')
  assert.equal(pbpPassengers.length, 2)
  assert.equal(pbpDrop.members.some(m => m.role === 'driver' && m.family_member?.name === 'Jake'), true)

  // 2. Bak Morning Drop-off (Liv)
  const bakDrop = events.find(e => e.title.includes('Bak Middle') && e.title.includes('Drop off'))
  assert.notEqual(bakDrop, undefined)
  assert.equal(bakDrop.title, 'Drop off Liv @ Bak Middle School of the Arts')
  // Bak drive time: 18 mins
  assert.equal(bakDrop.enrichment?.drive_time_mins, 18)
  // Drop-off window: 7:45 AM - 8:00 AM
  const bakStart = new Date(bakDrop.start_time)
  assert.equal(bakStart.getHours(), 7)
  assert.equal(bakStart.getMinutes(), 45)
  // Leave time: 7:45 AM - 18m = 7:27 AM
  const bakDep = new Date(bakDrop.enrichment.departure_time)
  assert.equal(bakDep.getHours(), 7)
  assert.equal(bakDep.getMinutes(), 27)
  // Check passenger: Liv
  const bakPassengers = bakDrop.members.filter(m => m.role === 'passenger')
  assert.equal(bakPassengers.length, 1)

  // 3. PBP Afternoon Pick-up (Owen & Emme @ 2:00 PM)
  const pbpPick = events.find(e => e.title.includes('Palm Beach Public') && e.title.includes('Pick up'))
  assert.notEqual(pbpPick, undefined)
  assert.equal(pbpPick.title, 'Pick up Owen & Emme @ Palm Beach Public Elementary School')
  assert.equal(pbpPick.enrichment?.drive_time_mins, 10)
  const pbpPickDep = new Date(pbpPick.enrichment.departure_time)
  assert.equal(pbpPickDep.getHours(), 13) // 1:50 PM
  assert.equal(pbpPickDep.getMinutes(), 50)
  assert.equal(pbpPick.members.some(m => m.role === 'driver' && m.family_member?.name === 'Giselle'), true)

  // 4. Bak Afternoon Pick-up (Liv @ 3:30 PM)
  const bakPick = events.find(e => e.title.includes('Bak Middle') && e.title.includes('Pick up'))
  assert.notEqual(bakPick, undefined)
  assert.equal(bakPick.title, 'Pick up Liv @ Bak Middle School of the Arts')
  assert.equal(bakPick.enrichment?.drive_time_mins, 18)
  const bakPickDep = new Date(bakPick.enrichment.departure_time)
  assert.equal(bakPickDep.getHours(), 15) // 3:12 PM
  assert.equal(bakPickDep.getMinutes(), 12)
})

test('generateRoutineActionEvents respects startDate and endDate boundaries', () => {
  // Wednesday, Aug 5, 2026 (Before school year start date Aug 10, 2026)
  const beforeStart = new Date('2026-08-05T10:00:00.000-04:00')
  const beforeEvents = generateRoutineActionEvents({
    routine: mockLivSchoolRoutine,
    child: mockLiv,
    date: beforeStart,
  })
  assert.equal(beforeEvents.length, 0)

  // Wednesday, June 9, 2027 (After school year end date May 28, 2027)
  const afterEnd = new Date('2027-06-09T10:00:00.000-04:00')
  const afterEvents = generateRoutineActionEvents({
    routine: mockLivSchoolRoutine,
    child: mockLiv,
    date: afterEnd,
  })
  assert.equal(afterEvents.length, 0)
})

test('deriveAmbientRoutineStatus returns active status during school or camp hours', () => {
  // Wednesday 10:30 AM (during school)
  const duringSchool = new Date('2026-08-19T10:30:00.000-04:00')
  const activeStatus = deriveAmbientRoutineStatus([mockLivSchoolRoutine], [mockLiv], duringSchool)

  assert.equal(activeStatus.length, 1)
  assert.equal(activeStatus[0].isActive, true)
  assert.equal(activeStatus[0].childName, 'Liv')
  assert.equal(activeStatus[0].venueName, 'Bak Middle School of the Arts')
  assert.equal(activeStatus[0].endsAtFormatted, '3:30 PM')
  assert.match(activeStatus[0].text, /Liv: At Bak Middle School of the Arts until 3:30 PM/)

  // Wednesday 6:30 AM (before school)
  const beforeSchool = new Date('2026-08-19T06:30:00.000-04:00')
  assert.equal(deriveAmbientRoutineStatus([mockLivSchoolRoutine], [mockLiv], beforeSchool).length, 0)

  // Wednesday 4:30 PM (after school)
  const afterSchool = new Date('2026-08-19T16:30:00.000-04:00')
  assert.equal(deriveAmbientRoutineStatus([mockLivSchoolRoutine], [mockLiv], afterSchool).length, 0)
})

test('serialization and deserialization roundtrip preserves routineType, date range and seasonal attributes', () => {
  const camp = {
    ...createCampRoutine(mockLiv.id, 'Summer Day Camp', '1200 Lake Pavilion Way'),
    startDate: '2026-06-08',
    endDate: '2026-08-07',
  }
  const rules = serializeRoutineToAvailabilityRules(camp)
  assert.equal(rules.length, 5) // Mon through Fri

  const roundtripped = deserializeRoutineFromAvailabilityRules(
    mockLiv.id,
    rules.map((r, i) => ({ ...r, id: `rule-${i}`, created_at: '', updated_at: '' })),
  )

  assert.notEqual(roundtripped, null)
  assert.equal(roundtripped?.routineType, 'camp')
  assert.equal(roundtripped?.venueName, 'Summer Day Camp')
  assert.equal(roundtripped?.venueAddress, '1200 Lake Pavilion Way')
  assert.equal(roundtripped?.startDate, '2026-06-08')
  assert.equal(roundtripped?.endDate, '2026-08-07')
  assert.deepEqual(roundtripped?.daysOfWeek, [1, 2, 3, 4, 5])
  assert.equal(roundtripped?.startLocal, '09:00')
  assert.equal(roundtripped?.endLocal, '16:00')
})

test('DayScheduleOverride correctly splits siblings on custom days and merges on standard days', () => {
  // Emme has a Tuesday Early Strings drop-off (07:00) and Thursday late pickup (15:15)
  const emmeWithOverrides = {
    ...mockEmmeSchoolRoutine,
    dayOverrides: [
      { dayOfWeek: 2, startLocal: '07:00', endLocal: '14:00', label: 'Early Strings' },
      { dayOfWeek: 4, startLocal: '08:00', endLocal: '15:15', label: 'After-school Club' },
    ],
  }

  // Tuesday, Aug 18, 2026
  const tuesday = new Date('2026-08-18T10:00:00.000-04:00')
  const tuesdayEvents = generateConsolidatedRoutineActionEvents({
    routines: [mockLivSchoolRoutine, mockOwenSchoolRoutine, emmeWithOverrides],
    members: mockMembers,
    date: tuesday,
  })

  // On Tuesday morning: Emme is at 6:45-7:00 AM, Owen is at 7:45-8:00 AM, Liv is at 7:45-8:00 AM -> 3 drop-off cards!
  const emmeDrop = tuesdayEvents.find(e => e.title.includes('Drop off Emme @ Palm Beach'))
  assert.notEqual(emmeDrop, undefined)
  const emmeStart = new Date(emmeDrop.start_time)
  assert.equal(emmeStart.getHours(), 6)
  assert.equal(emmeStart.getMinutes(), 45)

  const owenDrop = tuesdayEvents.find(e => e.title.includes('Drop off Owen @ Palm Beach'))
  assert.notEqual(owenDrop, undefined)
  const owenStart = new Date(owenDrop.start_time)
  assert.equal(owenStart.getHours(), 7)
  assert.equal(owenStart.getMinutes(), 45)

  // Wednesday, Aug 19, 2026: Standard day -> Owen & Emme automatically merged into 1 card!
  const wednesday = new Date('2026-08-19T10:00:00.000-04:00')
  const wednesdayEvents = generateConsolidatedRoutineActionEvents({
    routines: [mockLivSchoolRoutine, mockOwenSchoolRoutine, emmeWithOverrides],
    members: mockMembers,
    date: wednesday,
  })
  const mergedDrop = wednesdayEvents.find(e => e.title.includes('Drop off') && e.title.includes('Palm Beach'))
  assert.equal(mergedDrop.title, 'Drop off Owen & Emme @ Palm Beach Public Elementary School')
})

test('FamilySettingsPage and useCalendarEvents project consolidated routine action events with day overrides', () => {
  const settingsContent = readFileSync(new URL('../src/pages/FamilySettingsPage.tsx', import.meta.url), 'utf8')
  assert.match(settingsContent, /Recurring Schedule & Routine/)
  assert.match(settingsContent, /School Year/)
  assert.match(settingsContent, /Summer Camp/)
  assert.match(settingsContent, /On Break/)
  assert.match(settingsContent, /Day-Specific Adjustments/)
  assert.match(settingsContent, /School Year Start \(Optional\)/)
  assert.match(settingsContent, /School Year End \(Optional\)/)

  const calendarEventsHook = readFileSync(new URL('../src/hooks/useCalendarEvents.ts', import.meta.url), 'utf8')
  assert.match(calendarEventsHook, /generateConsolidatedRoutineActionEvents/)
  assert.match(calendarEventsHook, /routineEventsInRange/)
  assert.match(calendarEventsHook, /newRoutineEvents/)
})
