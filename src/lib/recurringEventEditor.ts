import type { EventLocationScope } from './eventLocation'
import { supabase } from './supabase'
export { truncateRecurrenceLinesForFuture } from './recurring-event-editor-core'

export interface RecurringEditorImpact {
  occurrence_count: number
  exception_count: number
}

export interface RecurringEditorContext {
  selected_event_id: string
  series: {
    id: string
    revision: number
    timezone: string
    recurrence_lines: string[]
    ownership: 'casa' | 'google_adopted' | 'read_only_import'
    template_event_id: string
  }
  effective_bundle: Record<string, unknown>
  template_bundle: Record<string, unknown>
  exception_paths: string[]
  inherited_paths: string[]
  impacts: Record<EventLocationScope, RecurringEditorImpact>
}

export interface RecurringEditorLoadResult {
  enabled: boolean
  writable?: boolean
  deletable?: boolean
  context?: RecurringEditorContext
}

export interface RecurringEditorMutation {
  selected_event_id: string
  action_id: string
  scope: EventLocationScope
  expected_series_revision: number
  changed_paths: string[]
  detail_patch: Record<string, unknown>
  series_patch: Record<string, unknown>
  preserve_exceptions: boolean
}

export interface RecurringDeleteMutation {
  selected_event_id: string
  action_id: string
  scope: EventLocationScope
  expected_series_revision: number
  series_patch: Record<string, unknown>
}

export interface RecurringDeleteResult {
  history_id: string
  series_id: string
  series_revision: number
  affected_occurrences: number
  undo_until: string
  google_sync_status: 'pending' | 'not_enabled'
}

export interface RecurringDeleteReceipt extends RecurringDeleteResult {
  title: string
  scope: EventLocationScope
}

export interface RecurringSaveReceipt {
  title: string
  affected_occurrences: number
  google_sync_status: 'pending' | 'not_enabled'
}

async function invokeEditor(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('recurring-event-editor', { body })
  if (error) throw new Error(error.message)
  if (!data?.success) {
    const failure = new Error(data?.error ?? 'Recurring event editor failed.')
    failure.name = data?.conflict ? 'RECURRENCE_REVISION_CONFLICT' : 'RECURRENCE_EDITOR_ERROR'
    throw failure
  }
  return data
}

export async function loadRecurringEditorContext(
  selectedEventId: string,
): Promise<RecurringEditorLoadResult> {
  return invokeEditor({ action: 'load', selected_event_id: selectedEventId })
}

export async function saveRecurringEditorMutation(mutation: RecurringEditorMutation) {
  return invokeEditor({ action: 'save', ...mutation })
}

export async function deleteRecurringEditorMutation(
  mutation: RecurringDeleteMutation,
): Promise<RecurringDeleteResult> {
  const response = await invokeEditor({ action: 'delete', ...mutation })
  return response.result as RecurringDeleteResult
}

export async function undoRecurringEditorDelete({
  deleteHistoryId,
  actionId,
  expectedSeriesRevision,
}: {
  deleteHistoryId: string
  actionId: string
  expectedSeriesRevision: number
}) {
  const response = await invokeEditor({
    action: 'undo-delete',
    delete_history_id: deleteHistoryId,
    action_id: actionId,
    expected_series_revision: expectedSeriesRevision,
  })
  return response.result as {
    history_id: string
    series_id: string
    series_revision: number
    restored_occurrences: number
    google_sync_status: 'pending' | 'not_enabled'
  }
}

export const RECURRING_DELETE_EVENT = 'casa:recurring-event-deleted'
export const RECURRING_SAVE_EVENT = 'casa:recurring-event-saved'

export function announceRecurringDelete(receipt: RecurringDeleteReceipt) {
  window.dispatchEvent(new CustomEvent<RecurringDeleteReceipt>(RECURRING_DELETE_EVENT, {
    detail: receipt,
  }))
}

export function announceRecurringSave(receipt: RecurringSaveReceipt) {
  window.dispatchEvent(new CustomEvent<RecurringSaveReceipt>(RECURRING_SAVE_EVENT, {
    detail: receipt,
  }))
}
