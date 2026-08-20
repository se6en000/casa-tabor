import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type {
  MemberAvailabilityException,
  MemberAvailabilityRule,
} from '../types'

let _availabilityRealtimeChannel: RealtimeChannel | null = null
let _availabilitySubscribers = 0
let _availabilityDebounceTimer: ReturnType<typeof setTimeout> | null = null
let _availabilityReconnectTimer: ReturnType<typeof setTimeout> | null = null
const _availabilityInvalidateCallbacks = new Set<() => void>()
const _availabilityQueryClientInstances = new Set<any>()

function _fireAvailabilityInvalidation() {
  if (_availabilityDebounceTimer) clearTimeout(_availabilityDebounceTimer)
  _availabilityDebounceTimer = setTimeout(() => {
    _availabilityDebounceTimer = null
    _availabilityInvalidateCallbacks.forEach((cb) => {
      try {
        cb()
      } catch (err) {
        console.warn('[AvailabilityRealtime] Error executing invalidation callback:', err)
      }
    })
  }, 400)
}

function _subscribeAvailabilityRealtimeChannel() {
  if (_availabilityRealtimeChannel) return
  _availabilityRealtimeChannel = supabase
    .channel('availability-realtime-singleton')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'member_availability_rules' }, _fireAvailabilityInvalidation)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'member_availability_exceptions' }, _fireAvailabilityInvalidation)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'family_members' }, _fireAvailabilityInvalidation)
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        _fireAvailabilityInvalidation()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.warn('[AvailabilityRealtime] Channel status:', status, err?.message ?? '')
        if (_availabilitySubscribers > 0 && !_availabilityReconnectTimer) {
          _availabilityReconnectTimer = setTimeout(() => {
            _availabilityReconnectTimer = null
            if (_availabilitySubscribers > 0 && _availabilityRealtimeChannel) {
              try { supabase.removeChannel(_availabilityRealtimeChannel) } catch {}
              _availabilityRealtimeChannel = null
              _subscribeAvailabilityRealtimeChannel()
            }
          }, 3000)
        }
      }
    })
}

function useRealtimeAvailabilityInvalidation() {
  const qc = useQueryClient()
  useEffect(() => {
    const cb = () => {
      void qc.invalidateQueries({ queryKey: ['member-availability-rules'] })
      void qc.invalidateQueries({ queryKey: ['member-availability-exceptions'] })
      void qc.invalidateQueries({ queryKey: ['family-members'] })
      void qc.invalidateQueries({ queryKey: ['events'] })
      void qc.invalidateQueries({ queryKey: ['today-events'] })
      void qc.invalidateQueries({ queryKey: ['tomorrow-events'] })
    }
    _availabilityInvalidateCallbacks.add(cb)
    _availabilityQueryClientInstances.add(qc)
    _availabilitySubscribers++

    if (_availabilitySubscribers === 1) {
      _subscribeAvailabilityRealtimeChannel()
    }

    return () => {
      _availabilityInvalidateCallbacks.delete(cb)
      _availabilityQueryClientInstances.delete(qc)
      _availabilitySubscribers--
      if (_availabilitySubscribers === 0) {
        if (_availabilityReconnectTimer) {
          clearTimeout(_availabilityReconnectTimer)
          _availabilityReconnectTimer = null
        }
        if (_availabilityRealtimeChannel) {
          supabase.removeChannel(_availabilityRealtimeChannel)
          _availabilityRealtimeChannel = null
        }
        if (_availabilityDebounceTimer) {
          clearTimeout(_availabilityDebounceTimer)
          _availabilityDebounceTimer = null
        }
      }
    }
  }, [qc])
}

function normalizedMemberIds(memberIds: string[]): string[] {
  return [...new Set(memberIds.filter(Boolean))].sort()
}

export function useMemberAvailability(memberIds: string[]) {
  useRealtimeAvailabilityInvalidation()
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
