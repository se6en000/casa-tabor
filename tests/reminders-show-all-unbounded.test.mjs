import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const calendarEventsSource = readFileSync(
  new URL('../src/hooks/useCalendarEvents.ts', import.meta.url),
  'utf8',
)
const presenterSource = readFileSync(
  new URL('../src/hooks/useCalmKioskPresenter.ts', import.meta.url),
  'utf8',
)

// 2026-09-18: confirmed live that Today's To-Dos was silently hiding real,
// synced-from-iOS reminders overdue by more than 7 days -- iOS showed 42 open
// reminders, Casa's own database also had exactly 42, but the widget's rolling
// window (fed by the -7d/+15d windowed rollingEvents query) only ever showed
// a handful of them. Fixed with a dedicated, unbounded reminders query,
// leaving the calendar-events window untouched (that dataset is legitimately
// unbounded-unsafe; reminders are not).

test('useAllReminders fetches reminders unbounded by date, only bounding completed ones to today', () => {
  assert.match(calendarEventsSource, /export function useAllReminders/)
  const idx = calendarEventsSource.indexOf('export function useAllReminders')
  const block = calendarEventsSource.slice(idx, idx + 1200)
  assert.match(block, /\.eq\('event_type', 'reminder'\)/)
  assert.match(block, /status\.neq\.cancelled,updated_at\.gte\./)
  // Must not carry a start_time/end_time range filter the way useRollingEvents does.
  assert.doesNotMatch(block, /subDays\(/)
  assert.doesNotMatch(block, /addDays\(/)
})

test('todayReminders sources from the unbounded useAllReminders, not the windowed rollingEvents', () => {
  assert.match(presenterSource, /useAllReminders/)
  const idx = presenterSource.indexOf('const todayReminders = useMemo')
  const block = presenterSource.slice(idx, idx + 900)
  assert.match(block, /return allReminders/)
  assert.doesNotMatch(block, /rollingEvents\s*\n?\s*\.filter/)
  // The old 7-day rolling cutoff must be gone -- every open reminder shows now.
  assert.doesNotMatch(block, /isBefore\(startDate, todayEnd\)/)
})

test('a reminder completed via iOS (status cancelled) is treated as done, not left showing as open', () => {
  const idx = presenterSource.indexOf('const todayReminders = useMemo')
  const block = presenterSource.slice(idx, idx + 900)
  assert.match(block, /e\.status === 'cancelled'/)
})
