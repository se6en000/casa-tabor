import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationSource = readFileSync(
  new URL('../supabase/migrations/20260917233050_todo_reminder_sync.sql', import.meta.url),
  'utf8',
)
const dueDateMigrationSource = readFileSync(
  new URL('../supabase/migrations/20260918000038_todo_reminder_date_only_default_time.sql', import.meta.url),
  'utf8',
)
const casaToIosSource = readFileSync(
  new URL('../supabase/functions/sync-casa-todos-to-ios/index.ts', import.meta.url),
  'utf8',
)
const iosToCasaSource = readFileSync(
  new URL('../supabase/functions/sync-ios-todos-to-casa/index.ts', import.meta.url),
  'utf8',
)

// 2026-09-17: syncs the app's existing Today's To-Dos (events with
// event_type = 'reminder') against the user's real, existing "To Do" Apple
// Reminders list -- not a new list. Mirrors the grocery <-> Shopping sync
// architecture, but sync bookkeeping lives in a dedicated
// event_ios_reminder_links table rather than new columns on `events`.

test('event_ios_reminder_links keeps sync bookkeeping off the events table', () => {
  assert.match(migrationSource, /create table if not exists public\.event_ios_reminder_links/)
  assert.match(migrationSource, /event_id uuid primary key references public\.events\(id\)/)
  assert.doesNotMatch(migrationSource, /alter table public\.events/)
})

test('get_todo_reminder_deltas excludes morning_prep reminders and ios-origin echoes', () => {
  assert.match(migrationSource, /create or replace function public\.get_todo_reminder_deltas/)
  assert.match(migrationSource, /category <> 'morning_prep'/)
  assert.match(migrationSource, /last_modified_source, 'casa'\) <> 'ios'/)
  assert.match(migrationSource, /revoke all on function public\.get_todo_reminder_deltas/)
  assert.match(migrationSource, /grant execute on function public\.get_todo_reminder_deltas/)
})

test('upsert_todo_reminder_from_ios is idempotent and writes events + link table atomically', () => {
  assert.match(migrationSource, /create or replace function public\.upsert_todo_reminder_from_ios/)
  assert.match(migrationSource, /p_ios_updated_at <= v_link\.ios_updated_at/)
  assert.match(migrationSource, /insert into public\.events/)
  assert.match(migrationSource, /insert into public\.event_ios_reminder_links/)
  assert.match(migrationSource, /revoke all on function public\.upsert_todo_reminder_from_ios/)
})

test('sync-casa-todos-to-ios calls the RPC rather than a client-side join, and records a heartbeat', () => {
  assert.match(casaToIosSource, /\.rpc\('get_todo_reminder_deltas'/)
  assert.doesNotMatch(casaToIosSource, /!inner\(/)
  assert.match(casaToIosSource, /sync_heartbeats/)
  assert.match(casaToIosSource, /job_name: 'sync-casa-todos-to-ios'/)
})

test('sync-ios-todos-to-casa accepts the real live wire shape (title/deleted, not name/notes)', () => {
  assert.match(iosToCasaSource, /reminder\.title \?\? reminder\.name/)
  assert.match(iosToCasaSource, /reminder\.deleted/)
  assert.match(iosToCasaSource, /\.rpc\('upsert_todo_reminder_from_ios'/)
})

// 2026-09-17: the Mac script was confirmed (via its actual EKReminder loop) to
// never read dueDateComponents at all, silently defaulting every to-do to
// end-of-today even when the user set a real due date/time via Siri.
test('due-date support: a real due date/time overrides the end-of-today default', () => {
  assert.match(dueDateMigrationSource, /p_due_date timestamptz default null/)
  assert.match(dueDateMigrationSource, /p_due_has_time boolean default false/)
  assert.match(dueDateMigrationSource, /if p_due_has_time then/)
  assert.match(dueDateMigrationSource, /v_start := p_due_date/)
  // Date-only (no time) reminders default to 5pm household-local, not midnight
  // (originally 9am, corrected to 5pm per direct user feedback).
  assert.match(dueDateMigrationSource, /interval '17 hours'/)
  assert.match(iosToCasaSource, /p_due_date: getDueDate\(reminder\)/)
  assert.match(iosToCasaSource, /p_due_has_time: Boolean\(reminder\.due_has_time\)/)
})
