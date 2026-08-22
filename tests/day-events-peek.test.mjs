import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateDayScheduleWithProposedSlot,
  detectTimeSlotConflict,
} from '../src/utils/daySchedulePeek.ts'

test('detectTimeSlotConflict identifies overlapping events accurately', () => {
  // Proposed: 8:30 AM - 10:30 AM
  const proposedStart = '2026-09-15T08:30:00-04:00'
  const proposedEnd = '2026-09-15T10:30:00-04:00'

  // Overlapping event: 9:00 AM - 10:00 AM
  const overlapEvent = {
    id: 'evt-1',
    title: 'Pediatrician Appointment',
    start_time: '2026-09-15T09:00:00-04:00',
    end_time: '2026-09-15T10:00:00-04:00',
  }
  assert.equal(detectTimeSlotConflict(proposedStart, proposedEnd, overlapEvent), true)

  // Non-overlapping event: 7:00 AM - 8:00 AM
  const earlierEvent = {
    id: 'evt-2',
    title: 'Morning Drop-off',
    start_time: '2026-09-15T07:00:00-04:00',
    end_time: '2026-09-15T08:00:00-04:00',
  }
  assert.equal(detectTimeSlotConflict(proposedStart, proposedEnd, earlierEvent), false)

  // Non-overlapping event: 11:00 AM - 12:00 PM
  const laterEvent = {
    id: 'evt-3',
    title: 'Lunch Meeting',
    start_time: '2026-09-15T11:00:00-04:00',
    end_time: '2026-09-15T12:00:00-04:00',
  }
  assert.equal(detectTimeSlotConflict(proposedStart, proposedEnd, laterEvent), false)
})

test('evaluateDayScheduleWithProposedSlot orders existing events with proposed slot and evaluates conflict status', () => {
  const existingEvents = [
    {
      id: 'evt-dropoff',
      title: 'Owen Morning Drop-off',
      start_time: '2026-09-15T07:45:00-04:00',
      end_time: '2026-09-15T08:15:00-04:00',
      all_day: false,
    },
    {
      id: 'evt-dentist',
      title: 'Dental Cleaning',
      start_time: '2026-09-15T13:30:00-04:00',
      end_time: '2026-09-15T14:30:00-04:00',
      all_day: false,
    },
  ]

  const proposedAction = {
    id: 'act_test_reading',
    title: 'FAST ELA Reading Assessment (Liv · 4th Grade)',
    startTime: '2026-09-15T08:30:00-04:00',
    endTime: '2026-09-15T10:30:00-04:00',
    date: '2026-09-15',
  }

  const result = evaluateDayScheduleWithProposedSlot(existingEvents, proposedAction)
  assert.equal(result.hasConflict, false)
  assert.equal(result.conflictingEvents.length, 0)
  assert.equal(result.timelineItems.length, 3)

  // Verify chronological order: Drop-off (7:45), Proposed (8:30), Dentist (1:30)
  assert.equal(result.timelineItems[0].isProposed, false)
  assert.equal(result.timelineItems[0].title, 'Owen Morning Drop-off')

  assert.equal(result.timelineItems[1].isProposed, true)
  assert.equal(result.timelineItems[1].title, 'FAST ELA Reading Assessment (Liv · 4th Grade)')

  assert.equal(result.timelineItems[2].isProposed, false)
  assert.equal(result.timelineItems[2].title, 'Dental Cleaning')
})

test('evaluateDayScheduleWithProposedSlot handles completely clear days', () => {
  const existingEvents = []
  const proposedAction = {
    id: 'act_test_math',
    title: 'FAST Math Assessment',
    startTime: '2026-09-22T08:30:00-04:00',
    endTime: '2026-09-22T10:30:00-04:00',
    date: '2026-09-22',
  }

  const result = evaluateDayScheduleWithProposedSlot(existingEvents, proposedAction)
  assert.equal(result.hasConflict, false)
  assert.equal(result.existingEventsCount, 0)
  assert.equal(result.isDayCompletelyClear, true)
  assert.equal(result.timelineItems.length, 1)
  assert.equal(result.timelineItems[0].isProposed, true)
})

