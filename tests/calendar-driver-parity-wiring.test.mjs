import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('day and stacked cards share transportation-aware responsibility derivation', () => {
  const dayView = readFileSync(new URL('../src/components/calendar/DayView.tsx', import.meta.url), 'utf8')
  const stackedView = readFileSync(new URL('../src/components/calendar/StackedView.tsx', import.meta.url), 'utf8')
  const responsibility = readFileSync(new URL('../src/lib/calendarResponsibility.ts', import.meta.url), 'utf8')

  assert.match(dayView, /deriveCalendarCardResponsibility\(event, household, now\)/)
  assert.match(stackedView, /deriveCalendarCardResponsibility\(event, household, new Date\(\)\)/)
  assert.match(responsibility, /projectHomeTransportation\(event, persisted\.transportationPlan, now\)/)
})

test('swipeable reminder pill blocks parent click clearing on tap', () => {
  const pill = readFileSync(new URL('../src/components/shared/SwipeableReminderPill.tsx', import.meta.url), 'utf8')
  assert.match(pill, /onClick=\{\(e\) => \{\s*e\.stopPropagation\(\)/s)
})
