import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import test from 'node:test'

const hooksDir = resolve('src/hooks')
const migrationsDir = resolve('supabase/migrations')

test('Guardrail 1: Realtime event invalidation debounces are strictly >= 500ms', () => {
  const calendarHook = readFileSync(join(hooksDir, 'useCalendarEvents.ts'), 'utf8')
  
  // Ensure debounce timers are at least 500ms
  const matchDebounces = calendarHook.matchAll(/setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]*?\},\s*(\d+)\s*\)/g)
  for (const match of matchDebounces) {
    const delay = parseInt(match[1], 10)
    assert.ok(delay >= 500, `Realtime debounce delay (${delay}ms) must be >= 500ms to prevent thundering herds`)
  }
})

test('Guardrail 2: Client calendar views derive from rolling cache, not separate queries', () => {
  const calendarHook = readFileSync(join(hooksDir, 'useCalendarEvents.ts'), 'utf8')
  
  // useTodayEvents and useTomorrowEvents must derive from useRollingEvents
  assert.match(calendarHook, /export function useTodayEvents[\s\S]*?useRollingEvents/)
  assert.match(calendarHook, /export function useTomorrowEvents[\s\S]*?useRollingEvents/)
})

test('Guardrail 3: No unindexed foreign keys in recent performance migrations', () => {
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql'))
  const recentMigration = files.find(f => f.includes('20260821235000'))
  assert.ok(recentMigration, 'Performance migration 20260821235000 exists')
  
  const content = readFileSync(join(migrationsDir, recentMigration), 'utf8')
  assert.match(content, /create index if not exists idx_event_members_family_member_id/)
  assert.match(content, /create index if not exists idx_event_plan_overrides_event_id/)
  assert.match(content, /create or replace function public\.get_calendar_feed/)
  assert.match(content, /create or replace function public\.upsert_event_bundle/)
})
