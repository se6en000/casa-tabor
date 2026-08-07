import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL(
    '../supabase/migrations/20260807080000_add_snooze_tracking_to_prep_items_and_conflicts.sql',
    import.meta.url,
  ),
  'utf8',
)

test('adds snooze_count and last_snoozed_at to prep_items', () => {
  assert.match(source, /alter table public\.prep_items[\s\S]*?add column if not exists snooze_count integer not null default 0/)
  assert.match(source, /alter table public\.prep_items[\s\S]*?add column if not exists last_snoozed_at timestamptz/)
})

test('adds snooze_count and last_snoozed_at to conflicts', () => {
  assert.match(source, /alter table public\.conflicts[\s\S]*?add column if not exists snooze_count integer not null default 0/)
  assert.match(source, /alter table public\.conflicts[\s\S]*?add column if not exists last_snoozed_at timestamptz/)
})

test('snooze_prep_item atomically increments snooze_count and stamps last_snoozed_at', () => {
  assert.match(source, /create or replace function public\.snooze_prep_item/)
  assert.match(source, /snooze_count = snooze_count \+ 1/)
})

test('snooze_conflict atomically increments snooze_count and stamps last_snoozed_at', () => {
  assert.match(source, /create or replace function public\.snooze_conflict/)
})
