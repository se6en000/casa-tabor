import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import {
  isEventAtHome,
  isEventRequiringDriving,
  analyzeDriverSchedule,
} from '../src/lib/driverConflictEngine.ts'
import {
  resolveCanonicalDeparture,
  estimateVenueDriveMinutes,
} from '../src/lib/canonicalEventDeparture.ts'

const familyMembers = [
  { id: 'jake-id', name: 'Jake', role: 'parent', can_drive: true, color_hex: '#1e3a8a' },
  { id: 'kelly-id', name: 'Kelly', role: 'parent', can_drive: true, color_hex: '#b45309' },
  { id: 'giselle-id', name: 'Giselle', role: 'caregiver', can_drive: true, color_hex: '#7c3aed' },
  { id: 'emme-id', name: 'Emme', role: 'child', can_drive: false, color_hex: '#db2777' },
  { id: 'liv-id', name: 'Liv', role: 'child', can_drive: false, color_hex: '#2563eb' },
]

test('isEventAtHome accurately detects home locations and no-drive overrides', () => {
  assert.equal(isEventAtHome({ location_name: 'Home', address: '' }), true)
  assert.equal(isEventAtHome({ location_name: 'At Home', address: '' }), true)
  assert.equal(isEventAtHome({ location_name: 'Home (No Drive)', address: '' }), true)
  assert.equal(isEventAtHome({ location_name: 'Home Studio', address: '3209 Washington Road' }), true)
  assert.equal(isEventAtHome({ location_name: '', address: '3209 Washington Road, West Palm Beach, FL' }), true)
  assert.equal(isEventAtHome({
    location_name: 'Violin Lesson',
    address: '',
    plan_override: { transportation_plan: { version: 1, legs: [] } },
  }), true)
  assert.equal(isEventAtHome({
    location_name: 'Bak Middle School of the Arts',
    address: '1725 Echo Lake Dr',
  }), false)
})

test('isEventRequiringDriving returns false for at-home events even with assigned driver member', () => {
  const atHomeEventWithDriver = {
    id: 'evt-violin',
    title: 'Emme Practice Violin with Meredith',
    start_time: '2026-08-21T16:30:00.000Z',
    end_time: '2026-08-21T17:30:00.000Z',
    all_day: false,
    location_name: 'Home',
    address: '',
    members: [
      { id: 'mem-1', role: 'driver', family_member: { id: 'jake-id', name: 'Jake', can_drive: true } },
      { id: 'mem-2', role: 'primary', family_member: { id: 'emme-id', name: 'Emme', can_drive: false } },
    ],
  }

  assert.equal(isEventAtHome(atHomeEventWithDriver), true)
  assert.equal(isEventRequiringDriving(atHomeEventWithDriver), false)
})

test('analyzeDriverSchedule does NOT produce a false conflict when violin practice is set at home', () => {
  const events = [
    {
      id: 'evt-checkup',
      title: "Liv's Well Child Checkup",
      start_time: '2026-08-21T15:40:00.000Z',
      end_time: '2026-08-21T16:40:00.000Z',
      all_day: false,
      location_name: 'Home',
      address: '',
      members: [
        { id: 'm-1', role: 'driver', family_member: { id: 'jake-id', name: 'Jake', can_drive: true } },
        { id: 'm-2', role: 'primary', family_member: { id: 'liv-id', name: 'Liv', can_drive: false } },
      ],
    },
    {
      id: 'evt-violin',
      title: 'Emme Practice Violin with Meredith',
      start_time: '2026-08-21T16:30:00.000Z',
      end_time: '2026-08-21T17:30:00.000Z',
      all_day: false,
      location_name: 'Home',
      address: '',
      members: [
        { id: 'm-3', role: 'driver', family_member: { id: 'jake-id', name: 'Jake', can_drive: true } },
        { id: 'm-4', role: 'primary', family_member: { id: 'emme-id', name: 'Emme', can_drive: false } },
      ],
    },
  ]

  const analysis = analyzeDriverSchedule(events, familyMembers)
  assert.equal(analysis.hasConflict, false, 'At-home events should not create driver conflicts')
  assert.equal(analysis.conflicts.length, 0)
})

