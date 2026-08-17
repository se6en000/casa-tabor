import test from 'node:test'
import assert from 'node:assert/strict'

import { formatDurationLabel, isReminderOrChore, pickActiveHeroEvent, resolveRestingIndex } from '../src/lib/heroFocus.mjs'

test('formatDurationLabel renders human-friendly windows', () => {
  assert.equal(formatDurationLabel(0), '0 min')
  assert.equal(formatDurationLabel(45), '45 min')
  assert.equal(formatDurationLabel(60), '1 hr')
  assert.equal(formatDurationLabel(120), '2 hrs')
  assert.equal(formatDurationLabel(90), '1.5 hrs')
  assert.equal(formatDurationLabel(210), '3.5 hrs')
  assert.equal(formatDurationLabel(130), '2h 10m')
  assert.equal(formatDurationLabel(-5), '0 min')
})

test('isReminderOrChore identifies chores, reminders, tasks, and medications', () => {
  assert.equal(isReminderOrChore({ event_type: 'reminder', title: 'Feed Dogs' }), true)
  assert.equal(isReminderOrChore({ title: 'Take out the trash' }), true)
  assert.equal(isReminderOrChore({ title: 'Run dishwasher' }), true)
  assert.equal(isReminderOrChore({ title: 'Morning Meds / Pills', category: 'routine' }), true)
  assert.equal(isReminderOrChore({ title: 'Soccer Practice', category: 'sports' }), false)
  assert.equal(isReminderOrChore({ title: 'Dentist Appointment', location_name: 'Main St Dental' }), false)
  assert.equal(isReminderOrChore({ title: 'Dr Hanna', category: 'medical' }), false)
  assert.equal(isReminderOrChore({ title: 'Dr. Smith Checkup' }), false)
})

const iso = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi, 0).toISOString()

test('pickActiveHeroEvent returns the in-progress event (the disappearing-act fix)', () => {
  const now = new Date(2026, 6, 9, 15, 30) // 3:30 PM
  const events = [
    { title: 'Care', start_time: iso(2026, 6, 9, 14, 30), end_time: iso(2026, 6, 9, 18, 0) }, // in progress
    { title: 'Dinner', start_time: iso(2026, 6, 9, 18, 30), end_time: iso(2026, 6, 9, 19, 30) }, // later
  ]
  assert.equal(pickActiveHeroEvent(events, now)?.title, 'Care')
})

test('pickActiveHeroEvent ignores all-day events, chores, and reminders', () => {
  const now = new Date(2026, 6, 9, 15, 30)
  const events = [
    { title: 'Birthday', start_time: iso(2026, 6, 9, 0, 0), end_time: iso(2026, 6, 10, 0, 0), all_day: true },
    { title: 'Take out trash', start_time: iso(2026, 6, 9, 15, 0), end_time: iso(2026, 6, 9, 16, 0) },
    { title: 'Dishwasher', start_time: iso(2026, 6, 9, 15, 0), end_time: iso(2026, 6, 9, 16, 0), event_type: 'reminder' },
  ]
  assert.equal(pickActiveHeroEvent(events, now), null)
})

test('pickActiveHeroEvent prefers the event ending soonest when overlapping', () => {
  const now = new Date(2026, 6, 9, 15, 30)
  const events = [
    { title: 'Long block', start_time: iso(2026, 6, 9, 14, 0), end_time: iso(2026, 6, 9, 19, 0) },
    { title: 'Short block', start_time: iso(2026, 6, 9, 15, 0), end_time: iso(2026, 6, 9, 16, 0) },
  ]
  assert.equal(pickActiveHeroEvent(events, now)?.title, 'Short block')
})

test('pickActiveHeroEvent returns null when nothing is active', () => {
  const now = new Date(2026, 6, 9, 12, 0)
  const events = [
    { title: 'Later', start_time: iso(2026, 6, 9, 14, 0), end_time: iso(2026, 6, 9, 15, 0) },
  ]
  assert.equal(pickActiveHeroEvent(events, now), null)
})

test('resolveRestingIndex prefers the in-progress event as the carousel snap-back target', () => {
  const slides = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.equal(resolveRestingIndex(slides, 'b', 'c'), 1)
})

test('resolveRestingIndex falls back to next-upcoming when nothing is in progress', () => {
  const slides = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.equal(resolveRestingIndex(slides, null, 'c'), 2)
})

test('resolveRestingIndex returns 0 when neither active nor next match', () => {
  const slides = [{ id: 'a' }, { id: 'b' }]
  assert.equal(resolveRestingIndex(slides, 'zzz', 'yyy'), 0)
  assert.equal(resolveRestingIndex([], 'a', 'b'), 0)
})
