import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

// P3.22 step 1 (design section 09, approved 2026-09-28): the to-do details Casa adds on top of
// Jake's Reminders. Server-only, like gift ideas and Coming up; project steps live in their own
// table so only the current step is a reminder (Casa → iOS sends every reminder event).
const path = new URL('../supabase/migrations/20260928120000_todos.sql', import.meta.url)
const sql = existsSync(path) ? readFileSync(path, 'utf8') : ''

test('three tables: details per reminder, projects, ordered steps', () => {
  assert.match(sql, /create table if not exists public\.todo_details \(\s*event_id uuid primary key references public\.events\(id\) on delete cascade/)
  assert.match(sql, /shape text not null default 'unsorted' check \(shape in \('nudge', 'quick', 'fix', 'project', 'dated', 'unsorted'\)\)/)
  assert.match(sql, /create table if not exists public\.todo_projects/)
  assert.match(sql, /create table if not exists public\.todo_steps/)
  assert.match(sql, /position integer not null/)
})

test('every foreign key has an index (GUARDRAILS.md)', () => {
  const fks = [...sql.matchAll(/(\w+) uuid (?:not null )?references public\.(\w+)/g)].map((m) => m[1]).filter((c) => c !== 'event_id')
  for (const col of fks) assert.match(sql, new RegExp(`create index if not exists \\w+ on public\\.\\w+ \\(${col}\\)`), col)
})

test('server-only: row security on, no client policies', () => {
  for (const t of ['todo_details', 'todo_projects', 'todo_steps']) assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`))
  assert.doesNotMatch(sql, /create policy/i)
})
