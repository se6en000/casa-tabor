import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

// Jake, 2026-09-28: "I need the ability to tap into the projects and the reminders … to edit/modify/
// delete them … modify the project steps, reorganize, delete steps … small reminders I should be able
// to modify, remove a time/date, add a time/date, change the title" — and "a goal/target date".
const path = new URL('../supabase/migrations/20260928160000_todo_editing.sql', import.meta.url)
const sql = existsSync(path) ? readFileSync(path, 'utf8') : ''

test('one edit function for a project, every change followed by keeping the phone in step', () => {
  assert.match(sql, /create or replace function public\.todo_project_edit\(p_project uuid, p_op text, p_args jsonb default '\{\}'::jsonb\)/)
  for (const op of ['rename', 'target', 'add_step', 'edit_step', 'move_step', 'delete_step', 'done_step', 'undo_step', 'delete_project']) assert.match(sql, new RegExp(`'${op}'`), op)
  assert.match(sql, /perform public\.todo_project_sync\(p_project\)/)
})

test('sync: the first unfinished step owns the one reminder — renamed, moved, created, or removed when none is left', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.todo_project_sync'), sql.indexOf('create or replace function public.todo_project_edit'))
  assert.match(fn, /order by position/)
  assert.match(fn, /v_project\.title \|\| ': ' \|\| v_current\.title/)
  assert.match(fn, /purge_after/)
})

test('a single to-do: title, a date with or without a time, or no date; and delete', () => {
  assert.match(sql, /create or replace function public\.todo_update\(p_id uuid, p_patch jsonb\)/)
  assert.match(sql, /create or replace function public\.todo_delete\(p_id uuid\)/)
  assert.match(sql, /has_due_date = false/)
  assert.match(sql, /interval '17 hours'/)
})

test('all of it server-side only', () => {
  for (const fn of ['todo_project_edit', 'todo_project_sync', 'todo_update', 'todo_delete']) assert.match(sql, new RegExp(`revoke execute on function public\\.${fn}`), fn)
})
