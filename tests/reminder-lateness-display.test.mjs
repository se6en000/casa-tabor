import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildReminderPrepDescription,
  formatMissedReminderLateness,
  getPrepItemDisplayDescription,
} from '../src/utils/reminderLateness.ts'

test('formatMissedReminderLateness formats minutes late for a recent miss', () => {
  const eventStart = new Date('2026-08-07T09:00:00.000Z')
  const now = new Date('2026-08-07T09:10:00.000Z')
  assert.equal(formatMissedReminderLateness(eventStart, now), '10m late')
})

test('formatMissedReminderLateness formats hours late once past 60 minutes', () => {
  const eventStart = new Date('2026-08-07T09:00:00.000Z')
  const now = new Date('2026-08-07T12:30:00.000Z')
  assert.equal(formatMissedReminderLateness(eventStart, now), '3h late')
})

test('formatMissedReminderLateness formats days late once past 24 hours', () => {
  const eventStart = new Date('2026-08-05T09:00:00.000Z')
  const now = new Date('2026-08-07T09:00:00.000Z')
  assert.equal(formatMissedReminderLateness(eventStart, now), '2d late')
})

test('formatMissedReminderLateness never reports negative lateness for a future/edge time', () => {
  const eventStart = new Date('2026-08-07T09:00:00.000Z')
  const now = new Date('2026-08-07T08:59:00.000Z')
  assert.equal(formatMissedReminderLateness(eventStart, now), '0m late')
})

test('getPrepItemDisplayDescription recomputes live lateness instead of the frozen stored value', () => {
  const staleDescription = 'Missed reminder (10m late): Owen Needs a Teeth Cleaning'
  const eventDate = '2026-08-05T09:00:00.000Z'
  const now = new Date('2026-08-07T09:00:00.000Z')
  assert.equal(
    getPrepItemDisplayDescription(staleDescription, 'reminder_missed', eventDate, now),
    'Missed reminder (2d late): Owen Needs a Teeth Cleaning',
  )
})

test('getPrepItemDisplayDescription strips a stale bare "Missed reminder:" prefix too', () => {
  const staleDescription = 'Missed reminder: Owen Needs a Teeth Cleaning'
  const eventDate = '2026-08-05T09:00:00.000Z'
  const now = new Date('2026-08-07T09:00:00.000Z')
  assert.equal(
    getPrepItemDisplayDescription(staleDescription, 'reminder_missed', eventDate, now),
    'Missed reminder (2d late): Owen Needs a Teeth Cleaning',
  )
})

test('getPrepItemDisplayDescription leaves non-missed-reminder items untouched', () => {
  const description = 'Buy a gift for Dad'
  assert.equal(
    getPrepItemDisplayDescription(description, 'calendar_ai', '2026-08-07T09:00:00.000Z', new Date()),
    description,
  )
})

test('getPrepItemDisplayDescription falls back to the raw description when event_date is missing', () => {
  const description = 'Missed reminder (10m late): Owen Needs a Teeth Cleaning'
  assert.equal(
    getPrepItemDisplayDescription(description, 'reminder_missed', null, new Date()),
    description,
  )
})

test('buildReminderPrepDescription stores a stable description with no frozen lateness number', () => {
  assert.equal(
    buildReminderPrepDescription('Owen Needs a Teeth Cleaning', 'reminder_missed'),
    'Missed reminder: Owen Needs a Teeth Cleaning',
  )
})
