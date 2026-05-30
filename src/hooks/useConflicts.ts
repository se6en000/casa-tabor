import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Conflict } from '../types'

export function useWeekConflicts() {
  const qc = useQueryClient()
  const channelRef = useRef(`conflicts_realtime_${Math.random().toString(36).slice(2)}`)

  // Realtime — any change to conflicts table pushes instantly to all views
  useEffect(() => {
    const channel = supabase
      .channel(channelRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conflicts' }, () => {
        qc.invalidateQueries({ queryKey: ['conflicts'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [qc])

  return useQuery({
    queryKey: ['conflicts', 'week'],
    queryFn: async (): Promise<Conflict[]> => {
      const now = new Date()
      const todayISO = now.toISOString()
      const { data, error } = await supabase
        .from('conflicts')
        .select('*, event_a:events!event_a_id(id, start_time, title)')
        .eq('resolved', false)
        .or(`snoozed_until.is.null,snoozed_until.lte.${todayISO}`)
        .order('severity', { ascending: false })
      if (error) throw error
      // Client-side guard: never show conflicts for past events even if server cleanup hasn't run yet
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      return (data ?? []).filter((c) => {
        const eventStart = c.event_a?.start_time ? new Date(c.event_a.start_time).getTime() : Infinity
        return eventStart >= todayStart
      })
    },
    staleTime: 30_000,
    refetchOnMount: true,
    refetchInterval: 120_000,
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
  return async (id: string) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(6, 0, 0, 0)
    await supabase
      .from('conflicts')
      .update({ snoozed_until: tomorrow.toISOString() })
      .eq('id', id)
    qc.invalidateQueries({ queryKey: ['conflicts'] })
  }
}
