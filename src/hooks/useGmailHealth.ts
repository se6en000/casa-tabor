import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { summarizeGmailHealth, type GmailConnectionHealthRow, type GmailHealthSummary } from '../utils/gmailHealth'

export interface GmailAccountHealth extends GmailConnectionHealthRow {
  family_member_id: string
  google_email: string | null
}

export function useGmailHealth() {
  const qc = useQueryClient()

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['gmail-health-summary'],
    queryFn: async () => {
      const { data: rows, error: queryError } = await supabase
        .from('google_connection_status')
        .select('family_member_id, google_email, gmail_scan_enabled, health_status, reauthorization_required, last_sync_error, last_sync_at, gmail_last_scan_attempt_at, gmail_last_scan_success_at, gmail_last_scan_error')

      if (queryError) throw queryError

      const typedRows = (rows ?? []) as GmailAccountHealth[]
      const summary = summarizeGmailHealth(typedRows)

      return {
        summary,
        accounts: typedRows,
      }
    },
    staleTime: 5 * 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      const [gmailRes, calRes] = await Promise.allSettled([
        supabase.functions.invoke('scan-gmail-inbox', {}),
        supabase.functions.invoke('sync-calendars', {}),
      ])

      if (gmailRes.status === 'rejected' && calRes.status === 'rejected') {
        throw new Error('Sync attempt failed to reach the server.')
      }

      return { gmail: gmailRes, cal: calRes }
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['gmail-health-summary'] }),
        qc.invalidateQueries({ queryKey: ['actions-hub-gmail-health'] }),
        qc.invalidateQueries({ queryKey: ['calendar-connections'] }),
        qc.invalidateQueries({ queryKey: ['events'] }),
      ])
    },
  })

  const defaultSummary: GmailHealthSummary = {
    status: 'healthy',
    label: 'Email sync OK',
    tone: 'success',
    lastSyncAt: null,
    isDown: false,
  }

  return {
    summary: data?.summary ?? defaultSummary,
    accounts: data?.accounts ?? [],
    isDown: data?.summary?.isDown ?? false,
    isLoading,
    isError,
    error,
    refetch,
    syncNow: syncMutation.mutateAsync,
    isSyncing: syncMutation.isPending,
  }
}
