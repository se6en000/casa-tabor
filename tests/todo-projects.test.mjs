import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

// P3.22 (steps 5–6 pulled forward, Jake 2026-09-28: "I'd like Casa to handle a natural way of adding a
// large project to the to-do list"). A project is created in one go — project, ordered steps, and the
// first step as a reminder (his iOS list shows one next move) — and ticking the current step anywhere
// (the wall, his watch) brings up the next.
const path = new URL('../supabase/migrations/20260928140000_todo_projects_flow.sql', import.meta.url)
const sql = existsSync(path) ? readFileSync(path, 'utf8') : ''

test('one function creates the project, its steps and the first step\'s reminder together', () => {
  assert.match(sql, /create or replace function public\.todo_create_project\(p_title text, p_steps jsonb, p_aim_date date default null, p_from_event_id uuid default null\)/)
  const fn = sql.slice(sql.indexOf('todo_create_project'), sql.indexOf('todo_advance_project'))
  assert.match(fn, /insert into public\.todo_projects/)
  assert.match(fn, /insert into public\.todo_steps/)
  // Grown from the reminder he already captured, rather than a duplicate.
  assert.match(fn, /p_from_event_id is not null/)
  assert.match(fn, /event_type.*'reminder'/s)
})

test('ticking the current step (status → cancelled, from the wall or iOS) brings up the next, or finishes the project', () => {
  assert.match(sql, /create or replace function public\.todo_advance_project\(\)/)
  assert.match(sql, /create trigger todo_step_done_advances\s+after update of status on public\.events/i)
  const fn = sql.slice(sql.indexOf('create or replace function public.todo_advance_project'))
  assert.match(fn, /new\.status = 'cancelled'/)
  assert.match(fn, /update public\.todo_projects set status = 'done'/)
})

test('the step reminders read as "Project: step" on his phone', () => {
  assert.match(sql, /title \|\| ': ' \|\|/)
})

// "Add paint the house to my to-do list": a to-do saved the way his iOS sync saves one — undated
// (today, no due date) unless he gave a day (5 PM that day, New York time).
const addPath = new URL('../supabase/migrations/20260928150000_todo_add.sql', import.meta.url)
const addSql = existsSync(addPath) ? readFileSync(addPath, 'utf8') : ''
test('todo_add: a reminder event, undated unless a day is given, like the iOS sync', () => {
  assert.match(addSql, /create or replace function public\.todo_add\(p_title text, p_due date default null\)/)
  assert.match(addSql, /'reminder'/)
  assert.match(addSql, /interval '17 hours'/)
  assert.match(addSql, /p_due is not null/)
  assert.match(addSql, /revoke execute on function public\.todo_add/)
})
