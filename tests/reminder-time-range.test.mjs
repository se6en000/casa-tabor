import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeReminderTimeRange } from '../src/utils/reminderTimeRange.ts'

process.env.TZ = 'America/New_York'

test('normalizeReminderTimeRange preserves the stored positive duration when the reminder time changes', () => {
  assert.deepEqual(
    normalizeReminderTimeRange(
      '2026-08-10T09:30',
      '2026-08-07T13:00:00.000Z',
      '2026-08-07T13:15:00.000Z',
    ),
    {
      start: '2026-08-10T13:30:00.000Z',
      end: '2026-08-10T13:45:00.000Z',
    },
  )
})

test('normalizeReminderTimeRange supplies a one-minute storage duration for legacy point reminders', () => {
  assert.deepEqual(
    normalizeReminderTimeRange(
      '2026-08-10T09:30',
      '2026-08-07T13:00:00.000Z',
      '2026-08-07T13:00:00.000Z',
    ),
    {
      start: '2026-08-10T13:30:00.000Z',
      end: '2026-08-10T13:31:00.000Z',
    },
  )
})

test('normalizeReminderTimeRange rejects an invalid edited start instead of silently changing the reminder', () => {
  assert.throws(
    () => normalizeReminderTimeRange('', '2026-08-07T13:00:00.000Z', '2026-08-07T13:15:00.000Z'),
    /valid reminder date and time/i,
  )
})
