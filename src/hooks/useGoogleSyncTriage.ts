import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { CalendarEvent } from '../types'

export interface FailedSyncJob {
  id: string
  event_id: string
  status: 'pending' | 'retrying' | 'running' | 'failed' | 'cancelled'
  attempts: number
  max_attempts: number
  last_error: string | null
  created_at: string
  updated_at: string
  event?: CalendarEvent | null
}

export function formatSyncError(error?: string | null): { title: string; detail: string } {
  if (!error) {
    return {
      title: 'Sync Rejected by Google Calendar',
      detail: 'The Google Calendar target rejected this sync update. Event remains safe in Casa.',
    }
  }
  const low = error.toLowerCase()
  if (low.includes('invalid start time') || low.includes('invalid end time')) {
    return {
      title: 'All-Day / Time Format Conflict',
      detail: 'Google Calendar rejected the date/time transition. Retrying will now automatically normalize the format.',
    }
  }
  if (low.includes('reauthorization_required') || low.includes('token') || low.includes('auth')) {
    return {
      title: 'Google Authorization Expired',
      detail: 'Google Calendar connection needs to be re-authorized in Settings.',
    }
  }
  if (low.includes('not found') || low.includes('404')) {
    return {
      title: 'Google Event Not Found',
      detail: 'The matching event was deleted or moved in Google Calendar. Retrying will recreate it cleanly.',
    }
  }
  if (low.includes('non-2xx')) {
    return {
      title: 'Temporary Sync Engine Hiccup',
      detail: 'The sync service encountered an intermittent error. Click Retry Push to reconnect.',
    }
  }
  return {
    title: 'Google Calendar Sync Error',
    detail: error.replace(/\n/g, ' ').slice(0, 140),
  }
}

export function useGoogleSyncTriage() {
  const qc = useQueryClient()
  const [selectedTriageEvent, setSelectedTriageEvent] = useState<CalendarEvent | null>(null)

  // Query failed sync jobs
  const { data: failedJobs = [], isLoading, refetch } = useQuery<FailedSyncJob[]>({
    queryKey: ['google-sync-triage'],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: jobs, error } = await supabase
        .from('google_sync_jobs')
        .select('*, event:events(*)')
        .eq('status', 'failed')
        .order('updated_at', { ascending: false })
        .limit(20)

      if (error) {
        console.warn('[useGoogleSyncTriage] error loading failed sync jobs:', error.message)
        return []
      }
      return (jobs as unknown as FailedSyncJob[]) ?? []
    },
  })

  // Retry an individual event sync with optimistic dismissal
  const retrySync = useMutation({
    mutationFn: async (eventId: string) => {
      const { data, error } = await supabase.functions.invoke('sync-event-to-google', {
        body: { event_id: eventId, enqueue_on_failure: false },
      })
      if (error) {
        let msg = error.message
        try {
          if (error.context && typeof error.context.json === 'function') {
            const parsed = await error.context.json()
            msg = parsed?.error || parsed?.message || msg
          }
        } catch {
          // ignore
        }
        throw new Error(msg)
      }
      // Delete from google_sync_jobs
      await supabase.from('google_sync_jobs').delete().eq('event_id', eventId)
      return data
    },
    onMutate: async (eventId: string) => {
      await qc.cancelQueries({ queryKey: ['google-sync-triage'] })
      const previousJobs = qc.getQueryData<FailedSyncJob[]>(['google-sync-triage'])
      qc.setQueryData<FailedSyncJob[]>(['google-sync-triage'], (old = []) =>
        old.filter((j) => j.event_id !== eventId)
      )
      return { previousJobs }
    },
    onError: (_err, _eventId, context) => {
      if (context?.previousJobs) {
        qc.setQueryData(['google-sync-triage'], context.previousJobs)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['google-sync-triage'] })
      qc.invalidateQueries({ queryKey: ['events'] })
      setSelectedTriageEvent(null)
      refetch()
    },
  })

  // Mark an event as Casa-local only, removing the failed sync job
  const keepLocalOnly = useMutation({
    mutationFn: async (eventId: string) => {
      // 1. Delete failed sync job
      await supabase.from('google_sync_jobs').delete().eq('event_id', eventId)

      // 2. Clear remote Google references
      const { error } = await supabase
        .from('events')
        .update({
          google_event_id: null,
          google_calendar_id: null,
          google_connection_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)

      if (error) throw error
    },
    onMutate: async (eventId: string) => {
      await qc.cancelQueries({ queryKey: ['google-sync-triage'] })
      const previousJobs = qc.getQueryData<FailedSyncJob[]>(['google-sync-triage'])
      qc.setQueryData<FailedSyncJob[]>(['google-sync-triage'], (old = []) =>
        old.filter((j) => j.event_id !== eventId)
      )
      return { previousJobs }
    },
    onError: (_err, _eventId, context) => {
      if (context?.previousJobs) {
        qc.setQueryData(['google-sync-triage'], context.previousJobs)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['google-sync-triage'] })
      qc.invalidateQueries({ queryKey: ['events'] })
      setSelectedTriageEvent(null)
      refetch()
    },
  })

  // Retry all failed sync jobs in batch
  const retryAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('process-google-sync-jobs', {
        body: { limit: 25 },
      })
      if (error) throw error
      return data
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['google-sync-triage'] })
      qc.invalidateQueries({ queryKey: ['events'] })
      refetch()
    },
  })

  return {
    failedJobs,
    failedCount: failedJobs.length,
    isLoading,
    selectedTriageEvent,
    setSelectedTriageEvent,
    retrySync,
    keepLocalOnly,
    retryAll,
    refetch,
    formatSyncError,
  }
}
