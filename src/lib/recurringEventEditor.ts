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
