import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { PrepItem } from '../types'

/** Returns all undismissed, un-snoozed prep items for upcoming events, ordered by priority desc then event date asc */
export function usePrepItems() {
  const qc = useQueryClient()

  // Realtime subscription — any INSERT/UPDATE/DELETE on prep_items invalidates immediately
  useEffect(() => {
    const channel = supabase
      .channel('prep_items_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prep_items' }, () => {
        qc.invalidateQueries({ queryKey: ['prep-items'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [qc])

  return useQuery({
    queryKey: ['prep-items'],
    queryFn: async (): Promise<PrepItem[]> => {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('prep_items')
        .select('*')
        .eq('dismissed', false)
        .gte('due_by', now)
        .or(`snoozed_until.is.null,snoozed_until.lte.${now}`)
        .order('priority', { ascending: false })
        .order('event_date', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: 60_000, // re-check every minute so snoozes auto-expire
  })
}

/** Permanently dismisses a prep item */
export function useDismissPrepItem() {
  const qc = useQueryClient()
  return async (id: string) => {
    await supabase
      .from('prep_items')
      .update({ dismissed: true, dismissed_at: new Date().toISOString() })
      .eq('id', id)
    qc.invalidateQueries({ queryKey: ['prep-items'] })
  }
}

/** Snoozes a prep item until tomorrow morning (6 AM) */
export function useSnoozePrepItem() {
  const qc = useQueryClient()
  return async (id: string) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(6, 0, 0, 0)
    await supabase
      .from('prep_items')
      .update({ snoozed_until: tomorrow.toISOString() })
      .eq('id', id)
    qc.invalidateQueries({ queryKey: ['prep-items'] })
  }
}
