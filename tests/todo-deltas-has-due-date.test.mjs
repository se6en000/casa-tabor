import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Undated to-dos showed "12 AM" on the iPhone (2026-09-30): the export gave the Mac only the midnight
// placeholder start_time. It now says has_due_date, last, so the Mac can leave the due date empty.
// The behaviour itself runs against the real database: tests/sql/todo-deltas-has-due-date-scenario.sql.
const sql = readFileSync(new URL('../supabase/migrations/20261001150000_todo_reminder_deltas_has_due_date.sql', import.meta.url), 'utf8')

test('the to-do export returns has_due_date as its last column', () => {
  assert.match(sql, /deleted_at timestamptz, has_due_date boolean\)/)
  assert.match(sql, /e\.deleted_at,\s*coalesce\(e\.has_due_date, true\) as has_due_date\s*from public\.events e/)
})

test('it keeps the same filters and the same grants', () => {
  assert.match(sql, /en\.category <> 'morning_prep'/)
  assert.match(sql, /coalesce\(l\.last_modified_source, 'casa'\) <> 'ios' or e\.deleted_at is not null/)
  assert.match(sql, /revoke all on function public\.get_todo_reminder_deltas\(timestamptz, integer\)\s+from public, anon, authenticated;/)
  assert.match(sql, /grant execute on function public\.get_todo_reminder_deltas\(timestamptz, integer\)\s+to anon, authenticated, service_role;/)
})
