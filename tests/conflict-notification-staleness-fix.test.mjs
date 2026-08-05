import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

// Regression coverage for a real production bug: analyze-conflicts purged past
// conflicts by building a client-side `.or(event_a_id.in.(...),event_b_id.in.(...))`
// filter from every non-deleted past event. Once the household had hundreds of
// past events that filter string grew past ~35,000 characters and the update
// silently failed with HTTP 400 (never checked). Because the purge never ran,
// apply-notification-policy (zero date filtering) kept re-notifying about the
// same weeks-old conflicts every ~6h, forever, making them look brand new in
// Recent Activity.
//
// The fix moves the purge to a single set-based SQL function (no per-row id
// list, so it can never hit a request-size limit), and moves conflict
// selection for notifications into a date-aware SQL function so a conflict
// tied to an already-past event can never generate a fresh notification
// regardless of purge health.

const analyzeConflicts = readFileSync(new URL('../supabase/functions/analyze-conflicts/index.ts', import.meta.url), 'utf8')
const applyPolicy = readFileSync(new URL('../supabase/functions/apply-notification-policy/index.ts', import.meta.url), 'utf8')
const useNotifications = readFileSync(new URL('../src/hooks/useNotifications.ts', import.meta.url), 'utf8')
const actionHubPage = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')

function findMigration(nameFragment) {
  const dir = new URL('../supabase/migrations/', import.meta.url)
  const files = readdirSync(dir)
  const match = files.find((f) => f.includes(nameFragment))
  assert.ok(match, `expected a migration file matching "${nameFragment}"`)
  return readFileSync(new URL(match, dir), 'utf8')
}

const migration = findMigration('fix_conflict_purge_and_notification_pruning')

test('analyze-conflicts purges past conflicts via the scalable RPC, not a per-row id-list filter', () => {
  assert.match(analyzeConflicts, /sb\.rpc\(\s*['"]expire_past_conflicts['"]/, 'expected analyze-conflicts to call the expire_past_conflicts RPC')
  assert.match(analyzeConflicts, /purgeError/i, 'the purge result must be error-checked, not silently ignored')
  // The remaining `.or('event_a_id.in...')` usages further down the file are scoped to
  // eventIds within the current scan range (bounded to ~14 days), not "every past event" —
  // that's a different, safe usage. Only the purge step itself must avoid the unbounded list.
  const purgeSection = analyzeConflicts.slice(0, analyzeConflicts.indexOf('Load all family members'))
  assert.doesNotMatch(purgeSection, /event_a_id\.in\.\(/, 'the purge step must not rebuild the unbounded id-list filter')
})

test('apply-notification-policy selects conflicts via the date-aware RPC instead of an unfiltered query', () => {
  assert.match(applyPolicy, /sb\.rpc\(\s*['"]get_active_conflict_alerts['"]/, 'expected apply-notification-policy to call get_active_conflict_alerts')
  assert.doesNotMatch(
    applyPolicy,
    /from\('conflicts'\)\s*\n?\s*\.select/,
    'apply-notification-policy should no longer query the conflicts table directly with zero date filtering'
  )
})

test('migration defines a set-based expire_past_conflicts function (no per-row id list)', () => {
  assert.match(migration, /create or replace function public\.expire_past_conflicts/)
  assert.match(migration, /update public\.conflicts/i)
  assert.match(migration, /security definer/i)
  assert.match(migration, /grant execute on function public\.expire_past_conflicts.*to service_role/i)
})

test('migration defines a date-aware get_active_conflict_alerts function scoped to Eastern "today or later"', () => {
  assert.match(migration, /create or replace function public\.get_active_conflict_alerts/)
  assert.match(migration, /America\/New_York/)
  assert.match(migration, /grant execute on function public\.get_active_conflict_alerts.*to service_role/i)
})

test('migration adds notification retention pruning with a scheduled cron job', () => {
  assert.match(migration, /create or replace function public\.prune_old_notifications/)
  assert.match(migration, /interval '30 days'/)
  assert.match(migration, /cron\.schedule\(\s*\n?\s*'prune-old-notifications'/)
})

test('migration includes a one-time backfill to immediately clear already-stale conflict notifications', () => {
  assert.match(migration, /select public\.expire_past_conflicts\(now\(\)\)/)
  assert.match(migration, /delete from public\.notifications/i)
  assert.match(migration, /type = 'policy_conflict'/)
})

test('useNotifications embeds the linked event date/title for Recent Activity context', () => {
  assert.match(useNotifications, /event:events\(start_time, title\)/)
  assert.match(useNotifications, /event: \{ start_time: string; title: string \} \| null/)
})

test('ActionHubPage renders an event-date badge on Recent Activity cards', () => {
  assert.match(actionHubPage, /function eventDateBadge/)
  assert.match(actionHubPage, /eventDateBadge\(n, now\)/)
})
