import { useEffect, useId, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { PrepItem } from '../types'
import { type SnoozeDuration, computeSnoozeUntil } from '../utils/snoozeDuration'
import { isExpiredEventSuggestion } from '../utils/calendarEventMatcher'
import { usePageVisibility } from './usePageVisibility'

/**
 * Returns all undismissed, un-snoozed prep items, ordered overdue-first, then priority desc,
 * then event date asc. Overdue items are NOT hidden once due_by passes -- they used to be
 * silently dropped by a `.gte(due_by, now)` filter, which meant a task you never resolved
 * simply vanished from every screen the moment its due date passed. That was the source of
 * the "task graveyard" bug: real unresolved items just disappeared with no overdue state.
 */
export function usePrepItems() {
  const qc = useQueryClient()
  const isPageVisible = usePageVisibility()
  const channelId = useId()
  // Use a unique channel name per hook instance to avoid "already subscribed" errors
  // when multiple components using this hook are mounted simultaneously (e.g. during swipe)
  const channelRef = useRef(`prep_items_realtime_${channelId.replace(/:/g, '')}`)

  // Realtime subscription — any INSERT/UPDATE/DELETE on prep_items invalidates immediately
  useEffect(() => {
    if (!isPageVisible) return
    const channel = supabase
      .channel(channelRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prep_items' }, () => {
        qc.invalidateQueries({ queryKey: ['prep-items'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isPageVisible, qc])

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
      // Overdue actionable items (due_by already passed) surface first regardless of priority --
      // they're the most urgent thing on the list.
      // Date-bound event suggestions strictly in the past are expired, not overdue todos.
      const nowMs = Date.now()
      const nowObj = new Date(nowMs)
      const rows = data ?? []
      return [...rows].sort((a, b) => {
        const isExpA = isExpiredEventSuggestion(a, nowObj)
        const isExpB = isExpiredEventSuggestion(b, nowObj)
        if (isExpA !== isExpB) return isExpA ? 1 : -1

        const aOverdue = a.due_by && !isExpA ? new Date(a.due_by).getTime() < nowMs : false
        const bOverdue = b.due_by && !isExpB ? new Date(b.due_by).getTime() < nowMs : false
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
        return 0 // preserve the priority/due_by ordering from the query within each group
      })
    },
    staleTime: 30_000,
    refetchOnMount: false,
    refetchInterval: isPageVisible ? 120_000 : false, // stop background polling when hidden
  })
}

type PrepItemOutcome = 'done' | 'dismissed'

function useResolvePrepItem(outcome: PrepItemOutcome) {
  const qc = useQueryClient()
  return async (id: string) => {
    // 1. Discover item and any sibling items sharing source_ref, cluster_id, action_key, or attention_thread_key
    const { data: item } = await supabase
      .from('prep_items')
      .select('id, source_ref, cluster_id, action_key, attention_thread_key')
      .eq('id', id)
      .maybeSingle()

    // 2. Call authoritative resolve_prep_item RPC
    const { data, error } = await supabase.rpc('resolve_prep_item', {
      p_prep_item_id: id,
      p_outcome: outcome,
    })
    if (error) throw error
    if (!data?.ok) throw new Error(`Casa could not mark this action ${outcome}.`)

    // 3. Guarantee direct dismissal of all sibling rows sharing source_ref, cluster_id, action_key, or attention_thread_key
    const nowIso = new Date().toISOString()
    if (item) {
      const orConditions: string[] = [`id.eq.${item.id}`]
      if (item.source_ref) orConditions.push(`source_ref.eq.${item.source_ref}`)
      if (item.cluster_id) orConditions.push(`cluster_id.eq.${item.cluster_id}`)
      if (item.action_key) orConditions.push(`action_key.eq.${item.action_key}`)
      if (item.attention_thread_key) orConditions.push(`attention_thread_key.eq.${item.attention_thread_key}`)

      await supabase
        .from('prep_items')
        .update({ dismissed: true, dismissed_at: nowIso })
        .or(orConditions.join(','))
    }

    await qc.invalidateQueries({ queryKey: ['prep-items'] })
    return data
  }
}

/** Completes this action identity and its linked source when completion is supported. */
export function useCompletePrepItem() {
  return useResolvePrepItem('done')
}

/** Completes multiple prep item IDs in parallel (e.g. for clustered email threads). */
export function useCompletePrepItems() {
  const completeOne = useCompletePrepItem()
  return async (ids: string[]) => {
    if (ids.length === 0) return
    await Promise.all(ids.map((id) => completeOne(id)))
  }
}

/** Permanently hides this action identity without completing its linked source. */
export function useDismissPrepItem() {
  return useResolvePrepItem('dismissed')
}

/** Snoozes a prep item for the given duration (defaults to "tomorrow" 6 AM, matching prior behavior). */
export function useSnoozePrepItem() {
  const qc = useQueryClient()
  return async (id: string, duration: SnoozeDuration = 'tomorrow', eventDateIso?: string | null) => {
    const snoozedUntil = computeSnoozeUntil(duration, new Date(), eventDateIso)
    const isoString = snoozedUntil.toISOString()

    const { data: item } = await supabase
      .from('prep_items')
      .select('id, source_ref, cluster_id, action_key')
      .eq('id', id)
      .maybeSingle()

    try {
      await supabase.rpc('snooze_prep_item', {
        p_prep_item_id: id,
        p_snoozed_until: isoString,
      })
    } catch (err) {
      console.warn('snooze_prep_item RPC warning:', err)
    }

    if (item) {
      const orConditions: string[] = [`id.eq.${item.id}`]
      if (item.source_ref) orConditions.push(`source_ref.eq.${item.source_ref}`)
      if (item.cluster_id) orConditions.push(`cluster_id.eq.${item.cluster_id}`)
      if (item.action_key) orConditions.push(`action_key.eq.${item.action_key}`)

      await supabase
        .from('prep_items')
        .update({ snoozed_until: isoString })
        .or(orConditions.join(','))
    } else {
      await supabase
        .from('prep_items')
        .update({ snoozed_until: isoString })
        .eq('id', id)
    }

    qc.invalidateQueries({ queryKey: ['prep-items'] })
  }
}

/** Snoozes multiple prep item IDs in parallel (e.g. for clustered email threads). */
export function useSnoozePrepItems() {
  const snoozeOne = useSnoozePrepItem()
  return async (ids: string[], duration: SnoozeDuration = 'tomorrow', eventDateIso?: string | null) => {
    if (ids.length === 0) return
    await Promise.all(ids.map((id) => snoozeOne(id, duration, eventDateIso)))
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
    const { data: item } = await supabase
      .from('prep_items')
      .select('id, source_ref, cluster_id, action_key')
      .eq('id', id)
      .maybeSingle()

    try {
      await supabase.rpc('record_prep_item_downvote', { p_prep_item_id: id })
    } catch (err) {
      console.warn('record_prep_item_downvote RPC warning:', err)
    }

    const nowIso = new Date().toISOString()
    if (item) {
      const orConditions: string[] = [`id.eq.${item.id}`]
      if (item.source_ref) orConditions.push(`source_ref.eq.${item.source_ref}`)
      if (item.cluster_id) orConditions.push(`cluster_id.eq.${item.cluster_id}`)
      if (item.action_key) orConditions.push(`action_key.eq.${item.action_key}`)

      await supabase
        .from('prep_items')
        .update({ dismissed: true, dismissed_at: nowIso })
        .or(orConditions.join(','))
    } else {
      await supabase
        .from('prep_items')
        .update({ dismissed: true, dismissed_at: nowIso })
        .eq('id', id)
    }

    qc.invalidateQueries({ queryKey: ['prep-items'] })
  }
}

export interface PrepItemGmailAttachment {
  filename: string
  mimeType: string
  size: number
  attachmentId?: string | null
}

export interface PrepItemGmailContext {
  subject: string | null
  from_email: string | null
  received_at: string | null
  email_body: string | null
  attachments?: PrepItemGmailAttachment[] | null
  extracted_document_summary?: string | null
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

const GMAIL_REF_RE = /^gmail:([^:]+):(.+)$/

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
        const match = GMAIL_REF_RE.exec(item.source_ref)
        if (match) {
          const [, memberId, messageId] = match
          if (UUID_RE.test(memberId)) {
            const { data } = await supabase
              .from('gmail_processed_messages')
              .select('subject, from_email, received_at, email_body, attachments, extracted_document_summary')
              .eq('family_member_id', memberId)
              .eq('gmail_message_id', messageId)
              .maybeSingle()
            gmailContext = data ?? null
          }

          if (!gmailContext) {
            const { data } = await supabase
              .from('gmail_processed_messages')
              .select('subject, from_email, received_at, email_body, attachments, extracted_document_summary')
              .eq('gmail_message_id', messageId)
              .limit(1)
              .maybeSingle()
            gmailContext = data ?? null
          }
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
