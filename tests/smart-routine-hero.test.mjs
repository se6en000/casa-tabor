import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveDayTypeForDate } from '../src/lib/familyRoutines.ts'

const mockEmmeRoutine = {
  memberId: 'child-emme-id',
  title: 'School Routine',
  routineType: 'school',
  venueName: 'Palm Beach Public Elementary School',
  venueAddress: '239 Cocoanut Row, Palm Beach, FL 33480',
  daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: '08:00',
  endLocal: '14:00',
  dropoffDriverName: 'Jake',
  pickupDriverName: 'Giselle',
  enabled: true,
}

const mockLivRoutine = {
  memberId: 'child-liv-id',
  title: 'School Routine',
  routineType: 'school',
  venueName: 'Bak Middle School of the Arts',
  venueAddress: '1725 Echo Lake Dr, West Palm Beach, FL',
  daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: '08:00',
  endLocal: '15:30',
  dropoffDriverName: 'Kelly',
  pickupDriverName: 'Giselle',
  enabled: true,
}

const mockRoutines = [mockEmmeRoutine, mockLivRoutine]

test('resolveDayTypeForDate identifies Saturday and Sunday as weekend', () => {
  const saturday = new Date('2026-08-22T10:00:00.000-04:00') // Sat
  const sunday = new Date('2026-08-23T10:00:00.000-04:00') // Sun

  assert.equal(resolveDayTypeForDate(saturday, mockRoutines, []), 'weekend')
  assert.equal(resolveDayTypeForDate(sunday, mockRoutines, []), 'weekend')
})

test('resolveDayTypeForDate identifies Mon-Fri with school routines as school_day', () => {
  const friday = new Date('2026-08-21T10:00:00.000-04:00') // Fri
  const monday = new Date('2026-08-24T10:00:00.000-04:00') // Mon

  assert.equal(resolveDayTypeForDate(friday, mockRoutines, []), 'school_day')
  assert.equal(resolveDayTypeForDate(monday, mockRoutines, []), 'school_day')
})

test('resolveDayTypeForDate identifies weekday with day_off exceptions as holiday_break', () => {
  const laborDayMonday = new Date('2026-09-07T10:00:00.000-04:00')
  const exceptions = [
    {
      id: 'ex-1',
      member_id: 'child-emme-id',
      start_at: '2026-09-07T00:00:00.000Z',
      end_at: '2026-09-07T23:59:59.000Z',
      override_type: 'day_off',
    },
    {
      id: 'ex-2',
      member_id: 'child-liv-id',
      start_at: '2026-09-07T00:00:00.000Z',
      end_at: '2026-09-07T23:59:59.000Z',
      override_type: 'day_off',
    },
  ]

  assert.equal(resolveDayTypeForDate(laborDayMonday, mockRoutines, exceptions), 'holiday_break')
})
