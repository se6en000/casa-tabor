import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type {
  MemberAvailabilityException,
  MemberAvailabilityRule,
} from '../types'

function normalizedMemberIds(memberIds: string[]): string[] {
  return [...new Set(memberIds.filter(Boolean))].sort()
}

export function useMemberAvailability(memberIds: string[]) {
  const ids = normalizedMemberIds(memberIds)
  const enabled = ids.length > 0

  const rulesQuery = useQuery({
    queryKey: ['member-availability-rules', ids.join(',')],
    enabled,
    queryFn: async (): Promise<MemberAvailabilityRule[]> => {
      const { data, error } = await supabase
        .from('member_availability_rules')
        .select('*')
        .in('member_id', ids)
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })

  const exceptionsQuery = useQuery({
    queryKey: ['member-availability-exceptions', ids.join(',')],
    enabled,
    queryFn: async (): Promise<MemberAvailabilityException[]> => {
      const { data, error } = await supabase
        .from('member_availability_exceptions')
        .select('*')
        .in('member_id', ids)
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })

  return {
    rules: rulesQuery.data ?? [],
    exceptions: exceptionsQuery.data ?? [],
    isLoading: rulesQuery.isLoading || exceptionsQuery.isLoading,
    error: rulesQuery.error ?? exceptionsQuery.error ?? null,
  }
}
