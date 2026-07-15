import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface RecurrenceOperation {
  id: string
  action_id: string
  operation_key: string
  series_id: string
  event_id: string | null
  operation_type: string
  casa_revision: number
  status: 'pending' | 'retrying' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  attempts: number
  max_attempts: number
  next_retry_at: string
  last_attempt_at: string | null
  last_error: string | null
  correlation_id: string
  conflict_detected: boolean
  completed_at: string | null
  created_at: string
  event_title: string | null
  google_email: string | null
  connection_health: string | null
}

export interface RecurrenceOperationsSummary {
  active_syncs: number
  failed_syncs: number
  casa_wins_conflicts: number
  tombstones: number
  pending_imports: number
  migration_anomalies: number
  rollout_flags: {
    recurrence_v2_read?: boolean
    recurrence_v2_write?: boolean
    google_sync_v2?: boolean
    recurrence_v2_delete?: boolean
  }
}

export function useRecurrenceOperations() {
  return useQuery({
    queryKey: ['recurrence-operations'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [summaryResult, operationsResult] = await Promise.all([
        supabase.from('recurrence_operations_summary').select('*').single(),
        supabase
          .from('recurrence_sync_operation_status')
          .select('*')
          .in('status', ['pending', 'retrying', 'running', 'failed'])
          .order('created_at', { ascending: false })
          .limit(20),
      ])
      if (summaryResult.error) throw summaryResult.error
      if (operationsResult.error) throw operationsResult.error
      return {
        summary: summaryResult.data as RecurrenceOperationsSummary,
        operations: (operationsResult.data ?? []) as RecurrenceOperation[],
      }
    },
  })
}

export function useRetryRecurrenceOperation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (operationId: string) => {
      const { error } = await supabase.rpc('recurrence_request_google_sync_retry', {
        p_operation_id: operationId,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recurrence-operations'] }),
  })
}
