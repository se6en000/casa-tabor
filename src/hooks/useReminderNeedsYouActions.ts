import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { EventWithDetails } from './useCalendarEvents'
import { getEventStartDate } from '../utils/eventTime'
import { cleanEventTitle } from '../utils/eventTitle'
import { buildReminderPrepDescription } from '../utils/reminderLateness'
import { computeReminderSnoozeWindow } from '../utils/reminderSnooze'
import type { SnoozeDuration } from '../utils/snoozeDuration'
import { publishEventAggregatePatch, evictEventFromAllCaches } from '../lib/eventAggregateCache'

const ONE_HOUR_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MISSED_GRACE_MS = 10 * 60 * 1000

const REMINDER_SOURCE_MANUAL = 'reminder_manual'
const REMINDER_SOURCE_MISSED = 'reminder_missed'

type ReminderPrepSource = typeof REMINDER_SOURCE_MANUAL | typeof REMINDER_SOURCE_MISSED

export function useReminderNeedsYouActions() {
  const qc = useQueryClient()

  const invalidateReminderSurfaces = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['today-events'] }),
      qc.invalidateQueries({ queryKey: ['events'] }),
      qc.invalidateQueries({ queryKey: ['rolling-events'] }),
      qc.invalidateQueries({ queryKey: ['prep-items'] }),
    ])
    void qc.refetchQueries({ queryKey: ['events'], type: 'active' })
  }, [qc])

  const ensureReminderInNeedsYou = useCallback(async (
    event: EventWithDetails,
    sourceType: ReminderPrepSource,
  ) => {
    const activeSources = [REMINDER_SOURCE_MANUAL, REMINDER_SOURCE_MISSED]
    const { data: existing, error: existingError } = await supabase
      .from('prep_items')
      .select('id')
      .in('source_type', activeSources)
      .eq('source_ref', event.id)
      .eq('dismissed', false)
      .limit(1)

    if (existingError) throw existingError
    if (existing && existing.length > 0) return

    const now = new Date()
    const startDate = getEventStartDate(event)
    const dueBy = sourceType === REMINDER_SOURCE_MISSED ? now : new Date(startDate.getTime() + ONE_HOUR_MS)
    const priority = sourceType === REMINDER_SOURCE_MISSED ? 'high' : 'medium'

    const { error: insertError } = await supabase
      .from('prep_items')
      .insert({
        title: cleanEventTitle(event.title),
        description: buildReminderPrepDescription(cleanEventTitle(event.title), sourceType),
        event_title: cleanEventTitle(event.title),
        event_date: event.start_time,
        due_by: dueBy.toISOString(),
        priority,
        dismissed: false,
        source_type: sourceType,
        source_ref: event.id,
        source_pattern_key: `reminder:${sourceType === REMINDER_SOURCE_MANUAL ? 'manual' : 'missed'}`,
        source_confidence: 1,
      })

    if (insertError) throw insertError
  }, [])

  const snoozeReminderByDuration = useCallback(async (event: EventWithDetails, duration: SnoozeDuration = '1h') => {
    const window = computeReminderSnoozeWindow(event.start_time, event.end_time, duration, new Date())

    // Optimistically update all 4 caches
    publishEventAggregatePatch(qc, event.id, {
      start_time: window.start,
      end_time: window.end,
      status: 'confirmed',
    })

    const { error } = await supabase
      .from('events')
      .update({
        start_time: window.start,
        end_time: window.end,
        status: 'confirmed',
      })
      .eq('id', event.id)

    if (error) throw error
    await invalidateReminderSurfaces()
  }, [qc, invalidateReminderSurfaces])

  const moveReminderToNeedsYou = useCallback(async (event: EventWithDetails) => {
    // 0ms Evict from all caches
    evictEventFromAllCaches(qc, event.id)

    await ensureReminderInNeedsYou(event, REMINDER_SOURCE_MANUAL)

    const { error } = await supabase
      .from('events')
      .update({ status: 'cancelled' })
      .eq('id', event.id)

    if (error) throw error
    await invalidateReminderSurfaces()
  }, [qc, ensureReminderInNeedsYou, invalidateReminderSurfaces])

  const completeReminder = useCallback(async (
    reminderId: string,
    expectedUpdatedAt?: string,
  ) => {
    // 0ms Evict from all caches
    evictEventFromAllCaches(qc, reminderId)

    const { data, error } = await supabase.rpc('complete_reminder_with_linked_actions', {
      p_reminder_id: reminderId,
      p_expected_updated_at: expectedUpdatedAt ?? null,
    })
    if (error) throw error
    if (!data?.ok) throw new Error('Casa could not complete this reminder.')
    await invalidateReminderSurfaces()
    return data
  }, [qc, invalidateReminderSurfaces])

  const queueMissedReminders = useCallback(async (events: EventWithDetails[], now: Date) => {
    const nowMs = now.getTime()
    const missed = events.filter((event) => {
      const startMs = getEventStartDate(event).getTime()
      return (event.event_type === 'reminder')
        && event.status !== 'cancelled'
        && (nowMs > startMs + MISSED_GRACE_MS)
    })

    if (missed.length === 0) return

    const existingSources = [REMINDER_SOURCE_MANUAL, REMINDER_SOURCE_MISSED]
    const { data: existing, error: existingError } = await supabase
      .from('prep_items')
      .select('source_ref')
      .in('source_type', existingSources)
      .in('source_ref', missed.map((event) => event.id))

    if (existingError) throw existingError
    const existingIds = new Set((existing ?? []).map((row) => row.source_ref).filter(Boolean))

    const toInsert = missed.filter((event) => !existingIds.has(event.id))
    if (toInsert.length === 0) return

    const dueBy = new Date(nowMs + ONE_DAY_MS).toISOString()
    const rows = toInsert.map((event) => {
      const overdueMs = nowMs - (getEventStartDate(event).getTime() + MISSED_GRACE_MS)
      const priority = overdueMs > 2 * ONE_HOUR_MS ? 3 : 2
      return {
        event_id: null,
        type: 'reminder',
        category: 'general_todo',
        emoji: '🔔',
        description: buildReminderPrepDescription(cleanEventTitle(event.title), REMINDER_SOURCE_MISSED),
        event_title: cleanEventTitle(event.title),
        event_date: event.start_time,
        due_by: dueBy,
        priority,
        dismissed: false,
        source_type: REMINDER_SOURCE_MISSED,
        source_ref: event.id,
        source_pattern_key: 'reminder:missed',
        source_confidence: 1,
      }
    })

    const { error: insertError } = await supabase.from('prep_items').insert(rows)
    if (insertError) throw insertError
    await invalidateReminderSurfaces()
  }, [invalidateReminderSurfaces])

  return {
    completeReminder,
    snoozeReminderByDuration,
    moveReminderToNeedsYou,
    queueMissedReminders,
  }
}
