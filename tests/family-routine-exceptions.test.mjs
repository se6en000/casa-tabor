import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deserializeRoutineFromAvailabilityRules,
  isRoutineDropoffException,
  isRoutinePickupException,
  getEstimatedDriveMinutes,
  applyTimeToDate,
  formatChildNames,
  createSchoolRoutine,
} from '../src/lib/familyRoutines.ts'

test('Family Routine Intelligence: correctly detects dropoff exception on Tuesday early strings', () => {
  const emmeId = 'emme-uuid'
  const routine = createSchoolRoutine(emmeId, 'Emme', 'Bak Middle School of the Arts')
  routine.dayOverrides = [
    {
      dayOfWeek: 2, // Tuesday
      startLocal: '07:00',
      endLocal: '15:30',
      dropoffDriverName: 'Jake',
      label: 'Early Strings Orchestra',
      enabled: true,
    },
  ]

  // Tuesday Aug 18, 2026
  const tuesday = new Date('2026-08-18T00:00:00')
  const isDropoffException = isRoutineDropoffException(routine, tuesday)
  assert.equal(isDropoffException, true, 'Tuesday dropoff should be flagged as an exception')

  // Wednesday Aug 19, 2026
  const wednesday = new Date('2026-08-19T00:00:00')
  const isWedDropoffException = isRoutineDropoffException(routine, wednesday)
  assert.equal(isWedDropoffException, false, 'Wednesday should not be an exception')
})

test('Family Routine Intelligence: departure calculation with override start time', () => {
  const targetDate = new Date('2026-08-18T00:00:00')
  const overrideStart = '07:00'
  const driveMinutes = getEstimatedDriveMinutes('Bak Middle School of the Arts', '')
  assert.equal(driveMinutes, 18, 'Drive time for Bak should be 18 minutes')

  const schoolStartTime = applyTimeToDate(targetDate, overrideStart)
  const windowStartTime = new Date(schoolStartTime.getTime() - 15 * 60000)
  const departureTime = new Date(windowStartTime.getTime() - driveMinutes * 60000)

  assert.equal(schoolStartTime.getHours(), 7)
  assert.equal(schoolStartTime.getMinutes(), 0)
  assert.equal(windowStartTime.getHours(), 6)
  assert.equal(windowStartTime.getMinutes(), 45)
  assert.equal(departureTime.getHours(), 6)
  assert.equal(departureTime.getMinutes(), 27)
})

test('Family Routine Intelligence: deserializeRoutineFromAvailabilityRules with dayOverrides', () => {
  const memberId = 'emme-123'
  const rules = [
    {
      id: 'rule-1',
      member_id: memberId,
      day_of_week: 2,
      start_local: '08:00',
      end_local: '15:30',
      availability_type: 'unavailable',
      reason: JSON.stringify({
        type: 'school_routine',
        title: 'School Routine',
        venueName: 'Bak Middle School of the Arts',
        venueAddress: '1725 Echo Lake Dr',
        dropoffDriverName: 'Jake',
        pickupDriverName: 'Kelly',
        dayOverrides: [
          {
            dayOfWeek: 2,
            startLocal: '07:00',
            endLocal: '15:30',
            dropoffDriverName: 'Jake',
            label: 'Beethoven Strings',
            enabled: true,
          },
        ],
        enabled: true,
      }),
      timezone: 'America/New_York',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]

  const deserialized = deserializeRoutineFromAvailabilityRules(memberId, rules)
  assert.ok(deserialized, 'Routine should deserialize')
  assert.equal(deserialized.dayOverrides?.length, 1)
  assert.equal(deserialized.dayOverrides[0].label, 'Beethoven Strings')
  assert.equal(deserialized.dayOverrides[0].startLocal, '07:00')
})
