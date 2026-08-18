import assert from 'node:assert/strict'
import test from 'node:test'

import {
  eventOverlapsDay,
  eventOverlapsRange,
  getEventDisplayEnd,
  getEventDisplayStartDay,
  getEventEndDate,
  getEventStartDate,
  isEventMultiDay,
  parseDatePortionAsLocal,
} from '../src/utils/eventTime.ts'
import { isAllDayReminder } from '../src/utils/holidays.ts'

// Emulate user timezone: America/New_York (EDT, UTC-4)
process.env.TZ = 'America/New_York'

test('all-day event stored as UTC midnight (e.g. 2026-08-19T00:00:00+00:00) strictly maps to 8/19', () => {
  const event = {
    start_time: '2026-08-19T00:00:00+00:00',
    end_time: '2026-08-19T23:59:59.999+00:00',
    all_day: true,
  }

  const start = getEventStartDate(event)
  const end = getEventEndDate(event)

  assert.equal(start.getFullYear(), 2026)
  assert.equal(start.getMonth(), 7) // August (0-indexed 7)
  assert.equal(start.getDate(), 19)
  assert.equal(start.getHours(), 0)

  assert.equal(end.getFullYear(), 2026)
  assert.equal(end.getMonth(), 7)
  assert.equal(end.getDate(), 19)
  assert.equal(end.getHours(), 23)
  assert.equal(end.getMinutes(), 59)

  assert.equal(isEventMultiDay(event), false)

  const tue18 = new Date(2026, 7, 18, 0, 0, 0, 0)
  const wed19 = new Date(2026, 7, 19, 0, 0, 0, 0)
  const thu20 = new Date(2026, 7, 20, 0, 0, 0, 0)

  // Must NOT appear on Tue 8/18
  assert.equal(eventOverlapsDay(event, tue18), false)
  // Must appear on Wed 8/19
  assert.equal(eventOverlapsDay(event, wed19), true)
  // Must NOT appear on Thu 8/20
  assert.equal(eventOverlapsDay(event, thu20), false)
})

test('all-day event stored for 8/18 (e.g. Show and Tell) strictly maps to 8/18', () => {
  const event = {
    start_time: '2026-08-18T00:00:00+00:00',
    end_time: '2026-08-18T23:59:59+00:00',
    all_day: true,
  }

  const mon17 = new Date(2026, 7, 17, 0, 0, 0, 0)
  const tue18 = new Date(2026, 7, 18, 0, 0, 0, 0)
  const wed19 = new Date(2026, 7, 19, 0, 0, 0, 0)

  assert.equal(eventOverlapsDay(event, mon17), false)
  assert.equal(eventOverlapsDay(event, tue18), true)
  assert.equal(eventOverlapsDay(event, wed19), false)
  assert.equal(isEventMultiDay(event), false)
})

test('all-day event with exclusive midnight next-day end (Google Calendar convention) is single day', () => {
  const event = {
    start_time: '2026-08-19T00:00:00+00:00',
    end_time: '2026-08-20T00:00:00+00:00',
    all_day: true,
  }

  assert.equal(isEventMultiDay(event), false)
  assert.equal(eventOverlapsDay(event, new Date(2026, 7, 18)), false)
  assert.equal(eventOverlapsDay(event, new Date(2026, 7, 19)), true)
  assert.equal(eventOverlapsDay(event, new Date(2026, 7, 20)), false)
})

test('multi-day all-day event (e.g. 8/20 to 8/25) overlaps all days in range and identifies as multi-day', () => {
  const event = {
    start_time: '2026-08-20T00:00:00+00:00',
    end_time: '2026-08-25T23:59:59+00:00',
    all_day: true,
  }

  assert.equal(isEventMultiDay(event), true)
  assert.equal(eventOverlapsDay(event, new Date(2026, 7, 19)), false)
  assert.equal(eventOverlapsDay(event, new Date(2026, 7, 20)), true)
  assert.equal(eventOverlapsDay(event, new Date(2026, 7, 21)), true)
  assert.equal(eventOverlapsDay(event, new Date(2026, 7, 22)), true)
  assert.equal(eventOverlapsDay(event, new Date(2026, 7, 23)), true)
  assert.equal(eventOverlapsDay(event, new Date(2026, 7, 24)), true)
  assert.equal(eventOverlapsDay(event, new Date(2026, 7, 25)), true)
  assert.equal(eventOverlapsDay(event, new Date(2026, 7, 26)), false)
})

test('isAllDayReminder identifies UTC midnight strings and all_day flags correctly', () => {
  assert.equal(isAllDayReminder({ event_type: 'reminder', all_day: true }), true)
  assert.equal(isAllDayReminder({ event_type: 'reminder', start_time: '2026-08-19T00:00:00+00:00' }), true)
  assert.equal(isAllDayReminder({ event_type: 'reminder', start_time: '2026-08-19' }), true)
  assert.equal(isAllDayReminder({ event_type: 'reminder', start_time: '2026-08-19T13:30:00-04:00' }), false)
  assert.equal(isAllDayReminder({ event_type: 'event', all_day: true }), false)
})
