import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// discover_directory_candidates() (and the build-household-graph function that
// must run before it, since it reads the graph tables) were never invoked
// from anywhere in the running app — no cron, no client call. This migration
// schedules build-household-graph (which itself calls
// discover_directory_candidates internally) so directory suggestions
// actually surface without a user manually visiting Settings > Places.
const source = readFileSync(
  new URL('../supabase/migrations/20260806143000_schedule_household_directory_discovery_scan.sql', import.meta.url),
  'utf8',
)

test('schedules a daily cron job for the household directory discovery scan', () => {
  assert.match(source, /cron\.schedule\(\s*\n?\s*'household-directory-discovery-scan'/)
  // Unschedule-if-exists guard, matching the repo's existing cron migration convention
  assert.match(source, /cron\.unschedule\(v_job_id\)/)
})

test('invokes build-household-graph (which calls discover_directory_candidates) via net.http_post', () => {
  assert.match(source, /net\.http_post\(/)
  assert.match(source, /functions\/v1\/build-household-graph/)
  assert.match(source, /vault\.decrypted_secrets/)
  assert.match(source, /name = 'SUPABASE_SERVICE_ROLE_KEY'/)
})
