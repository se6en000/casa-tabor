import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compareCalendarEvents,
  eventOverlapsCalendarRange,
  eventRangeForCalendar,
} from '../supabase/functions/_shared/assistant-event-range.mjs'

const SUNDAY = {
  start: Date.parse('2026-07-19T04:00:00.000Z'),
  end: Date.parse('2026-07-20T04:00:00.000Z'),
}

test('all-day events use nominal date portions consistently with the calendar UI', () => {
  const event = {
    all_day: true,
    start_time: '2026-07-18T04:00:00.000Z',
    end_time: '2026-07-19T03:59:59.000Z',
  }
  assert.deepEqual(eventRangeForCalendar(event, '-04:00'), {
    start: Date.parse('2026-07-18T04:00:00.000Z'),
    end: Date.parse('2026-07-20T04:00:00.000Z'),
  })
  assert.equal(eventOverlapsCalendarRange(event, SUNDAY, '-04:00'), true)
})

test('exclusive-midnight all-day ranges do not gain an extra day', () => {
  const event = {
    all_day: true,
    start_time: '2026-07-18T00:00:00.000Z',
    end_time: '2026-07-19T00:00:00.000Z',
  }
  assert.equal(eventOverlapsCalendarRange(event, SUNDAY, '-04:00'), false)
})

test('all-day events sort before timed events in agenda answers', () => {
  const allDay = {
    all_day: true,
    start_time: '2026-07-19T12:00:00.000Z',
    end_time: '2026-07-20T12:00:00.000Z',
  }
  const timed = {
    all_day: false,
    start_time: '2026-07-19T13:00:00.000Z',
    end_time: '2026-07-19T14:00:00.000Z',
  }
  assert.ok(compareCalendarEvents(allDay, timed, '-04:00') < 0)
})
