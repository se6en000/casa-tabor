import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { EventWithDetails } from './useCalendarEvents'
import type { EventLocationScope } from '../lib/eventLocation'
import type { RecurrenceScopeOperation } from '../lib/recurrenceScopePresentation'
import {
  loadRecurringEditorContext,
  announceRecurringSave,
  saveRecurringEditorMutation,
  truncateRecurrenceLinesForFuture,
  type RecurringEditorContext,
} from '../lib/recurringEventEditor'

export interface RecurringQuickActionRequest {
  operation: RecurrenceScopeOperation
  changedPaths: string[]
  detailPatch: Record<string, unknown>
}

interface PendingQuickAction extends RecurringQuickActionRequest {
  resolve: (result: RecurringQuickActionResult) => void
  reject: (error: Error) => void
}

export type RecurringQuickActionResult = 'handled' | 'legacy' | 'cancelled'

export function useRecurringQuickAction(event: EventWithDetails | null) {
  const queryClient = useQueryClient()
  const canonical = Boolean(event?.series_id && event.record_kind === 'occurrence')
  const [context, setContext] = useState<RecurringEditorContext | null>(null)
  const [loadedEventId, setLoadedEventId] = useState<string | null>(null)
  const [failedEventId, setFailedEventId] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [writable, setWritable] = useState(false)
  const [loadingContext, setLoadingContext] = useState(false)
  const [pending, setPending] = useState<PendingQuickAction | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const actionIdRef = useRef<string | null>(null)

  const eventId = event?.id
  const reloadContext = useCallback(async () => {
    if (!eventId || !canonical) return null
    setLoadingContext(true)
    try {
      const result = await loadRecurringEditorContext(eventId)
      setFailedEventId(null)
      setEnabled(result.enabled)
      setWritable(Boolean(result.writable))
      setContext(result.context ?? null)
      return result.context ?? null
    } catch (cause) {
      setFailedEventId(eventId)
      throw cause
    } finally {
      setLoadedEventId(eventId)
      setLoadingContext(false)
    }
  }, [canonical, eventId])

  useEffect(() => {
    if (!canonical) return
    const timer = window.setTimeout(() => {
      void reloadContext().catch((cause: Error) => {
        setError(`Could not load recurring series details: ${cause.message}`)
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [canonical, reloadContext])

  const request = useCallback((quickAction: RecurringQuickActionRequest): Promise<RecurringQuickActionResult> => {
    if (!canonical) return Promise.resolve('legacy')
    if (pending) {
      return Promise.reject(new Error('Finish or cancel the current recurring event change first.'))
    }
    if (loadedEventId !== eventId) {
      return Promise.reject(new Error('Recurring series details are still loading. Please try again in a moment.'))
    }
    if (failedEventId === eventId) {
      return Promise.reject(new Error('Recurring series details could not be loaded. Retry before changing this event.'))
    }
    if (!enabled) return Promise.resolve('legacy')
    if (!writable) {
      return Promise.reject(new Error('This read-only Google series must be explicitly adopted before Casa can edit it.'))
    }
    if (!context) {
      return Promise.reject(new Error(
        loadingContext
          ? 'Recurring series details are still loading. Please try again in a moment.'
          : 'Recurring series details are unavailable.',
      ))
    }
    setError(null)
    return new Promise<RecurringQuickActionResult>((resolve, reject) => {
      setPending({ ...quickAction, resolve, reject })
    })
  }, [canonical, context, enabled, eventId, failedEventId, loadedEventId, loadingContext, pending, writable])

  const cancel = useCallback(() => {
    pending?.resolve('cancelled')
    setPending(null)
    setError(null)
    actionIdRef.current = null
  }, [pending])

  const executeScope = useCallback(async (
    quickAction: RecurringQuickActionRequest,
    scope: EventLocationScope,
  ): Promise<boolean> => {
    if (!event || !canonical) return false
    if (loadedEventId !== eventId) throw new Error('Recurring series details are still loading. Please try again in a moment.')
    if (failedEventId === eventId) throw new Error('Recurring series details could not be loaded. Retry before changing this event.')
    if (!enabled) return false
    if (!writable) throw new Error('This read-only Google series must be explicitly adopted before Casa can edit it.')
    if (!context) throw new Error('Recurring series details are unavailable.')
    setSaving(true)
    setError(null)
    try {
      const seriesPatch: Record<string, unknown> = { timezone: context.series.timezone }
      if (scope === 'future') {
        const originalStart = event.original_start_time ?? (
          event.original_start_date ? `${event.original_start_date}T00:00:00Z` : event.start_time
        )
        seriesPatch.original_recurrence_lines = truncateRecurrenceLinesForFuture(
          context.series.recurrence_lines,
          originalStart,
        )
        seriesPatch.future_recurrence_lines = context.series.recurrence_lines
      } else if (scope === 'all') {
        seriesPatch.recurrence_lines = context.series.recurrence_lines
      }
      const actionId = actionIdRef.current ?? crypto.randomUUID()
      actionIdRef.current = actionId
      const result = await saveRecurringEditorMutation({
        selected_event_id: event.id,
        action_id: actionId,
        scope,
        expected_series_revision: context.series.revision,
        changed_paths: quickAction.changedPaths,
        detail_patch: quickAction.detailPatch,
        series_patch: seriesPatch,
      })
      actionIdRef.current = null
      announceRecurringSave({
        title: event.title,
        affected_occurrences: result.result?.affected_occurrences ?? 0,
        google_sync_status: result.result?.google_sync_status ?? 'not_enabled',
      })
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      await queryClient.refetchQueries({ queryKey: ['events'], type: 'active' })
      await reloadContext()
      return true
    } catch (cause) {
      const failure = cause instanceof Error ? cause : new Error('Could not save this recurring event change.')
      setError(failure.message)
      throw failure
    } finally {
      setSaving(false)
    }
  }, [canonical, context, enabled, event, eventId, failedEventId, loadedEventId, queryClient, reloadContext, writable])

  const selectScope = useCallback(async (scope: EventLocationScope) => {
    if (!pending) return
    try {
      await executeScope(pending, scope)
      pending.resolve('handled')
      setPending(null)
    } catch {
      // Keep the decision surface and caller draft open for retry.
    }
  }, [executeScope, pending])

  const impacts = useMemo(() => context
    ? {
        this: {
          affectedCount: context.impacts.this.occurrence_count,
          preservedExceptionCount: context.impacts.this.exception_count,
        },
        future: {
          affectedCount: context.impacts.future.occurrence_count,
          preservedExceptionCount: context.impacts.future.exception_count,
        },
        all: {
          affectedCount: context.impacts.all.occurrence_count,
          preservedExceptionCount: context.impacts.all.exception_count,
        },
      }
    : undefined, [context])

  return {
    request,
    executeScope,
    handlesCanonical: canonical && enabled,
    dialog: {
      open: Boolean(pending),
      operation: pending?.operation ?? 'update',
      selectedStart: event?.start_time,
      impacts,
      loading: saving,
      error,
      onClose: cancel,
      onSelect: selectScope,
    },
  }
}
