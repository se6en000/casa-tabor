import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SNOOZE_DURATIONS,
  computeSnoozeUntil,
  formatSnoozeHistoryLabel,
  snoozeDurationLabel,
} from '../src/utils/snoozeDuration.ts'

test('computeSnoozeUntil adds 15 minutes for the "15m" duration', () => {
  const now = new Date('2026-08-07T09:00:00.000Z')
  assert.equal(computeSnoozeUntil('15m', now).toISOString(), '2026-08-07T09:15:00.000Z')
})

test('computeSnoozeUntil adds 1 hour for the "1h" duration', () => {
  const now = new Date('2026-08-07T09:00:00.000Z')
  assert.equal(computeSnoozeUntil('1h', now).toISOString(), '2026-08-07T10:00:00.000Z')
})

test('computeSnoozeUntil adds 3 hours for the "3h" duration', () => {
  const now = new Date('2026-08-07T09:00:00.000Z')
  assert.equal(computeSnoozeUntil('3h', now).toISOString(), '2026-08-07T12:00:00.000Z')
})

test('computeSnoozeUntil supports a literal one-day snooze', () => {
  const now = new Date('2026-08-07T12:00:00.000Z')
  assert.equal(computeSnoozeUntil('1d', now).toISOString(), '2026-08-08T12:00:00.000Z')
  assert.equal(snoozeDurationLabel('1d'), '1 day')
})

test('computeSnoozeUntil jumps to 6am the next day for the "tomorrow" duration', () => {
  const now = new Date('2026-08-07T21:30:00.000-04:00')
  const result = computeSnoozeUntil('tomorrow', now)
  assert.equal(result.getDate(), 8)
  assert.equal(result.getHours(), 6)
  assert.equal(result.getMinutes(), 0)
})

test('computeSnoozeUntil can place a snooze two days before the event', () => {
  const now = new Date('2026-08-07T09:00:00.000Z')
  const eventDate = '2026-08-11T15:30:00.000Z'
  assert.equal(computeSnoozeUntil('2d-before', now, eventDate).toISOString(), '2026-08-09T15:30:00.000Z')
})

test('SNOOZE_DURATIONS lists every duration option in display order', () => {
  assert.deepEqual(SNOOZE_DURATIONS, ['15m', '1h', '1d'])
})

test('snoozeDurationLabel gives a plain-language label for each duration', () => {
  assert.equal(snoozeDurationLabel('15m'), '15 minutes')
  assert.equal(snoozeDurationLabel('1h'), '1 hour')
  assert.equal(snoozeDurationLabel('3h'), '3 hours')
  assert.equal(snoozeDurationLabel('tomorrow'), 'Tomorrow morning')
  assert.equal(snoozeDurationLabel('2d-before'), '2 days before due date')
})

test('formatSnoozeHistoryLabel returns null when an item has never been snoozed', () => {
  assert.equal(formatSnoozeHistoryLabel(0, null, new Date()), null)
})

test('formatSnoozeHistoryLabel reports a single snooze in the last few minutes', () => {
  const now = new Date('2026-08-07T09:30:00.000Z')
  const lastSnoozedAt = '2026-08-07T09:20:00.000Z'
  assert.equal(formatSnoozeHistoryLabel(1, lastSnoozedAt, now), 'Snoozed once · 10m ago')
})

test('formatSnoozeHistoryLabel pluralizes and reports elapsed hours for repeat snoozes', () => {
  const now = new Date('2026-08-07T12:00:00.000Z')
  const lastSnoozedAt = '2026-08-07T09:00:00.000Z'
  assert.equal(formatSnoozeHistoryLabel(3, lastSnoozedAt, now), 'Snoozed 3× · 3h ago')
})
