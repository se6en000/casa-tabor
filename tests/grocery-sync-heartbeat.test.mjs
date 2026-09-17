import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const syncCasaToIosSource = readFileSync(
  new URL('../supabase/functions/sync-casa-to-ios/index.ts', import.meta.url),
  'utf8',
)
const hookSource = readFileSync(
  new URL('../src/hooks/useGrocerySyncHealth.ts', import.meta.url),
  'utf8',
)
const groceryPageSource = readFileSync(
  new URL('../src/pages/GroceryPage.tsx', import.meta.url),
  'utf8',
)
const migrationSource = readFileSync(
  new URL('../supabase/migrations/20260917120000_grocery_sync_heartbeat.sql', import.meta.url),
  'utf8',
)

// 2026-09-17: the Mac-side Casa<->iOS sync can die silently (Mac asleep, launchd
// job unloaded) with nothing in the app reflecting it. sync-casa-to-ios is polled
// unconditionally by the Mac's Casa->iOS script on every tick, so a heartbeat
// recorded on every call is a reliable "poller is alive" signal.
test('sync_heartbeats table is created by migration', () => {
  assert.match(migrationSource, /create table if not exists public\.sync_heartbeats/)
  assert.match(migrationSource, /job_name text primary key/)
  assert.match(migrationSource, /last_seen_at timestamptz/)
})

test('sync-casa-to-ios records a heartbeat on every call without breaking the real response on failure', () => {
  assert.match(syncCasaToIosSource, /sync_heartbeats/)
  assert.match(syncCasaToIosSource, /job_name: 'sync-casa-to-ios'/)
  // The heartbeat write must be wrapped so it can never throw the whole request into 500.
  const heartbeatIdx = syncCasaToIosSource.indexOf('sync_heartbeats')
  const surrounding = syncCasaToIosSource.slice(Math.max(0, heartbeatIdx - 200), heartbeatIdx + 200)
  assert.match(surrounding, /try\s*{/)
})

test('useGrocerySyncHealth computes staleness against a threshold, not raw activity', () => {
  assert.match(hookSource, /STALE_THRESHOLD_MS/)
  assert.match(hookSource, /isStale/)
  assert.match(hookSource, /sync_heartbeats/)
  // Must not open its own realtime channel -- this session already shipped and had to
  // hotfix a production incident from exactly that mistake in useFamilyRoutineIntelligence.ts.
  assert.doesNotMatch(hookSource, /supabase\.channel\(/)
})

test('GroceryPage surfaces a stale-sync warning using the shared Alert component', () => {
  assert.match(groceryPageSource, /useGrocerySyncHealth/)
  assert.match(groceryPageSource, /isReminderSyncStale/)
  const alertIdx = groceryPageSource.indexOf('isReminderSyncStale &&')
  const surrounding = groceryPageSource.slice(alertIdx, alertIdx + 300)
  assert.match(surrounding, /<Alert\b/)
  assert.match(surrounding, /tone="warning"/)
})
