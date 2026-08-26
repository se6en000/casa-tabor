import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

const app = read('../src/App.tsx')
const calendarHook = read('../src/hooks/useCalendarEvents.ts')
const home = read('../src/pages/HomePage.tsx')
const homeRightPanel = read('../src/components/home/HomeRightPanel.tsx')
const groceryHook = read('../src/hooks/useGroceryList.ts')

test('Home and the always-mounted assistant share one rolling calendar query', () => {
  assert.match(app, /useRollingEvents\(now\)/)
  assert.match(home, /useRollingEvents\(now\)/)
  assert.doesNotMatch(home, /useTodayEvents/)
  assert.doesNotMatch(homeRightPanel, /useWeekEvents/)
  assert.match(homeRightPanel, /useWeekEventIndex\(now\)/)
})

test('Home derives today and tomorrow from the shared rolling payload', () => {
  assert.match(home, /rollingEvents\?\.filter\(\(event\) => eventOverlapsDay\(event, now\)\)/)
  assert.match(home, /rollingEvents\?\.filter\(\(event\) => eventOverlapsDay\(event, tomorrow\)\)/)
})

test('Home week counts use a minimal event index without detail joins', () => {
  assert.match(calendarHook, /export function useWeekEventIndex\(selectedDate: Date\)/)
  assert.match(calendarHook, /\.select\('id, start_time, end_time, all_day'\)/)
  assert.match(calendarHook, /queryKey: \['events', 'week-index', weekStart\.toISOString\(\)\]/)
  assert.match(homeRightPanel, /weekEventIndex\.filter\(event => \(/)
})

test('grocery uses Realtime singleton without active background polling', () => {
  assert.match(groceryHook, /channel\('grocery-realtime-singleton'\)/)
  assert.match(groceryHook, /refetchInterval: false/)
  assert.match(groceryHook, /refetchIntervalInBackground: false/)
  assert.doesNotMatch(groceryHook, /refetchInterval: 45_000/)
  assert.doesNotMatch(groceryHook, /\.select\('\*'\)\.is\('deleted_at', null\)/)
})
