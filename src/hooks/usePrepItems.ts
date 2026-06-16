import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { PrepItem } from '../types'

/** Returns all undismissed, un-snoozed prep/action items ordered by urgency */
export function usePrepItems() {
  const qc = useQueryClient()
  const channelRef = useRef(`prep_items_realtime_${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    const channel = supabase
      .channel(channelRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prep_items' }, () => {
        qc.invalidateQueries({ queryKey: ['prep-items'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prep_item_suppressions' }, () => {
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
    refetchInterval: 120_000,
  })
}

/** Permanently dismisses a prep/action item */
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

/** Marks an action as not relevant and updates suppression learning */
export function useDownvotePrepItem() {
  const qc = useQueryClient()

  return async (id: string) => {
    const nowIso = new Date().toISOString()

    const { data: item, error: itemErr } = await supabase
      .from('prep_items')
      .select('id, source_type, source_pattern_key, source_ref, downvoted_count')
      .eq('id', id)
      .maybeSingle()

    if (itemErr) throw itemErr
    if (!item) return

    const patternKey = item.source_pattern_key || 'action:general'

    await supabase.from('prep_item_feedback').insert({
      prep_item_id: id,
      source_type: item.source_type ?? 'unknown',
      source_pattern_key: patternKey,
      source_ref: item.source_ref ?? null,
      feedback: 'not_relevant',
      created_at: nowIso,
    })

    const { data: suppression } = await supabase
      .from('prep_item_suppressions')
      .select('id, strength, hard_suppressed')
      .eq('pattern_key', patternKey)
      .maybeSingle()

    const nextStrength = (suppression?.strength ?? 0) + 1
    const hardSuppressed = (suppression?.hard_suppressed ?? false) || nextStrength >= 3

    if (suppression?.id) {
      await supabase
        .from('prep_item_suppressions')
        .update({
          strength: nextStrength,
          hard_suppressed: hardSuppressed,
          last_feedback_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', suppression.id)
    } else {
      await supabase
        .from('prep_item_suppressions')
        .insert({
          pattern_key: patternKey,
          strength: 1,
          hard_suppressed: false,
          last_feedback_at: nowIso,
          updated_at: nowIso,
        })
    }

    const dismissPayload = {
      dismissed: true,
      dismissed_at: nowIso,
      downvoted_count: (item.downvoted_count ?? 0) + 1,
      last_feedback_at: nowIso,
      relevance_score: -1,
    }

    await supabase
      .from('prep_items')
      .update(dismissPayload)
      .eq('id', id)

    if (nextStrength >= 2) {
      await supabase
        .from('prep_items')
        .update({ dismissed: true, dismissed_at: nowIso })
        .eq('dismissed', false)
        .eq('source_pattern_key', patternKey)
    }

    qc.invalidateQueries({ queryKey: ['prep-items'] })
  }
}
