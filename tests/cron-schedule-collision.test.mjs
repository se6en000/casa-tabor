import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-23: real, active regression -- confirmed live via cron.job_run_details
// that complete-morning-prep-reminders, process-family-data-index (both
// rescheduled today) and the pre-existing dispatch-event-transportation-plans
// all fired at the SAME INSTANT (00:00:09.94-00:00:09.95 UTC) every 15
// minutes since ~23:00, because all three used the bare '*/15 * * * *'
// pattern. A user's calendar page load during this window took ~48 seconds
// (scan-gmail-inbox's next tick even failed with "job startup timeout" 2
// minutes later, a knock-on effect). GUARDRAILS.md already requires >=15min
// intervals for cron+net.http_post jobs but says nothing about jobs
// colliding with EACH OTHER on a shared, resource-constrained instance --
// the existing gmail (2,17,32,47) and calendar-sync (7,22,37,52) jobs already
// follow the right pattern (offset minutes, not '*/15'); the two jobs
// resumed today should have matched that convention from the start.
const MIGRATION = 'supabase/migrations/20260923001827_stagger_colliding_cron_schedules.sql'
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

test('a migration staggers the colliding cron schedules', () => {
  assert.ok(existsSync(new URL(`../${MIGRATION}`, import.meta.url)), `${MIGRATION} must exist`)
})

test('process-family-data-index and complete-morning-prep-reminders no longer both use bare */15', () => {
  const sql = read(MIGRATION)
  const statements = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  assert.doesNotMatch(statements, /'\*\/15 \* \* \* \*'/)
  // must still be >=15-minute-equivalent cadence (4 fires/hour), just offset
  assert.match(statements, /process-family-data-index[\s\S]{0,400}cron\.schedule/)
  assert.match(statements, /complete-morning-prep-reminders[\s\S]{0,400}cron\.schedule/)
})

test('the new offsets do not collide with each other or with any existing active job', () => {
  const sql = read(MIGRATION)
  const offsetLists = [...sql.matchAll(/'((?:\d{1,2},){3}\d{1,2}) \* \* \* \*'/g)].map((m) =>
    m[1].split(',').map(Number),
  )
  assert.ok(offsetLists.length >= 2, 'expected at least 2 offset-minute schedules in the migration')
  const existingOffsets = [
    [0, 15, 30, 45], // dispatch-event-transportation-plans
    [2, 17, 32, 47], // scan-gmail-inbox
    [7, 22, 37, 52], // sync-google-calendars
  ]
  const allSchedules = [...offsetLists, ...existingOffsets]
  for (let i = 0; i < allSchedules.length; i++) {
    for (let j = i + 1; j < allSchedules.length; j++) {
      const overlap = allSchedules[i].filter((m) => allSchedules[j].includes(m))
      assert.deepEqual(overlap, [], `schedules ${allSchedules[i]} and ${allSchedules[j]} collide at minute(s) ${overlap}`)
    }
  }
})