test('analyzeDriverSchedule ignores overlap between at-home doc appointment and violin lesson', () => {
  const events = [
    {
      id: 'evt-doc-pga',
      title: "Liv's Doc Apt P.A. PGA",
      start_time: '2026-08-21T15:40:00.000Z',
      end_time: '2026-08-21T16:40:00.000Z',
      all_day: false,
      location_name: 'Home',
      address: '4200 PGA Blvd, Palm Beach Gardens, FL',
      members: [
        { id: 'm-1', role: 'driver', family_member: { id: 'jake-id', name: 'Jake', can_drive: true } },
      ],
    },
    {
      id: 'evt-violin',
      title: 'Emme Practice Violin with Meredith',
      start_time: '2026-08-21T16:30:00.000Z',
      end_time: '2026-08-21T17:30:00.000Z',
      all_day: false,
      location_name: '',
      address: '',
      members: [
        { id: 'm-2', role: 'driver', family_member: { id: 'jake-id', name: 'Jake', can_drive: true } },
      ],
    },
  ]

  const analysis = analyzeDriverSchedule(events, familyMembers)
  assert.equal(analysis.hasConflict, false, 'At-home events should not create driver transit crunches even when overlapping')
  assert.equal(analysis.conflicts.length, 0)
})

test('estimateVenueDriveMinutes standardizes Bak Middle School to 20 minutes and PBP to 10 minutes', () => {
  assert.equal(estimateVenueDriveMinutes('Bak Middle School of the Arts', '1725 Echo Lake Dr'), 20)
  assert.equal(estimateVenueDriveMinutes('Bak', ''), 20)
  assert.equal(estimateVenueDriveMinutes('Palm Beach Public Elementary School', '239 Cocoanut Row'), 10)
  assert.equal(estimateVenueDriveMinutes('Home', '3209 Washington Rd'), 0)
})

test('resolveCanonicalDeparture computes accurate 1:40 PM departure for 2:00 PM Bak pickup', () => {
  const bakEvent = {
    id: 'evt-bak-pickup',
    title: 'Pick up Liv',
    start_time: '2026-08-21T14:00:00.000-04:00',
    end_time: '2026-08-21T15:00:00.000-04:00',
    all_day: false,
    location_name: 'Bak Middle School of the Arts',
    address: '1725 Echo Lake Dr, West Palm Beach, FL',
    enrichment: {
      drive_time_mins: 20,
    },
  }

  const result = resolveCanonicalDeparture(bakEvent, {
    now: new Date('2026-08-21T10:42:00.000-04:00'),
    defaultBufferMinutes: 0,
  })

  assert.equal(result.isDriving, true)
  assert.equal(result.isAtHome, false)
  assert.equal(result.driveMinutes, 20)
  assert.equal(result.formattedLeaveBy, '1:40 PM')
  assert.equal(result.formattedArriveBy, '2:00 PM')
})

test('EVENT_DETAIL_SELECT includes transportation_plan and EVENT_SUMMARY_SELECT includes overrides', () => {
  const content = readFileSync(new URL('../src/hooks/useCalendarEvents.ts', import.meta.url), 'utf8')
  const detailMatch = content.match(/const EVENT_DETAIL_SELECT = `([\s\S]*?)`/)
  assert.ok(detailMatch, 'Expected EVENT_DETAIL_SELECT constant')
  assert.match(detailMatch[1], /transportation_plan/, 'EVENT_DETAIL_SELECT must include transportation_plan')

  const summaryMatch = content.match(/const EVENT_SUMMARY_SELECT = `([\s\S]*?)`/)
  assert.ok(summaryMatch, 'Expected EVENT_SUMMARY_SELECT constant')
  assert.match(summaryMatch[1], /mode_override/, 'EVENT_SUMMARY_SELECT must include mode_override')
  assert.match(summaryMatch[1], /driver_overrides/, 'EVENT_SUMMARY_SELECT must include driver_overrides')
})
