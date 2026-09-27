import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { operationPlan } from '../supabase/functions/_shared/google-recurrence-outbox-core.mjs'

// Live, 2026-09-27: every "all events" edit made in Casa deleted the Google series and created a new
// one (new id; custom reminders dropped). A series never split into parts is now patched in place.
const sql = readFileSync(new URL('../supabase/migrations/20260927190000_all_scope_edits_patch_google_in_place.sql', import.meta.url), 'utf8')

test('an unsplit series queues patch_master; only a split family is rebuilt', () => {
  assert.match(sql, /case when cardinality\(v_child_ids\) = 0 and v_root\.google_recurring_event_id is not null\s+then 'patch_master' else 'recreate_projection' end/)
})

test('patch_master PATCHes the existing Google master; a rebuild creates a new one', () => {
  assert.deepEqual(operationPlan({ operation_type: 'patch_master' }, { google_recurring_event_id: 'g1' }), ['patch_master'])
  assert.deepEqual(operationPlan({ operation_type: 'recreate_projection' }, { google_recurring_event_id: 'g1' }), ['create_master'])
})

test('it keeps the all-day date fix from 20260927180000', () => {
  assert.match(sql, /An all-day series keeps its date/)
})
