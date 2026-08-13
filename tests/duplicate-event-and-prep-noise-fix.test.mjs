import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

// Regression coverage for two related production bugs surfaced the same day
// as the conflict-staleness fix:
//
// 1. execute-ai-action's create_event handler had zero duplicate detection.
//    A reminder ("Call in my Adderall prescription") got re-created with the
//    exact same title + start_time as an existing event, and each copy then
//    spawned its own prep item + notification stream — so the user saw the
//    same task "repeat" in Recent Activity even though nothing new happened.
//
// 2. apply-notification-policy escalated any priority>=3 prep item on every
//    ~6h policy cycle regardless of how far away it was due, so a task due
//    in 12 days looked exactly as urgent (and repeated exactly as often) as
//    one due in 20 minutes. Fixed with a lead-time bucket curve, deduped via
//    a new notifications.dedupe_key column so each bucket fires at most once.
//
// Also: a single AI-created reminder previously produced up to 3 near-
// duplicate Recent Activity cards (event_added + event_enriched + policy_prep)
// for the same action — event_added/event_enriched are now suppressed for
// event_type = 'reminder' since the prep-item escalation is the actionable
// signal.

const executeAiAction = readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')
const createPreflight = readFileSync(new URL('../supabase/functions/_shared/assistant-calendar-create-preflight.mjs', import.meta.url), 'utf8')
const applyPolicy = readFileSync(new URL('../supabase/functions/apply-notification-policy/index.ts', import.meta.url), 'utf8')
const aiChatDrawer = readFileSync(new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url), 'utf8')

function findMigration(nameFragment) {
  const dir = new URL('../supabase/migrations/', import.meta.url)
  const files = readdirSync(dir)
  const match = files.find((f) => f.includes(nameFragment))
  assert.ok(match, `expected a migration file matching "${nameFragment}"`)
  return readFileSync(new URL(match, dir), 'utf8')
}

const migration = findMigration('fix_duplicate_events_and_prep_escalation_noise')

test('create_event checks for an existing non-deleted event with the same title + start_time before inserting', () => {
  assert.match(executeAiAction, /is\(\s*['"]deleted_at['"],\s*null\s*\)/, 'duplicate lookup must exclude soft-deleted events')
  assert.match(executeAiAction, /duplicate:\s*true/, 'expected a duplicate response flag when an existing event matches')
  assert.match(executeAiAction, /assessCalendarCreatePreflight/, 'create handler must use the shared deterministic preflight')
  assert.match(createPreflight, /normalizeTitle\(event\?\.title\)\s*===\s*normalizeTitle\(args\?\.title\)/, 'title comparison must be normalized and case-insensitive')
})

test('AIChatDrawer surfaces the duplicate message to the user instead of silently succeeding', () => {
  assert.match(aiChatDrawer, /data\?\.duplicate\s*\?\s*data\?\.message/)
})

test('prep escalation uses a lead-time bucket curve instead of notifying every cycle regardless of due date', () => {
  assert.match(applyPolicy, /function prepEscalationBucket/)
  assert.match(applyPolicy, /return 'due_now'/)
  assert.match(applyPolicy, /return 'day_of'/)
  assert.match(applyPolicy, /return '48h'/)
  assert.match(applyPolicy, /return 'initial'/)
})

test('prep notifications dedupe by bucket via dedupe_key, not a rolling time window', () => {
  assert.match(applyPolicy, /dedupe_key:\s*dedupeKey/)
  assert.match(applyPolicy, /\.eq\('dedupe_key', dedupeKey\)/)
  assert.doesNotMatch(
    applyPolicy.slice(applyPolicy.indexOf('Prep: escalate')),
    /gte\('created_at', dedupeFrom\)/,
    'prep dedup should no longer rely on a rolling 6h window'
  )
})

test('migration adds notifications.dedupe_key and suppresses event_added/event_enriched for reminders', () => {
  assert.match(migration, /add column if not exists dedupe_key/)
  assert.match(migration, /create or replace function public\.notify_event_added/)
  assert.match(migration, /create or replace function public\.notify_event_enriched/)
  assert.match(migration, /if new\.event_type = 'reminder' then return new; end if;/)
  assert.match(migration, /if ev_type = 'reminder' then return new; end if;/)
})

test('migration includes a one-time backfill removing the specific duplicate Adderall event/prep/notifications', () => {
  assert.match(migration, /af4cea6c-7383-4baa-916e-5a29c4b41616/)
  assert.match(migration, /update public\.events set deleted_at = now\(\)/)
  assert.match(migration, /delete from public\.prep_items where event_id = dupe_event_id/)
  assert.match(migration, /delete from public\.notifications where event_id = dupe_event_id/)
})
