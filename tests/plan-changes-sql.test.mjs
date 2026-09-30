import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Plan it with Casa, phase 4 (P3.25): change a saved project by talking, or replace it (Jake, 2026-09-29:
// "if Olive changes her costume from scuba diver to Chucky, it will need the ability to completely redo
// the plan"). A replaced project is closed with its reason, not deleted ("so we know it's closed/not
// active"). The flow runs against the real database in tests/sql/plan-changes-scenario.sql (rolled back).
const sql = readFileSync(new URL('../supabase/migrations/20260930120000_plan_changes.sql', import.meta.url), 'utf8')
const scenario = readFileSync(new URL('./sql/plan-changes-scenario.sql', import.meta.url), 'utf8')

test('changes to a saved project go through the project page’s own edits, each kept with what it was', () => {
  for (const kind of ['edit_step', 'add_step', 'remove_step', 'close_project']) assert.match(sql, new RegExp(`v_item->>'kind' = '${kind}'`), kind)
  assert.match(sql, /todo_project_edit_with_calendar\(v_pid, 'set_step'/)
  assert.match(sql, /'edited', v_edited, 'added_steps', v_added, 'removed_steps', v_removed, 'closed', v_closed/)
})

test('a closed project keeps its reason and its row in the parent; what it made that isn’t done comes off', () => {
  assert.match(sql, /closed_reason = coalesce\(nullif\(btrim\(v_item->>'reason'\), ''\), 'Closed'\)/)
  assert.match(sql, /v_project\.status = 'dropped' and v_project\.closed_reason is not null/)
  assert.match(sql, /and not checked and deleted_at is null/, 'only unbought shopping lines')
  assert.match(sql, /and start_time > now\(\)/, 'only events still to come')
  assert.match(sql, /create or replace function public\.todo_project_reopen/)
})

test('the scenario covers it end to end', () => {
  for (let n = 1; n <= 8; n++) assert.match(scenario, new RegExp(`FAIL ${n}\\b`), `check ${n}`)
})
