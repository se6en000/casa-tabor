import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const syncCasaToIosSource = readFileSync(
  new URL('../supabase/functions/sync-casa-to-ios/index.ts', import.meta.url),
  'utf8',
)
const syncCasaTodosToIosSource = readFileSync(
  new URL('../supabase/functions/sync-casa-todos-to-ios/index.ts', import.meta.url),
  'utf8',
)
const hookSource = readFileSync(
  new URL('../src/hooks/useSyncHealth.ts', import.meta.url),
  'utf8',
)
const groceryPageSource = readFileSync(
  new URL('../src/pages/GroceryPage.tsx', import.meta.url),
  'utf8',
)
const migrationSource = readFileSync(
  new URL('../supabase/migrations/20260917232152_grocery_sync_heartbeat.sql', import.meta.url),
  'utf8',
)

// 2026-09-17/18: the Mac-side Casa<->iOS sync can die silently (Mac asleep,
// launchd job unloaded) with nothing in the app reflecting it. Both
// sync-casa-to-ios (grocery) and sync-casa-todos-to-ios (to-dos) are polled
// unconditionally by the Mac's Casa->iOS scripts on every tick, so a
// heartbeat recorded on every call is a reliable "poller is alive" signal.
// The to-do sync's heartbeat was recorded server-side from day one but had
// no UI check wired to it at all until the user directly asked "where is
// the health check" and the gap was found.
test('sync_heartbeats table is created by migration', () => {
  assert.match(migrationSource, /create table if not exists public\.sync_heartbeats/)
  assert.match(migrationSource, /job_name text primary key/)
  assert.match(migrationSource, /last_seen_at timestamptz/)
})

test('both sync-casa-to-ios and sync-casa-todos-to-ios record a heartbeat without breaking the real response on failure', () => {
  for (const source of [syncCasaToIosSource, syncCasaTodosToIosSource]) {
    assert.match(source, /sync_heartbeats/)
    const heartbeatIdx = source.indexOf('sync_heartbeats')
    const surrounding = source.slice(Math.max(0, heartbeatIdx - 200), heartbeatIdx + 200)
    assert.match(surrounding, /try\s*{/)
  }
  assert.match(syncCasaToIosSource, /job_name: 'sync-casa-to-ios'/)
  assert.match(syncCasaTodosToIosSource, /job_name: 'sync-casa-todos-to-ios'/)
})

test('useSyncHealth tracks both grocery and to-do jobs and computes staleness against a threshold, not raw activity', () => {
  assert.match(hookSource, /STALE_THRESHOLD_MS/)
  assert.match(hookSource, /isStale/)
  assert.match(hookSource, /sync_heartbeats/)
  assert.match(hookSource, /sync-casa-to-ios/)
  assert.match(hookSource, /sync-casa-todos-to-ios/)
  // Must not open its own realtime channel -- this session already shipped and had to
  // hotfix a production incident from exactly that mistake in useFamilyRoutineIntelligence.ts.
  assert.doesNotMatch(hookSource, /supabase\.channel\(/)
})

test('GroceryPage surfaces a stale-sync warning covering every stale job, using the shared Alert component', () => {
  assert.match(groceryPageSource, /useSyncHealth/)
  assert.match(groceryPageSource, /isReminderSyncStale/)
  assert.match(groceryPageSource, /staleSyncJobs/)
  const alertIdx = groceryPageSource.indexOf('isReminderSyncStale &&')
  const surrounding = groceryPageSource.slice(alertIdx, alertIdx + 400)
  assert.match(surrounding, /<Alert\b/)
  assert.match(surrounding, /tone="warning"/)
  assert.match(surrounding, /staleSyncJobs\.map/)
})