test('evaluateDayScheduleWithProposedSlot excludes family daily routines and chores to keep schedule peek clear', () => {
  const existingEvents = [
    {
      id: 'evt-morning-routine',
      title: 'Morning Routine & Brush Teeth',
      start_time: '2026-09-15T06:30:00-04:00',
      end_time: '2026-09-15T07:15:00-04:00',
      category: 'routine',
      all_day: false,
    },
    {
      id: 'evt-doctor',
      title: 'Dr. Martinez Pediatric Checkup',
      start_time: '2026-09-15T11:00:00-04:00',
      end_time: '2026-09-15T12:00:00-04:00',
      category: 'medical',
      all_day: false,
    },
    {
      id: 'evt-bedtime-routine',
      title: 'Bedtime Routine & Wind Down',
      start_time: '2026-09-15T20:00:00-04:00',
      end_time: '2026-09-15T20:45:00-04:00',
      all_day: false,
    },
  ]

  const proposedAction = {
    id: 'act_test_reading',
    title: 'FAST ELA Reading Assessment (Liv · 4th Grade)',
    startTime: '2026-09-15T08:30:00-04:00',
    endTime: '2026-09-15T10:30:00-04:00',
    date: '2026-09-15',
  }

  const result = evaluateDayScheduleWithProposedSlot(existingEvents, proposedAction)
  // Only Dr. Martinez and the Proposed Action should be present (2 total). Routines excluded!
  assert.equal(result.existingEventsCount, 1)
  assert.equal(result.timelineItems.length, 2)
  assert.equal(result.timelineItems[0].title, 'FAST ELA Reading Assessment (Liv · 4th Grade)')
  assert.equal(result.timelineItems[1].title, 'Dr. Martinez Pediatric Checkup')
})

test('evaluateDayScheduleWithProposedSlot preserves ADD Script and Early Strings appointments and detects conflicts', () => {
  const existingEvents = [
    {
      id: 'evt-strings-emme',
      title: 'Emme - Strings @ PBP',
      start_time: '2026-09-15T07:00:00-04:00',
      end_time: '2026-09-15T08:00:00-04:00',
      all_day: false,
    },
    {
      id: 'evt-dropoff-owen',
      title: 'Drop off Owen @ Palm Beach Public Elementary School',
      start_time: '2026-09-15T07:45:00-04:00',
      end_time: '2026-09-15T08:00:00-04:00',
      all_day: false,
    },
    {
      id: 'evt-add-script',
      title: 'Call in ADD Script',
      start_time: '2026-09-15T09:00:00-04:00',
      end_time: '2026-09-15T10:00:00-04:00',
      google_event_id: 'uo6o3nrjc8qb8ai6976fd2jltg',
      location_name: 'Walgrevy',
      all_day: false,
    },
    {
      id: 'evt-pickup-owen',
      title: 'Pick up Owen @ Palm Beach Public Elementary School',
      start_time: '2026-09-15T14:45:00-04:00',
      end_time: '2026-09-15T15:00:00-04:00',
      all_day: false,
    },
  ]

  const proposedAction = {
    id: 'act_test_reading',
    title: 'FAST ELA Reading Assessment (Liv · 4th Grade)',
    startTime: '2026-09-15T08:30:00-04:00',
    endTime: '2026-09-15T10:30:00-04:00',
    date: '2026-09-15',
  }

  const result = evaluateDayScheduleWithProposedSlot(existingEvents, proposedAction)
  // Both Emme Strings and Call in ADD Script are preserved; generic Owen dropoff/pickup are filtered.
  assert.equal(result.existingEventsCount, 2)
  // Call in ADD Script (9:00 - 10:00 AM) overlaps with proposed 8:30 - 10:30 AM!
  assert.equal(result.hasConflict, true)
  assert.equal(result.conflictingEvents.length, 1)
  assert.equal(result.conflictingEvents[0].title, 'Call in ADD Script')
})
