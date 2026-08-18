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

  // Retry an individual event sync
  const retrySync = useMutation({
    mutationFn: async (eventId: string) => {
      const { data, error } = await supabase.functions.invoke('sync-event-to-google', {
        body: { event_id: eventId, enqueue_on_failure: true },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
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
    onSuccess: () => {
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
    onSuccess: () => {
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
  }
}
