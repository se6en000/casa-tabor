import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Conflict } from '../types'
import { type SnoozeDuration, computeSnoozeUntil } from '../utils/snoozeDuration'
import { usePageVisibility } from './usePageVisibility'

// ── Singleton Realtime Channel for Conflicts ───────────────────────────────
let _conflictsRealtimeChannel: ReturnType<typeof supabase.channel> | null = null
let _conflictsSubscribers = 0
let _conflictsDebounceTimer: ReturnType<typeof setTimeout> | null = null
const _conflictsInvalidateCallbacks = new Set<() => void>()

function fireConflictsInvalidation() {
  if (_conflictsDebounceTimer) clearTimeout(_conflictsDebounceTimer)
  _conflictsDebounceTimer = setTimeout(() => {
    _conflictsDebounceTimer = null
    _conflictsInvalidateCallbacks.forEach((cb) => {
      try {
        cb()
      } catch (err) {
        console.warn('[ConflictsRealtime] Error executing invalidation callback:', err)
      }
    })
  }, 800)
}

function useConflictsRealtimeInvalidation() {
  const qc = useQueryClient()
  const isPageVisible = usePageVisibility()

  useEffect(() => {
    if (!isPageVisible) return
    const invalidate = () => qc.invalidateQueries({ queryKey: ['conflicts'] })
    _conflictsInvalidateCallbacks.add(invalidate)
    _conflictsSubscribers++

    if (_conflictsSubscribers === 1 && !_conflictsRealtimeChannel) {
      _conflictsRealtimeChannel = supabase
        .channel('conflicts-realtime-singleton')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conflicts' }, fireConflictsInvalidation)
        .subscribe()
    }

    return () => {
      _conflictsInvalidateCallbacks.delete(invalidate)
      _conflictsSubscribers--
      if (_conflictsSubscribers === 0 && _conflictsRealtimeChannel) {
        supabase.removeChannel(_conflictsRealtimeChannel)
        _conflictsRealtimeChannel = null
        if (_conflictsDebounceTimer) {
          clearTimeout(_conflictsDebounceTimer)
          _conflictsDebounceTimer = null
        }
      }
    }
  }, [isPageVisible, qc])
}

export function useWeekConflicts() {
  useConflictsRealtimeInvalidation()

  return useQuery({
    queryKey: ['conflicts', 'week'],
    queryFn: async (): Promise<Conflict[]> => {
      const now = new Date()
      const todayISO = now.toISOString()
      const { data, error } = await supabase
        .from('conflicts')
        .select('*, event_a:events!event_a_id(id, start_time, title, event_type), event_b:events!event_b_id(id, start_time, title, event_type)')
        .eq('resolved', false)
        .or(`snoozed_until.is.null,snoozed_until.lte.${todayISO}`)
        .order('severity', { ascending: false })
      if (error) throw error
      // Client-side guard: never show conflicts for past events even if server cleanup hasn't run yet
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      return (data ?? []).filter((c) => {
        const eventStart = c.event_a?.start_time ? new Date(c.event_a.start_time).getTime() : Infinity
        return eventStart >= todayStart &&
          c.event_a?.event_type !== 'reminder' &&
          c.event_b?.event_type !== 'reminder'
      })
    },
    staleTime: 5 * 60_000,
    refetchInterval: false,
  })
}

export function useResolveConflict() {
  const qc = useQueryClient()
  return async (id: string, resolution: string) => {
    await supabase
      .from('conflicts')
      .update({ resolved: true, resolution, resolved_at: new Date().toISOString() })
      .eq('id', id)
    qc.invalidateQueries({ queryKey: ['conflicts'] })
  }
}

export function useSnoozeConflict() {
  const qc = useQueryClient()
  return async (id: string, duration: SnoozeDuration = 'tomorrow') => {
    const snoozedUntil = computeSnoozeUntil(duration, new Date())
    const { data, error } = await supabase.rpc('snooze_conflict', {
      p_conflict_id: id,
      p_snoozed_until: snoozedUntil.toISOString(),
    })
    if (error) throw error
    if (!data?.ok) throw new Error('Casa could not snooze this conflict.')
    qc.invalidateQueries({ queryKey: ['conflicts'] })
  }
}
