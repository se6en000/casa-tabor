import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { EventWithDetails } from './useCalendarEvents'
import { getEventEndDate, getEventStartDate } from '../utils/eventTime'
import { cleanEventTitle } from '../utils/eventTitle'

const ONE_HOUR_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MISSED_GRACE_MS = 10 * 60 * 1000

const REMINDER_SOURCE_MANUAL = 'reminder_manual'
const REMINDER_SOURCE_MISSED = 'reminder_missed'

function buildReminderPrepDescription(event: EventWithDetails, sourceType: string, now: Date): string {
  const title = cleanEventTitle(event.title)
  if (sourceType === REMINDER_SOURCE_MANUAL) {
    return `Moved from calendar reminder: ${title}`
  }
  const minutesLate = Math.max(0, Math.round((now.getTime() - getEventStartDate(event).getTime()) / 60000))
  return `Missed reminder (${minutesLate}m late): ${title}`
}

type ReminderPrepSource = typeof REMINDER_SOURCE_MANUAL | typeof REMINDER_SOURCE_MISSED

export function useReminderNeedsYouActions() {
  const qc = useQueryClient()

  const invalidateReminderSurfaces = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['today-events'] }),
      qc.invalidateQueries({ queryKey: ['events'] }),
      qc.invalidateQueries({ queryKey: ['prep-items'] }),
    ])
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
      .limit(1)

    if (existingError) throw existingError
    if ((existing ?? []).length > 0) return

    const now = new Date()
    const dueBy = new Date(now.getTime() + ONE_DAY_MS)
    const overdueMs = now.getTime() - (getEventStartDate(event).getTime() + MISSED_GRACE_MS)
    const priority = sourceType === REMINDER_SOURCE_MISSED && overdueMs > 2 * ONE_HOUR_MS ? 3 : 2

    const { error: insertError } = await supabase
      .from('prep_items')
      .insert({
        event_id: null,
        type: 'reminder',
        emoji: '🔔',
        description: buildReminderPrepDescription(event, sourceType, now),
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

  const snoozeReminderOneHour = useCallback(async (event: EventWithDetails) => {
    const start = getEventStartDate(event)
    const end = getEventEndDate(event)
    const durationMs = Math.max(5 * 60 * 1000, end.getTime() - start.getTime())
    const snoozedStartMs = Math.max(Date.now(), start.getTime()) + ONE_HOUR_MS
    const snoozedEndMs = snoozedStartMs + durationMs

    const { error } = await supabase
      .from('events')
      .update({
        start_time: new Date(snoozedStartMs).toISOString(),
        end_time: new Date(snoozedEndMs).toISOString(),
        status: 'confirmed',
      })
      .eq('id', event.id)

    if (error) throw error
    await invalidateReminderSurfaces()
  }, [invalidateReminderSurfaces])

  const moveReminderToNeedsYou = useCallback(async (event: EventWithDetails) => {
    await ensureReminderInNeedsYou(event, REMINDER_SOURCE_MANUAL)

    const { error } = await supabase
      .from('events')
      .update({ status: 'cancelled' })
      .eq('id', event.id)

    if (error) throw error
    await invalidateReminderSurfaces()
  }, [ensureReminderInNeedsYou, invalidateReminderSurfaces])

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
        emoji: '🔔',
        description: buildReminderPrepDescription(event, REMINDER_SOURCE_MISSED, now),
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
    snoozeReminderOneHour,
    moveReminderToNeedsYou,
    queueMissedReminders,
  }
}
