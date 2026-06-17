import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { PrepItem } from '../types'

let _prepRealtimeSubscribers = 0
let _prepRealtimeChannel: ReturnType<typeof supabase.channel> | null = null
const _prepInvalidateCallbacks = new Set<() => void>()
let _prepDebounceTimer: ReturnType<typeof setTimeout> | null = null

function _firePrepInvalidation() {
  if (_prepDebounceTimer) clearTimeout(_prepDebounceTimer)
  _prepDebounceTimer = setTimeout(() => {
    _prepDebounceTimer = null
    _prepInvalidateCallbacks.forEach((f) => f())
  }, 400)
}

function useRealtimePrepInvalidation() {
  const qc = useQueryClient()

  useEffect(() => {
    const cb = () => qc.invalidateQueries({ queryKey: ['prep-items'] })
    _prepInvalidateCallbacks.add(cb)
    _prepRealtimeSubscribers++

    if (_prepRealtimeSubscribers === 1) {
      _prepRealtimeChannel = supabase
        .channel('prep_items_realtime_singleton')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'prep_items' }, _firePrepInvalidation)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'prep_item_suppressions' }, _firePrepInvalidation)
        .subscribe()
    }

    return () => {
      _prepInvalidateCallbacks.delete(cb)
      _prepRealtimeSubscribers--
      if (_prepRealtimeSubscribers === 0 && _prepRealtimeChannel) {
        supabase.removeChannel(_prepRealtimeChannel)
        _prepRealtimeChannel = null
      }
    }
  }, [qc])
}

/** Returns all undismissed, un-snoozed prep/action items ordered by urgency */
export function usePrepItems() {
  useRealtimePrepInvalidation()

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

interface GmailContext {
  subject: string | null
  from_email: string | null
  received_at: string | null
  processed_at: string
  email_body: string | null
}

interface PrepItemDetails {
  relatedItems: PrepItem[]
  gmailContext: GmailContext | null
}

function getGmailMessageId(sourceRef: string | null | undefined): string | null {
  if (!sourceRef) return null
  if (!sourceRef.startsWith('gmail:')) return null
  const [, messageId] = sourceRef.split(':')
  return messageId || null
}

export function usePrepItemDetails(item: PrepItem | null) {
  return useQuery({
    queryKey: ['prep-item-details', item?.id ?? null, item?.source_ref ?? null],
    enabled: !!item,
    queryFn: async (): Promise<PrepItemDetails> => {
      if (!item) return { relatedItems: [], gmailContext: null }

      const relatedPromise = item.source_ref
        ? supabase
            .from('prep_items')
            .select('*')
            .eq('source_ref', item.source_ref)
            .order('priority', { ascending: false })
            .order('due_by', { ascending: true })
            .limit(12)
        : Promise.resolve({ data: [], error: null } as const)

      const messageId = getGmailMessageId(item.source_ref)
      const gmailPromise = messageId
        ? supabase
            .from('gmail_processed_messages')
            .select('subject, from_email, received_at, processed_at, email_body')
            .eq('gmail_message_id', messageId)
            .order('processed_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as const)

      const [{ data: relatedItems, error: relatedErr }, { data: gmailContext, error: gmailErr }] = await Promise.all([
        relatedPromise,
        gmailPromise,
      ])

      if (relatedErr) throw relatedErr
      if (gmailErr) throw gmailErr

      return {
        relatedItems: (relatedItems ?? []) as PrepItem[],
        gmailContext: (gmailContext ?? null) as GmailContext | null,
      }
    },
    staleTime: 60_000,
  })
}
