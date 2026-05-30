
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { startOfWeek, endOfWeek, addDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns'
import type {
  CalendarEvent, FamilyMember, EventEnrichment,
  EventLogistic, EventChecklistItem, EventActionItem,
} from '../types'

export interface EventWithDetails extends Omit<CalendarEvent, 'members' | 'enrichment'> {
  members: {
    id: string
    role: string
    family_member: FamilyMember
  }[]
  enrichment: EventEnrichment | null
  logistics: EventLogistic[]
  checklist: EventChecklistItem[]
  actions: EventActionItem[]
}

async function fetchEventsForRange(start: Date, end: Date): Promise<EventWithDetails[]> {
  const { data: events, error } = await supabase
    .from('events')
    .select(`
      *,
      event_members (
        id,
        role,
        family_member:family_members (*)
      ),
      event_enrichments (*),
      event_logistics ( * ),
      event_checklist_items ( * ),
      event_action_items ( * )
    `)
    .gte('start_time', start.toISOString())
    .lte('start_time', end.toISOString())
    .neq('status', 'cancelled')
    .order('start_time')

  if (error) throw error

  return (events || []).map((e: any) => ({
    ...e,
    members: e.event_members?.map((em: any) => ({
      id: em.id,
      role: em.role,
      family_member: em.family_member,
    })) || [],
    enrichment: Array.isArray(e.event_enrichments)
      ? e.event_enrichments[0] || null
      : e.event_enrichments || null,
    logistics: (e.event_logistics || []).sort((a: EventLogistic, b: EventLogistic) => a.sort_order - b.sort_order),
    checklist: (e.event_checklist_items || []).sort((a: EventChecklistItem, b: EventChecklistItem) => a.sort_order - b.sort_order),
    actions: e.event_action_items || [],
  }))
}

export function useWeekEvents(selectedDate: Date) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 })
  const weekEnd = addDays(endOfWeek(selectedDate, { weekStartsOn: 0 }), 1)

  useRealtimeEventInvalidation()

  return useQuery({
    queryKey: ['events', 'week', weekStart.toISOString()],
    queryFn: () => fetchEventsForRange(weekStart, weekEnd),
    staleTime: 60_000,
  })
}

/** Fetches 8 days starting from `today` (today → today+7) for the stacked rolling view. */
export function useRollingEvents(today: Date) {
  const start = startOfDay(today)
  const end   = endOfDay(addDays(today, 7))

  useRealtimeEventInvalidation()

  return useQuery({
    queryKey: ['events', 'rolling', start.toISOString()],
    queryFn: () => fetchEventsForRange(start, end),
    staleTime: 60_000,
  })
}

/**
 * Singleton realtime subscription — only one channel regardless of how many
 * components call useWeekEvents/useTodayEvents simultaneously.
 * Debounced: rapid-fire DB changes (e.g. bulk recurrence inserts) batch into
 * a single invalidation 600ms after the last event, preventing request storms.
 */
let _realtimeSubscribers = 0
let _realtimeChannel: ReturnType<typeof supabase.channel> | null = null
const _invalidateCallbacks = new Set<() => void>()
let _debounceTimer: ReturnType<typeof setTimeout> | null = null

function _fireInvalidation() {
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null
    _invalidateCallbacks.forEach(f => f())
  }, 600)
}

function useRealtimeEventInvalidation() {
  const qc = useQueryClient()
  useEffect(() => {
    const cb = () => qc.invalidateQueries({ queryKey: ['events'] })
    _invalidateCallbacks.add(cb)
    _realtimeSubscribers++

    if (_realtimeSubscribers === 1) {
      _realtimeChannel = supabase
        .channel('events-realtime-singleton')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, _fireInvalidation)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_members' }, _fireInvalidation)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_enrichments' }, _fireInvalidation)
        .subscribe()
    }

    return () => {
      _invalidateCallbacks.delete(cb)
      _realtimeSubscribers--
      if (_realtimeSubscribers === 0 && _realtimeChannel) {
        supabase.removeChannel(_realtimeChannel)
        _realtimeChannel = null
      }
    }
  }, [qc])
}

export function useTodayEvents(date: Date) {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  return useQuery({
    queryKey: ['events', 'today', dayStart.toISOString()],
    queryFn: () => fetchEventsForRange(dayStart, dayEnd),
    staleTime: 60_000,
  })
}

export function useMonthEvents(selectedDate: Date) {
  const monthStart = startOfMonth(selectedDate)
  const monthEnd = endOfMonth(selectedDate)

  useRealtimeEventInvalidation()

  return useQuery({
    queryKey: ['events', 'month', monthStart.toISOString()],
    queryFn: () => fetchEventsForRange(monthStart, monthEnd),
    staleTime: 60_000,
  })
}