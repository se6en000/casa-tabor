import assert from 'node:assert/strict'
import test from 'node:test'

import { computeReminderSnoozeWindow } from '../src/utils/reminderSnooze.ts'

test('computeReminderSnoozeWindow preserves the original event duration for a 1h snooze', () => {
  const now = new Date('2026-08-07T09:00:00.000Z')
  const result = computeReminderSnoozeWindow('2026-08-07T08:00:00.000Z', '2026-08-07T08:30:00.000Z', '1h', now)
  assert.equal(result.start, '2026-08-07T10:00:00.000Z')
  assert.equal(result.end, '2026-08-07T10:30:00.000Z')
})

test('computeReminderSnoozeWindow supports 15m and 3h durations', () => {
  const now = new Date('2026-08-07T09:00:00.000Z')
  const fifteen = computeReminderSnoozeWindow('2026-08-07T08:00:00.000Z', '2026-08-07T08:30:00.000Z', '15m', now)
  assert.equal(fifteen.start, '2026-08-07T09:15:00.000Z')

  const three = computeReminderSnoozeWindow('2026-08-07T08:00:00.000Z', '2026-08-07T08:30:00.000Z', '3h', now)
  assert.equal(three.start, '2026-08-07T12:00:00.000Z')
})

test('computeReminderSnoozeWindow jumps to 6am the next day for "tomorrow", preserving duration', () => {
  const now = new Date('2026-08-07T09:00:00.000Z')
  const result = computeReminderSnoozeWindow('2026-08-07T08:00:00.000Z', '2026-08-07T08:30:00.000Z', 'tomorrow', now)
  const start = new Date(result.start)
  assert.equal(start.getHours(), 6)
  assert.equal(start.getMinutes(), 0)
  assert.equal(new Date(result.end).getTime() - start.getTime(), 30 * 60 * 1000)
})

test('computeReminderSnoozeWindow never snoozes to a moment before now, even for a long-past reminder', () => {
  const now = new Date('2026-08-07T09:00:00.000Z')
  // Original reminder was hours in the past -- snoozing should anchor off "now", not the stale start.
  const result = computeReminderSnoozeWindow('2026-08-05T08:00:00.000Z', '2026-08-05T08:30:00.000Z', '1h', now)
  assert.equal(result.start, '2026-08-07T10:00:00.000Z')
})

test('computeReminderSnoozeWindow enforces a 5 minute minimum duration for zero-length reminders', () => {
  const now = new Date('2026-08-07T09:00:00.000Z')
  const result = computeReminderSnoozeWindow('2026-08-07T08:00:00.000Z', '2026-08-07T08:00:00.000Z', '15m', now)
  assert.equal(result.start, '2026-08-07T09:15:00.000Z')
  assert.equal(result.end, '2026-08-07T09:20:00.000Z')
})
