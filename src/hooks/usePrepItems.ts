import { useEffect, useId, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { PrepItem } from '../types'
import { type SnoozeDuration, computeSnoozeUntil } from '../utils/snoozeDuration'

/**
 * Returns all undismissed, un-snoozed prep items, ordered overdue-first, then priority desc,
 * then event date asc. Overdue items are NOT hidden once due_by passes -- they used to be
 * silently dropped by a `.gte(due_by, now)` filter, which meant a task you never resolved
 * simply vanished from every screen the moment its due date passed. That was the source of
 * the "task graveyard" bug: real unresolved items just disappeared with no overdue state.
 */
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
        .or(`snoozed_until.is.null,snoozed_until.lte.${now}`)
        .order('priority', { ascending: false })
        .order('due_by', { ascending: true })
      if (error) throw error
      // Overdue items (due_by already passed) surface first regardless of priority --
      // they're the most urgent thing on the list, not something to hide.
      const nowMs = Date.now()
      const rows = data ?? []
      return [...rows].sort((a, b) => {
        const aOverdue = a.due_by ? new Date(a.due_by).getTime() < nowMs : false
        const bOverdue = b.due_by ? new Date(b.due_by).getTime() < nowMs : false
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
        return 0 // preserve the priority/due_by ordering from the query within each group
      })
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

/** Snoozes a prep item for the given duration (defaults to "tomorrow" 6 AM, matching prior behavior). */
export function useSnoozePrepItem() {
  const qc = useQueryClient()
  return async (id: string, duration: SnoozeDuration = 'tomorrow') => {
    const snoozedUntil = computeSnoozeUntil(duration, new Date())
    const { data, error } = await supabase.rpc('snooze_prep_item', {
      p_prep_item_id: id,
      p_snoozed_until: snoozedUntil.toISOString(),
    })
    if (error) throw error
    if (!data?.ok) throw new Error('Casa could not snooze this action.')
    qc.invalidateQueries({ queryKey: ['prep-items'] })
  }
}

/**
 * Downvotes a prep item via the shared record_prep_item_downvote() RPC -- the
 * single source of truth for "not relevant", also used by the push-notification
 * thumbs_down action (see supabase/functions/notification-action). This records
 * real prep_item_feedback and feeds the prep_item_suppressions pattern-learning
 * loop, instead of silently dismissing with no signal.
 */
export function useDownvotePrepItem() {
  const qc = useQueryClient()
  return async (id: string) => {
    const { error } = await supabase.rpc('record_prep_item_downvote', { p_prep_item_id: id })
    if (error) throw error
    qc.invalidateQueries({ queryKey: ['prep-items'] })
  }
}

export interface PrepItemGmailContext {
  subject: string | null
  from_email: string | null
  received_at: string | null
  email_body: string | null
}

export interface PrepItemEventSnapshot {
  title: string | null
  start_time: string | null
  end_time: string | null
  all_day: boolean | null
  location_name: string | null
  address: string | null
  description: string | null
}

export interface PrepItemAttendee {
  id: string
  name: string
  color_hex: string | null
}

export interface PrepItemDetails extends PrepItem {
  relatedItems: { id: string; description: string }[]
  gmailContext: PrepItemGmailContext | null
  eventSnapshot: PrepItemEventSnapshot | null
  suggestedAssignees: PrepItemAttendee[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** The linked calendar event id for a prep item, if one can be resolved. */
function resolveLinkedEventId(item: PrepItem): string | null {
  if (item.event_id) return item.event_id
  if (item.source_type !== 'gmail' && item.source_ref && UUID_RE.test(item.source_ref)) return item.source_ref
  return null
}

/** Fetches real source context for a single prep item: gmail body, linked-event snapshot, and attendee suggestions. */
export function usePrepItemDetails(item: PrepItem | null) {
  return useQuery({
    queryKey: ['prep-item-details', item?.id],
    enabled: !!item,
    staleTime: 30_000,
    queryFn: async (): Promise<PrepItemDetails> => {
      if (!item) throw new Error('No prep item selected')

      let gmailContext: PrepItemGmailContext | null = null
      if (item.source_type === 'gmail' && item.source_ref) {
        const match = /^gmail:([^:]+):(.+)$/.exec(item.source_ref)
        if (match) {
          const [, memberId, messageId] = match
          const { data } = await supabase
            .from('gmail_processed_messages')
            .select('subject, from_email, received_at, email_body')
            .eq('family_member_id', memberId)
            .eq('gmail_message_id', messageId)
            .maybeSingle()
          gmailContext = data ?? null
        }
      }

      const linkedEventId = resolveLinkedEventId(item)
      let eventSnapshot: PrepItemEventSnapshot | null = null
      let suggestedAssignees: PrepItemAttendee[] = []

      if (linkedEventId) {
        if (item.source_type === 'calendar_ai') {
          const { data } = await supabase
            .from('events')
            .select('title, start_time, end_time, all_day, location_name, address, description')
            .eq('id', linkedEventId)
            .maybeSingle()
          eventSnapshot = data ?? null
        }

        const { data: members } = await supabase
          .from('event_members')
          .select('family_member:family_members(id, name, color_hex)')
          .eq('event_id', linkedEventId)
        suggestedAssignees = (members ?? [])
          .map((row: any) => row.family_member)
          .filter((member: PrepItemAttendee | null): member is PrepItemAttendee => !!member)
      }

      return {
        ...item,
        relatedItems: [],
        gmailContext,
        eventSnapshot,
        suggestedAssignees,
      }
    },
  })
}

/** High/Medium/Low label for a prep item's source_confidence score (0-1). */
export function prepItemConfidenceLabel(confidence: number | null | undefined): { label: string; tone: 'success' | 'warning' | 'danger' } | null {
  if (confidence == null || Number.isNaN(confidence)) return null
  if (confidence >= 0.75) return { label: 'High confidence', tone: 'success' }
  if (confidence >= 0.4) return { label: 'Medium confidence', tone: 'warning' }
  return { label: 'Low confidence', tone: 'danger' }
}

/** Assigns (or clears) a single family member responsible for a prep item. */
export function useSetPrepItemAssignee() {
  const qc = useQueryClient()
  return async (id: string, familyMemberId: string | null) => {
    await supabase
      .from('prep_items')
      .update({ assigned_to: familyMemberId })
      .eq('id', id)
      .throwOnError()
    qc.invalidateQueries({ queryKey: ['prep-items'] })
    qc.invalidateQueries({ queryKey: ['prep-item-details', id] })
  }
}

/** Updates only this prep item's own due_by — never cascades to a linked calendar event's start time. */
export function useUpdatePrepItemDueBy() {
  const qc = useQueryClient()
  return async (id: string, dueByIso: string) => {
    await supabase
      .from('prep_items')
      .update({ due_by: dueByIso })
      .eq('id', id)
      .throwOnError()
    qc.invalidateQueries({ queryKey: ['prep-items'] })
    qc.invalidateQueries({ queryKey: ['prep-item-details', id] })
  }
}
