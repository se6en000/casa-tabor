import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getFirstOccurrenceDate,
  extractDesiredRoutineSeries,
} from '../src/lib/routineRecurrenceCoordinator.ts'

test('routineRecurrenceCoordinator: calculates exact first occurrence date for a given day of week from semester start', () => {
  // 2026-08-11 is a Tuesday (Day 2)
  assert.equal(getFirstOccurrenceDate('2026-08-11', 2), '2026-08-11') // Tuesday
  assert.equal(getFirstOccurrenceDate('2026-08-11', 3), '2026-08-12') // Wednesday
  assert.equal(getFirstOccurrenceDate('2026-08-11', 4), '2026-08-13') // Thursday
  assert.equal(getFirstOccurrenceDate('2026-08-11', 1), '2026-08-17') // Following Monday
  assert.equal(getFirstOccurrenceDate('2026-08-11', 5), '2026-08-14') // Friday
})

test('routineRecurrenceCoordinator: extracts desired recurring series with canonical RRULE strings for day overrides', () => {
  const routine = {
    memberId: 'member-emme',
    routineType: 'school',
    enabled: true,
    venueName: 'Palm Beach Public Elementary School',
    venueAddress: '239 Cocoanut Row, Palm Beach, FL, 33480',
    daysOfWeek: [1, 2, 3, 4, 5],
    startLocal: '08:00',
    endLocal: '14:00',
    startDate: '2026-08-11',
    endDate: '2027-05-28',
    dropoffDriverName: 'Jake',
    pickupDriverName: 'Giselle',
    syncMode: 'exceptions_only',
    dayOverrides: [
      {
        dayOfWeek: 2, // Tuesday
        startLocal: '07:00',
        dropoffDriverName: 'Jake',
        label: 'Early Beethoven Strings',
        enabled: true,
      },
      {
        dayOfWeek: 4, // Thursday
        endLocal: '15:00',
        pickupDriverName: 'Giselle',
        label: 'Late Strings Program',
        enabled: true,
      },
    ],
  }

  const series = extractDesiredRoutineSeries('member-emme', routine, [
    { id: 'member-emme', name: 'Emme', role: 'child' },
    { id: 'member-jake', name: 'Jake', role: 'parent' },
    { id: 'member-giselle', name: 'Giselle', role: 'parent' },
  ])

  assert.equal(series.length, 2)

  // Tuesday Morning Strings Dropoff
  const tue = series.find((s) => s.dayCode === 'TU')
  assert.ok(tue)
  assert.equal(tue.type, 'dropoff')
  assert.equal(tue.title, 'Drop off Emme @ Palm Beach Public Elementary School · Early Beethoven Strings')
  assert.equal(tue.startTimeLocal, '07:00')
  assert.equal(tue.endTimeLocal, '07:15')
  assert.equal(tue.rrule, 'RRULE:FREQ=WEEKLY;UNTIL=20270528T235959Z;BYDAY=TU')
  assert.equal(tue.driverMemberId, 'member-jake')

  // Thursday Afternoon Strings Pickup
  const thu = series.find((s) => s.dayCode === 'TH')
  assert.ok(thu)
  assert.equal(thu.type, 'pickup')
  assert.equal(thu.title, 'Pick up Emme @ Palm Beach Public Elementary School · Late Strings Program')
  assert.equal(thu.startTimeLocal, '15:00')
  assert.equal(thu.endTimeLocal, '15:15')
  assert.equal(thu.rrule, 'RRULE:FREQ=WEEKLY;UNTIL=20270528T235959Z;BYDAY=TH')
  assert.equal(thu.driverMemberId, 'member-giselle')
})

test('routineRecurrenceCoordinator: returns empty array when routine is disabled', () => {
  const disabledRoutine = {
    memberId: 'member-emme',
    routineType: 'school',
    enabled: false,
    venueName: 'Palm Beach Public',
    venueAddress: '239 Cocoanut Row',
    daysOfWeek: [1, 2, 3, 4, 5],
    startLocal: '08:00',
    endLocal: '14:00',
    dayOverrides: [
      {
        dayOfWeek: 2,
        startLocal: '07:00',
        label: 'Early Strings',
        enabled: true,
      },
    ],
  }

  assert.equal(extractDesiredRoutineSeries('member-emme', disabledRoutine).length, 0)
})
