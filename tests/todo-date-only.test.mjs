import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// To-dos with a day and no time showed "12:00 AM" on the iPhone (2026-09-30). The export says all_day, and
// an all-day to-do coming back date-only stays that day, all-day (not 5 PM, not a second copy).
// The behaviour runs against the real database: tests/sql/todo-date-only-scenario.sql (7, rolled back).
const sql = readFileSync(new URL('../supabase/migrations/20261001160000_todo_reminder_date_only.sql', import.meta.url), 'utf8')

test('the to-do export returns all_day after has_due_date', () => {
  assert.match(sql, /has_due_date boolean, all_day boolean\)/)
  assert.match(sql, /coalesce\(e\.all_day, false\) as all_day/)
  assert.match(sql, /revoke all on function public\.get_todo_reminder_deltas\(timestamptz, integer\)\s+from public, anon, authenticated;/)
})

test('the import keeps an all-day to-do all-day when it comes back date-only', () => {
  assert.match(sql, /v_date_only := v_has_due_date and not p_due_has_time;/)
  assert.match(sql, /or \(v_date_only and e\.has_due_date and e\.all_day and e\.start_time = v_day_start\)/)
  assert.match(sql, /all_day = v_all_day,/)
})
