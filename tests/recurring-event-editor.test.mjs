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
const checklistEditor = readFileSync(
  resolve('src/components/calendar/ChecklistEditor.tsx'),
  'utf8',
)
const eventLocation = readFileSync(
  resolve('src/lib/eventLocation.ts'),
  'utf8',
)
const recurringEditorClient = readFileSync(
  resolve('src/lib/recurringEventEditor.ts'),
  'utf8',
)
const recurringToastHost = readFileSync(
  resolve('src/components/calendar/RecurringDeleteUndoHost.tsx'),
  'utf8',
)
const familyConsolidation = readFileSync(
  resolve('supabase/migrations/20260715252000_consolidate_recurrence_families.sql'),
  'utf8',
)
const exceptionPolicy = readFileSync(
  resolve('supabase/migrations/20260715261000_control_recurring_update_exceptions.sql'),
  'utf8',
)
const entireSeriesGuard = readFileSync(
  resolve('supabase/migrations/20260715262000_require_entire_series_recurrence_lines.sql'),
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
  assert.doesNotMatch(editor, /autoSave/)
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
  assert.match(quickActions, /scope === 'all'[\s\S]*seriesPatch\.recurrence_lines/)
})

test('entire series consolidates linked branches and clears reusable exceptions', () => {
  assert.match(familyConsolidation, /with recursive ancestors/)
  assert.match(familyConsolidation, /with recursive family/)
  assert.match(familyConsolidation, /set series_id = v_root\.id/)
  assert.match(familyConsolidation, /exception_paths = '\[\]'::jsonb/)
  assert.match(familyConsolidation, /is_exception = false/)
  assert.match(familyConsolidation, /Superseded by linked-family consolidation/)
  assert.match(familyConsolidation, /obsolete_google_master_ids/)
  assert.match(familyConsolidation, /'recreate_projection'/)
  assert.match(familyConsolidation, /split_occurrence_key = v_selected\.occurrence_key/)
  assert.match(editor, /scope === 'all'[\s\S]*seriesPatch\.recurrence_lines/)
})

test('recurring saves distinguish Casa persistence from queued Google sync', () => {
  assert.match(recurringEditorClient, /RECURRING_SAVE_EVENT/)
  assert.match(editor, /announceRecurringSave/)
  assert.match(quickActions, /announceRecurringSave/)
  assert.match(recurringToastHost, /saved in Casa\. Google Calendar sync is queued/)
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

test('recurring updates preserve one-offs by default and replace only edited paths on request', () => {
  assert.match(endpoint, /preserve_exceptions: body\.preserve_exceptions !== false/)
  assert.match(editor, /preserve_exceptions: preserveExceptions/)
  assert.match(quickActions, /preserve_exceptions: preserveExceptions/)
  assert.match(exceptionPolicy, /coalesce\(\(p_series_patch->>'preserve_exceptions'\)::boolean, true\)/)
  assert.match(exceptionPolicy, /path like changed_path \|\| '\.%'/)
  assert.match(exceptionPolicy, /changed_path like path \|\| '\.%'/)
  assert.match(exceptionPolicy, /v_snapshot->'patch'/)
  assert.match(exceptionPolicy, /p_detail_patch,[\s\S]*p_changed_paths/)
  assert.match(exceptionPolicy, /'exception_policy', 'replace'/)
  assert.doesNotMatch(exceptionPolicy, /exception_paths = '\[\]'::jsonb/)
  assert.match(entireSeriesGuard, /jsonb_typeof\(p_series_patch->'recurrence_lines'\) is distinct from 'array'/)
})

test('occurrence progress remains direct and rolls back failed optimistic state', () => {
  assert.match(checklistEditor, /event_checklist_items[\s\S]*setLocalChecked\(\(prev\) => \(\{ \.\.\.prev, \[item\.id\]: previous \}\)\)/)
  assert.match(eventDetail, /event_action_items[\s\S]*setLocalCompleted\(\(prev\) => \(\{ \.\.\.prev, \[item\.id\]: previous \}\)\)/)
  assert.doesNotMatch(eventDetail, /changedPaths: \[['"]checklistDefinitions/)
  assert.doesNotMatch(eventDetail, /changedPaths: \[['"]actionDefinitions/)
})

test('saved address edits stay confirmed while manual and Google edits require review', () => {
  assert.match(eventLocation, /verified: place\.source === 'saved'/)
  assert.doesNotMatch(eventLocation, /verified: trusted/)
  assert.match(eventDetail, /setVerifiedOverride\(false\)/)
})
