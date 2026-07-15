import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(
  resolve('supabase/migrations/20260715235000_recurring_delete_undo.sql'),
  'utf8',
)
const endpoint = readFileSync(
  resolve('supabase/functions/recurring-event-editor/index.ts'),
  'utf8',
)
const editor = readFileSync(
  resolve('src/components/calendar/EventEditSheet.tsx'),
  'utf8',
)
const undoHost = readFileSync(
  resolve('src/components/calendar/RecurringDeleteUndoHost.tsx'),
  'utf8',
)
const calendarReads = readFileSync(
  resolve('src/hooks/useCalendarEvents.ts'),
  'utf8',
)
const assistant = readFileSync(
  resolve('supabase/functions/ai-assistant/index.ts'),
  'utf8',
)
const googleImport = readFileSync(
  resolve('supabase/migrations/20260715232000_google_recurrence_import.sql'),
  'utf8',
)

test('scoped delete tombstones exact active event IDs for 30 days', () => {
  assert.match(migration, /create or replace function public\.recurrence_delete_scoped_core/)
  assert.match(migration, /v_undo_until timestamptz := now\(\) \+ interval '30 days'/)
  assert.match(migration, /and deleted_at is null/)
  assert.match(migration, /where id = any\(v_affected_ids\)/)
  assert.match(migration, /'affected_event_ids', to_jsonb\(v_affected_ids\)/)
  assert.match(migration, /tombstone_origin = 'user'/)
})

test('future deletion truncates recurrence and Undo restores the prior rule', () => {
  assert.match(migration, /Future deletion requires original_recurrence_lines/)
  assert.match(migration, /recurrence_lines = p_series_patch->'original_recurrence_lines'/)
  assert.match(
    migration,
    /recurrence_lines = v_delete\.before_state->'series'->'recurrence_lines'/,
  )
  assert.match(editor, /truncateRecurrenceLinesForFuture/)
  assert.match(editor, /seriesPatch\.original_recurrence_lines/)
})

test('Undo is idempotent, revision guarded, bounded, and compensating', () => {
  assert.match(migration, /create or replace function public\.recurrence_undo_delete_core/)
  assert.match(migration, /where action_id = p_action_id/)
  assert.match(migration, /The 30-day Undo window has expired/)
  assert.match(migration, /p_expected_series_revision is distinct from v_series\.revision/)
  assert.match(migration, /undone_at = now\(\), undone_by_history_id = v_existing\.id/)
  assert.match(migration, /reverted_history_id/)
  assert.doesNotMatch(migration, /errcode = '40001'/)
})

test('purge waits for Google confirmation and never purges an undone delete', () => {
  assert.match(migration, /create or replace function public\.recurrence_purge_deleted_core/)
  assert.match(migration, /and undone_at is null/)
  assert.match(migration, /operation\.status = 'succeeded'/)
  assert.match(migration, /if v_series\.source_connection_id is not null and not exists/)
  assert.match(migration, /recurrence-v2-purge-deleted/)
})

test('delete service is independently gated and awaits occurrence materialization', () => {
  assert.match(endpoint, /flags\.recurrence_v2_delete/)
  assert.match(endpoint, /recurrence_delete_scoped_core/)
  assert.match(endpoint, /recurrence_undo_delete_core/)
  assert.match(endpoint, /if \(body\.scope !== 'all'\)/)
  assert.match(endpoint, /Casa deleted the selected events, but occurrence refresh failed/)
  assert.match(endpoint, /Casa restored the series, but occurrence refresh failed/)
})

test('calendar deletion uses scope UX and exposes actionable Undo', () => {
  assert.match(editor, /operation="delete"/)
  assert.match(editor, /deleteRecurringEditorMutation/)
  assert.match(editor, /announceRecurringDelete/)
  assert.match(editor, /await qc\.refetchQueries/)
  assert.match(undoHost, /actionLabel=\{receipt \?/)
  assert.match(undoHost, /undoRecurringEditorDelete/)
  assert.match(undoHost, /expectedSeriesRevision: receipt\.series_revision/)
})

test('tombstones are hidden from calendar and authoritative assistant reads', () => {
  assert.match(calendarReads, /\.is\('deleted_at', null\)[\s\S]*\.neq\('status', 'cancelled'\)/)
  assert.match(assistant, /\.is\('deleted_at', null\)[\s\S]*\.eq\('status', 'confirmed'\)/)
})

test('Google recurrence adoption reuses a deleted series instead of resurrecting a duplicate', () => {
  assert.match(
    googleImport,
    /where source_connection_id = v_connection\.id[\s\S]*google_recurring_event_id = v_resource\.google_event_id/,
  )
  const existingBranch = googleImport.match(/if found then([\s\S]*?)return jsonb_build_object\('series_id', v_existing\.id, 'created', false\);/)?.[1] ?? ''
  assert.doesNotMatch(existingBranch, /status = 'active'|deleted_at = null/)
})
