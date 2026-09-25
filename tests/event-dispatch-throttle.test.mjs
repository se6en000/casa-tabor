import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationSource = readFileSync(
  new URL('../supabase/migrations/20260918214823_throttle_event_side_effect_dispatch.sql', import.meta.url),
  'utf8',
)

// 2026-09-18: adding events (especially in bulk, e.g. importing a season
// schedule) was taking down the whole API with 503s. Root cause: two
// per-row triggers (auto_enrich_on_insert, and the transportation-plan
// generation triggers on events/event_members/event_enrichments) each fire
// a synchronous net.http_post from inside Postgres with no throttle, and
// the transportation-plan path fires *twice* per event (once from the
// events trigger, once from the event_members trigger) for one logical
// "create event with attendees" action. A prior incident
// (20260821231500_eliminate_42p10_and_idle_tx_storm.sql) hit the same
// connection-exhaustion failure mode from a runaway per-minute cron job and
// unscheduled it, but never rescheduled the transportation-plan backstop
// sweep at a safe interval -- leaving only the unthrottled eager path.

test('adds a shared burst throttle for eager event side-effect dispatch', () => {
  assert.match(migrationSource, /create table if not exists public\.event_side_effect_dispatch_log/)
  assert.match(migrationSource, /create or replace function public\.event_side_effect_dispatch_allowed/)
  assert.match(migrationSource, /recent_count >= p_max_per_window/)
})

test('enqueue_event_transportation_plan_generation dedupes same-event re-dispatch and honors the burst throttle', () => {
  const idx = migrationSource.indexOf('create or replace function public.enqueue_event_transportation_plan_generation')
  const block = migrationSource.slice(idx, idx + 3000)
  assert.match(block, /prior_dispatched_at > now\(\) - interval '5 seconds'/)
  assert.match(block, /public\.event_side_effect_dispatch_allowed\(\)/)
  assert.match(block, /last_dispatched_at = now\(\)/)
})

test('trigger_enrich_event honors the burst throttle and falls back to the existing enrich-pending-events sweep', () => {
  const idx = migrationSource.indexOf('create or replace function public.trigger_enrich_event')
  const block = migrationSource.slice(idx, idx + 1200)
  assert.match(block, /public\.event_side_effect_dispatch_allowed\(\)/)
})

test('reschedules the transportation-plan backstop sweep at a safe (>=15min) interval instead of leaving it dead', () => {
  assert.match(migrationSource, /dispatch-event-transportation-plans/)
  assert.match(migrationSource, /'\*\/15 \* \* \* \*'/)
  assert.match(migrationSource, /dispatch_pending_event_transportation_plans/)
})
