import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { truncateRecurrenceLinesForFuture } from '../src/lib/recurring-event-editor-core.ts'

const migration = readFileSync(
  resolve('supabase/migrations/20260715234000_recurring_event_editor_contract.sql'),
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
const quickActions = readFileSync(
  resolve('src/hooks/useRecurringQuickAction.ts'),
  'utf8',
)
const eventDetail = readFileSync(
  resolve('src/components/calendar/EventDetailPanel.tsx'),
  'utf8',
)
const eventLocation = readFileSync(
  resolve('src/lib/eventLocation.ts'),
  'utf8',
)

test('future split truncates RRULE without discarding companion recurrence lines', () => {
  assert.deepEqual(
    truncateRecurrenceLinesForFuture(
      [
        'RRULE:FREQ=WEEKLY;COUNT=20;BYDAY=MO',
        'EXDATE:20260720T140000Z',
      ],
      '2026-07-27T14:00:00Z',
    ),
    [
      'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260727T135959Z',
      'EXDATE:20260720T140000Z',
    ],
  )
})

test('editor context returns effective and template bundles with truthful impacts', () => {
  assert.match(migration, /recurrence_get_editor_context_core/)
  assert.match(migration, /recurrence_build_event_snapshot\(v_selected\.id\)/)
  assert.match(migration, /recurrence_build_event_snapshot\(v_template\.id\)/)
  assert.match(migration, /'inherited_paths'/)
  assert.match(migration, /'occurrence_count'/)
  assert.match(migration, /'exception_count'/)
  assert.match(migration, /ownership/)
  assert.match(migration, /grant execute on function public\.recurrence_get_editor_context_core\(uuid\)\s+to service_role/)
})

test('propagated schedule and location edits preserve concrete exception paths', () => {
  for (const path of [
    'event.startTime',
    'event.endTime',
    'event.durationMs',
    'event.locationName',
    'event.address',
    'event.lat',
    'event.lng',
  ]) {
    assert.match(
      migration,
      new RegExp(`recurrence_path_is_inherited\\(v_event\\.exception_paths, '${path.replace('.', '\\.')}'\\)`),
    )
  }
  assert.match(
    migration,
    /p_respect_exceptions and p_patch \? 'duration_ms'[\s\S]*start_time \+ \(\(p_patch->>'duration_ms'\)::bigint/,
  )
})

test('editor endpoint gates rollout and submits one revision-guarded mutation', () => {
  assert.match(endpoint, /recurrence_v2_read/)
  assert.match(endpoint, /recurrence_v2_write/)
  assert.match(endpoint, /recurrence_get_editor_context_core/)
  assert.match(endpoint, /recurrence_apply_scoped_mutation_core/)
  assert.match(endpoint, /p_expected_series_revision: body\.expected_series_revision/)
  assert.match(endpoint, /conflict[\s\S]*Your draft is still here/)
  assert.match(endpoint, /materialize-recurring-events/)
  assert.doesNotMatch(endpoint, /update-recurring-google|delete\(\)\.eq\('recurrence_master_id'/)
})

test('canonical editor loads inheritance, retains errors, and avoids legacy autosave', () => {
  assert.match(editor, /event\.series_id && event\.record_kind === 'occurrence'/)
  assert.match(editor, /loadRecurringEditorContext\(event\.id\)/)
  assert.match(editor, /recurringContext\.exception_paths\.length/)
  assert.match(editor, /recurringActionIdRef/)
  assert.match(editor, /saveRecurringEditorMutation/)
  assert.match(editor, /await qc\.refetchQueries/)
  assert.match(editor, /if \(isCanonicalOccurrence && recurringEditorEnabled\)[\s\S]*doCanonicalSave/)
  assert.match(editor, /if \(isInstance\) return\s+\/\/ recurring: use manual Save/)
  assert.match(editor, /error=\{saveError\}/)
})

test('advanced and single-event recurrence conversions fail closed', () => {
  assert.match(editor, /Converting a recurring series into one event is not available/)
  assert.match(editor, /advanced recurrence dates/)
  assert.match(editor, /disabled=\{isCanonicalOccurrence && recurringEditorEnabled\}/)
  assert.match(editor, /repeat-pattern change must apply to this and following events/)
})

test('canonical quick actions share the revision-guarded recurrence command', () => {
  assert.match(quickActions, /event\?\.series_id && event\.record_kind === 'occurrence'/)
  assert.match(quickActions, /loadRecurringEditorContext\(eventId\)/)
  assert.match(quickActions, /saveRecurringEditorMutation/)
  assert.match(quickActions, /expected_series_revision: context\.series\.revision/)
  assert.match(quickActions, /await queryClient\.refetchQueries/)
  assert.match(quickActions, /actionIdRef\.current/)
  assert.doesNotMatch(quickActions, /sync-event-to-google|update-recurring-google/)
})

test('address, category, assignments, and transportation use scoped quick actions', () => {
  for (const path of [
    'event.locationName',
    'event.address',
    'assignments',
    'enrichment',
    'transportationPlan',
  ]) {
    assert.match(eventDetail, new RegExp(`['"]${path.replace('.', '\\.')}['"]`))
  }
  assert.match(eventDetail, /<RecurrenceScopeDialog \{\.\.\.recurringQuickAction\.dialog\} \/>/)
  assert.match(eventDetail, /assignments:[\s\S]*transportation_plan: nextPlan/)
  assert.match(eventDetail, /event\.series_id/)
})

test('occurrence progress remains direct and rolls back failed optimistic state', () => {
  assert.match(eventDetail, /event_checklist_items[\s\S]*setLocalChecked\(\(prev\) => \(\{ \.\.\.prev, \[item\.id\]: previous \}\)\)/)
  assert.match(eventDetail, /event_action_items[\s\S]*setLocalCompleted\(\(prev\) => \(\{ \.\.\.prev, \[item\.id\]: previous \}\)\)/)
  assert.doesNotMatch(eventDetail, /changedPaths: \[['"]checklistDefinitions/)
  assert.doesNotMatch(eventDetail, /changedPaths: \[['"]actionDefinitions/)
})

test('editing any address requires a fresh human review', () => {
  assert.match(eventLocation, /verified: false/)
  assert.doesNotMatch(eventLocation, /verified: trusted/)
  assert.match(eventDetail, /setVerifiedOverride\(false\)/)
})
