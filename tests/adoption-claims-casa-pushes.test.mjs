import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 2026-09-27: each Thursday school run existed twice in Casa — Casa's push (no connection recorded)
// and the importer's second adoption of the same Google series.
const sql = readFileSync(new URL('../supabase/migrations/20260927200000_adoption_claims_casa_pushes.sql', import.meta.url), 'utf8')
const coordinator = readFileSync(new URL('../src/lib/routineRecurrenceCoordinator.ts', import.meta.url), 'utf8')

test('the importer claims a live series with the same Google id and no connection', () => {
  assert.match(sql, /where google_recurring_event_id = v_resource\.google_event_id\s+and \(source_connection_id = v_connection\.id or source_connection_id is null\)\s+and deleted_at is null/)
  assert.match(sql, /set source_connection_id = v_connection\.id/)
  assert.match(sql, /A series never split|newer Google master|v_timing_changed/, 'keeps the edit-sync behaviour')
})

test('routine pushes now record their connection', () => {
  assert.match(coordinator, /source_connection_id: connectionId/)
})
