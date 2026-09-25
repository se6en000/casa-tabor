import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-22: `complete-morning-prep-reminders` (pg_cron jobid 61) has failed
// EVERY run since it was created on 2026-09-15 -- confirmed live via
// cron.job_run_details: 668/668 runs `ERROR: unrecognized configuration
// parameter "app.supabase_url"`. Its migration
// (20260916000243_pg_cron_morning_prep_sweep.sql) reads
// current_setting('app.supabase_url'/'app.supabase_anon_key'), custom GUCs
// that were never set anywhere in this database (grep across all migrations
// confirms this cron job is the only place that pattern is used at all -- no
// sibling job shares the bug). The working crons all resolve the anon key
// from vault.decrypted_secrets(SUPABASE_ANON_KEY) instead (see the
// 20260921183000 index-worker fix and 20260814223000's repair pattern).
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
const FIX = 'supabase/migrations/20260922233348_fix_morning_prep_cron_vault_auth.sql'

test('morning-prep cron is rescheduled off vault.decrypted_secrets, not the nonexistent app.* GUCs', () => {
  assert.ok(existsSync(new URL(`../${FIX}`, import.meta.url)), `${FIX} must exist`)
  const sql = read(FIX)
  assert.match(sql, /cron\.unschedule/)
  assert.match(sql, /cron\.schedule\(\s*'complete-morning-prep-reminders'/)
  assert.match(sql, /'\*\/15 \* \* \* \*'/)
  assert.match(sql, /timeout_milliseconds := 10000/)
  assert.match(sql, /vault\.decrypted_secrets[\s\S]*?SUPABASE_ANON_KEY/)
  assert.doesNotMatch(sql, /current_setting\('app\.supabase_url'\)/)
  assert.doesNotMatch(sql, /current_setting\('app\.supabase_anon_key'\)/)
  assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{20,}/)
})
