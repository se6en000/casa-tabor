import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Plan it with Casa (P3.25 phase 3; canvas 12c/12d): one Agree saves a whole plan in one transaction,
// and Undo takes the whole plan back until the end of the next day. The flow runs against the real
// database in tests/sql/casa-plans-scenario.sql (rolled back).
const sql = readFileSync(new URL('../supabase/migrations/20260930100000_casa_plans.sql', import.meta.url), 'utf8')
const scenario = readFileSync(new URL('./sql/casa-plans-scenario.sql', import.meta.url), 'utf8')

test('every kind of plan item saves through the functions the screens already use', () => {
  for (const kind of ['project', 'tick_step', 'event', 'todo', 'shopping', 'pack']) assert.match(sql, new RegExp(`v_item->>'kind' = '${kind}'`), kind)
  assert.match(sql, /public\.todo_create_project\(/)
  assert.match(sql, /todo_project_edit\(v_project, 'part_of'/)
  assert.match(sql, /todo_project_calendar_sync\(v_project\)/, 'dated steps reach the calendar (and Google, from the edge)')
  assert.match(sql, /public\.todo_add\(/)
  assert.match(sql, /continue when v_skip \? \(v_item->>'id'\)/, 'unticked on the card = not saved')
})

test('undo lasts until the end of the next day, and takes back everything the plan made', () => {
  assert.match(sql, /v_until timestamptz := \(\(v_today \+ 2\)::timestamp at time zone 'America\/New_York'\)/)
  for (const part of ["'projects'", "'events'", "'todos'", "'grocery'", "'checklist'", "'ticked'"]) assert.ok(sql.includes(part), part)
  assert.match(sql, /too late to undo the whole plan/)
})

test('the scenario covers it end to end', () => {
  for (let n = 1; n <= 8; n++) assert.match(scenario, new RegExp(`FAIL ${n}\\b`), `check ${n}`)
})
