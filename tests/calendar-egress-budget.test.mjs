import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const calendarHook = readFileSync(
  new URL('../src/hooks/useCalendarEvents.ts', import.meta.url),
  'utf8',
)
const detailPanel = readFileSync(
  new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url),
  'utf8',
)
const editSheet = readFileSync(
  new URL('../src/components/calendar/EventEditSheet.tsx', import.meta.url),
  'utf8',
)

const summaryProjection = calendarHook.match(
  /const EVENT_SUMMARY_SELECT = `([\s\S]*?)`\n\nconst EVENT_DETAIL_SELECT/,
)?.[1] ?? ''

test('calendar range feeds exclude detail-only child collections', () => {
  assert.ok(summaryProjection)
  assert.doesNotMatch(summaryProjection, /event_logistics/)
  assert.doesNotMatch(summaryProjection, /event_checklist_items/)
  assert.doesNotMatch(summaryProjection, /family_member:family_members \(\*\)/)
  assert.doesNotMatch(summaryProjection, /transportation_plan/)
  assert.doesNotMatch(summaryProjection, /^\s*\*,?\s*$/m)
})

test('calendar range feeds retain card-critical summary data', () => {
  for (const field of [
    'event_members',
    'color_hex',
    'can_drive',
    'event_enrichments',
    'departure_time',
    'weather_at_event',
    'event_action_items',
    'event_plan_overrides',
  ]) {
    assert.match(summaryProjection, new RegExp(`\\b${field}\\b`))
  }
})

test('full event graphs are fetched through a dedicated detail query', () => {
  assert.match(calendarHook, /const EVENT_DETAIL_SELECT = `[\s\S]*event_logistics \(\*\)/)
  assert.match(calendarHook, /queryKey: \['event-details', event\?\.id\]/)
  assert.match(editSheet, /useEventDetails\(props\.event\)/)
  assert.match(editSheet, /Event details could not be loaded/)
})

test('transportation plans are invalidated through realtime listeners', () => {
  assert.match(calendarHook, /queryKey: \['event-transportation-plans'\]/)
  assert.match(calendarHook, /_firePlanInvalidation/)
})
