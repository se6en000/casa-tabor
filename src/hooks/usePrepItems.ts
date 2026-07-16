import { useEffect, useId, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { PrepItem } from '../types'

/** Returns all undismissed, un-snoozed prep items for upcoming events, ordered by priority desc then event date asc */
export function usePrepItems() {
  const qc = useQueryClient()
  const channelId = useId()
  // Use a unique channel name per hook instance to avoid "already subscribed" errors
  // when multiple components using this hook are mounted simultaneously (e.g. during swipe)
  const channelRef = useRef(`prep_items_realtime_${channelId.replace(/:/g, '')}`)

  // Realtime subscription — any INSERT/UPDATE/DELETE on prep_items invalidates immediately
  useEffect(() => {
    const channel = supabase
      .channel(channelRef.current)
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
    staleTime: 30_000,
    refetchOnMount: false,
    refetchInterval: 120_000, // re-check every 2min so snoozes auto-expire
  })
}

type PrepItemOutcome = 'done' | 'dismissed'

function useResolvePrepItem(outcome: PrepItemOutcome) {
  const qc = useQueryClient()
  return async (id: string) => {
    const { data, error } = await supabase.rpc('resolve_prep_item', {
      p_prep_item_id: id,
      p_outcome: outcome,
    })
    if (error) throw error
    if (!data?.ok) throw new Error(`Casa could not mark this action ${outcome}.`)
    await qc.invalidateQueries({ queryKey: ['prep-items'] })
    return data
  }
}

/** Completes this action identity and its linked source when completion is supported. */
export function useCompletePrepItem() {
  return useResolvePrepItem('done')
}

/** Permanently hides this action identity without completing its linked source. */
export function useDismissPrepItem() {
  return useResolvePrepItem('dismissed')
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
      .throwOnError()
    qc.invalidateQueries({ queryKey: ['prep-items'] })
  }
}

/** Downvotes a prep item (stub — marks as dismissed with low priority) */
export function useDownvotePrepItem() {
  const qc = useQueryClient()
  return async (id: string) => {
    await supabase
      .from('prep_items')
      .update({ dismissed: true, dismissed_at: new Date().toISOString() })
      .eq('id', id)
      .throwOnError()
    qc.invalidateQueries({ queryKey: ['prep-items'] })
  }
}

/** Fetches details for a single prep item (stub — returns the item as-is from cache) */
export function usePrepItemDetails(_item: PrepItem | null) {
  return {
    data: _item ? {
      ..._item,
      relatedItems: [] as { id: string; description: string }[],
      gmailContext: null as { email_body?: string; subject?: string; from?: string; from_email?: string; date?: string; received_at?: string } | null,
    } : null,
    isLoading: false,
  }
}
