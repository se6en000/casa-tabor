import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

// Projects, your way (FAMILY_WALL_PLAN.md P3.23, canvas rows 10–11, approved by Jake 2026-09-29).
// The flow itself runs against the real database in tests/sql/project-pages-scenario.sql (rolled back).
const path = new URL('../supabase/migrations/20260929120000_project_pages.sql', import.meta.url)
const sql = existsSync(path) ? readFileSync(path, 'utf8') : ''
const fn = (name) => sql.slice(sql.indexOf(`create or replace function public.${name}(`), sql.indexOf('$$;', sql.indexOf(`create or replace function public.${name}(`)))

test('steps side by side share a group; groups stay numbered in reading order', () => {
  assert.match(sql, /add column if not exists grp integer/)
  assert.match(sql, /update public\.todo_steps set grp = position where grp is null/)
  // A whole group keeps one number: ranked by group alone, not by group and position.
  assert.match(fn('todo_project_sync'), /dense_rank\(\) over \(order by grp\) as g/)
})

test('his phone: Now’s first step, all of Now, or nothing — never a project inside, never while paused', () => {
  const live = fn('todo_project_live_steps')
  assert.match(live, /min\(grp\)/)
  assert.match(live, /child_project_id is null/)
  assert.match(live, /\(select phone from p\) = 'now'/)
  assert.match(live, /<> 'active' or \(select phone from p\) = 'none'/)
  assert.match(sql, /check \(phone in \('next', 'now', 'none'\)\)/)
})

test('every change on the page is one op: order, details, settings, status, projects inside', () => {
  const edit = fn('todo_project_edit')
  for (const op of ['rename', 'target', 'settings', 'status', 'add_step', 'add_child', 'take_out', 'part_of', 'arrange', 'set_step', 'edit_step', 'move_to', 'move_step', 'delete_step', 'done_step', 'undo_step', 'delete_project']) {
    assert.match(edit, new RegExp(`'${op}'`), op)
  }
  assert.match(edit, /perform public\.todo_project_sync\(p_project\)/)
})

test('"the same job, many times" sets the effort; the shopping switch adds and removes the line', () => {
  const edit = fn('todo_project_edit')
  assert.match(edit, /\(p_args->>'repeat_minutes'\)::integer \* \(p_args->>'repeat_count'\)::integer/)
  assert.match(edit, /insert into public\.grocery_items \(name, last_modified_source\)/)
  assert.match(edit, /checked = false and deleted_at is null and last_modified_source = 'casa'/)
})

test('one level deep, and a project inside tells its parent when it finishes', () => {
  assert.match(fn('todo_project_can_nest'), /not exists \(select 1 from public\.todo_steps where child_project_id = p_parent\)/)
  const sync = fn('todo_project_sync')
  assert.match(sync, /where child_project_id = p_project loop/)
  assert.match(sync, /perform public\.todo_project_sync\(v_parent\)/)
})

test('a tick on his watch moves the project on through the same sync', () => {
  assert.match(fn('todo_advance_project'), /perform public\.todo_project_sync\(v_step\.project_id\)/)
})

test('all of it server-side only', () => {
  for (const f of ['todo_project_live_steps', 'todo_project_sync', 'todo_project_arrange', 'todo_project_can_nest', 'todo_project_edit']) assert.match(sql, new RegExp(`revoke execute on function public\\.${f}`), f)
})

test('the scenario file covers the flow end to end', () => {
  const scenario = readFileSync(new URL('./sql/project-pages-scenario.sql', import.meta.url), 'utf8')
  for (let n = 1; n <= 12; n++) assert.match(scenario, new RegExp(`FAIL ${n}\\b`), `check ${n}`)
  assert.match(scenario, /raise exception 'ALL PASSED'/)
})
