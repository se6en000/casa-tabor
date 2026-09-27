import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Live, 2026-09-27: saving "all events" on an all-day yearly birthday (Jan 23) moved the whole series
// to Jan 24 — the template's local date plus the edit's time of day in America/New_York. Every
// all-day repeating event edited in Casa would have slid a day, in Casa and then in Google.
const sql = readFileSync(new URL('../supabase/migrations/20260927180000_all_day_series_keep_their_date.sql', import.meta.url), 'utf8')
const branch = sql.slice(sql.indexOf('An all-day series keeps its date'), sql.indexOf('v_template_patch := jsonb_set('))

test('an all-day series keeps its own date and length, whatever time the edit carries', () => {
  assert.match(branch, /if coalesce\(nullif\(v_canonical_patch#>>'\{event,all_day\}', ''\)::boolean, v_root_template\.all_day\) then/)
  assert.match(branch, /v_template_start := \(\(v_root_template\.start_time at time zone 'UTC'\)::date\)::timestamp at time zone 'UTC'/)
  assert.match(branch, /\* interval '1 day'/)
  assert.doesNotMatch(branch.slice(0, branch.indexOf('else')), /v_canonical_patch#>>'\{event,start_time\}'/)
})

test('a timed series still takes the edit\'s time of day', () => {
  const timed = branch.slice(branch.indexOf('else'))
  assert.match(timed, /\(v_root_template\.start_time at time zone v_root\.timezone\)::date/)
  assert.match(timed, /at time zone v_root\.timezone\)::time/)
})
