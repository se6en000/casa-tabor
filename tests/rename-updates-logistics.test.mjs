import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// A rename reaches the step-by-step plan (2026-09-27): the database does it, so every path is covered.
const sql = readFileSync(new URL('../supabase/migrations/20260927130000_rename_updates_logistics_steps.sql', import.meta.url), 'utf8')

test('a rename swaps the old name for the new one in that event\'s steps, in the same save', () => {
  assert.match(sql, /after update of title on public\.events/)
  assert.match(sql, /new\.title is distinct from old\.title/)
  assert.match(sql, /set title = replace\(title, old\.title, new\.title\)/)
  assert.match(sql, /description = replace\(description, old\.title, new\.title\)/)
  assert.match(sql, /where event_id = new\.id/)
})

test('it runs like the other event triggers (owner rights, fixed search path) and skips tiny titles', () => {
  assert.match(sql, /security definer\s+set search_path = public/)
  assert.match(sql, /length\(coalesce\(old\.title, ''\)\) >= 3/)
})
