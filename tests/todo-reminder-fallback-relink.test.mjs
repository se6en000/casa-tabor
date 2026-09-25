import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationSource = readFileSync(
  new URL('../supabase/migrations/20260919223923_todo_reminder_fallback_relink.sql', import.meta.url),
  'utf8',
)

// 2026-09-19: sync-casa-todos-to-ios exports a Casa reminder to iOS but has no
// way to report the new ios_reminder_id back, so event_ios_reminder_links
// never gets created for the Casa-origin side. When the Mac's import poller
// later sees that same reminder reflected back from iOS, upsert_todo_reminder_from_ios
// only ever matched by ios_reminder_id -- found nothing -- and unconditionally
// inserted a brand new Casa event. Confirmed live: ~90 duplicate reminder
// pairs, plus one still-open recurrence (created 2026-09-19 21:59, duplicated
// 22:08). Fix: before inserting, fall back to matching an existing, still
// unlinked Casa-origin reminder by title + due semantics, and link to that
// instead.
test('upsert_todo_reminder_from_ios falls back to matching an unlinked existing reminder before inserting a duplicate', () => {
  assert.match(migrationSource, /v_fallback_event_id/)
  const idx = migrationSource.indexOf('if v_link.event_id is null and not p_deleted then')
  assert.ok(idx > -1, 'fallback match must be gated to only run when nothing was found by ios_reminder_id and the incoming record is not a delete')
  const block = migrationSource.slice(idx, idx + 900)
  assert.match(block, /lower\(btrim\(e\.title\)\) = v_normalized_title/)
  assert.match(block, /not exists\(?[\s\S]*event_ios_reminder_links/)
})

test('the fallback match handles due-date-less reminders (start_time is a meaningless daily placeholder) separately from dated ones', () => {
  const idx = migrationSource.indexOf('if v_link.event_id is null and not p_deleted then')
  const block = migrationSource.slice(idx, idx + 900)
  assert.match(block, /v_has_due_date and e\.has_due_date and e\.start_time = v_start/)
  assert.match(block, /not v_has_due_date and not e\.has_due_date/)
})

test('linking to a fallback-matched event upserts the link row (insert-or-update), not a plain update that would silently no-op for a never-linked event', () => {
  assert.match(migrationSource, /on conflict \(event_id\) do update set/)
})
