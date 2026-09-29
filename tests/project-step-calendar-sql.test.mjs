import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// A project step on the calendar (P3.23 step 2). The flow runs against the real database in
// tests/sql/project-step-calendar-scenario.sql (rolled back).
const sql = readFileSync(new URL('../supabase/migrations/20260929140000_project_step_calendar.sql', import.meta.url), 'utf8')
const fn = readFileSync(new URL('../supabase/functions/todos/index.ts', import.meta.url), 'utf8')

test('a dated step is an all-day event named for its project, kept in step, and off when its dates go', () => {
  assert.match(sql, /v_title := v_project\.title \|\| ': ' \|\| v_step\.title/)
  assert.match(sql, /interval '23 hours 59 minutes 59 seconds'/)
  assert.match(sql, /v_step\.cal_start is null or v_project\.status = 'dropped'/)
  for (const op of ['created', 'updated', 'deleted']) assert.match(sql, new RegExp(`'op', '${op}'`))
})

test('moving the start keeps the length', () => {
  assert.match(sql, /new\.cal_end := old\.cal_end \+ \(new\.cal_start - old\.cal_start\)/)
})

test('the todos function edits through the calendar wrapper and tells Google', () => {
  assert.match(fn, /rpc\('todo_project_edit_with_calendar'/)
  for (const f of ['create-google-event', 'push-to-google', 'delete-google-event']) assert.ok(fn.includes(f), f)
  assert.match(fn, /enqueue_google_sync_job/)
})

test('the scenario covers it end to end', () => {
  const scenario = readFileSync(new URL('./sql/project-step-calendar-scenario.sql', import.meta.url), 'utf8')
  for (let n = 1; n <= 7; n++) assert.match(scenario, new RegExp(`FAIL ${n}\\b`), `check ${n}`)
})
