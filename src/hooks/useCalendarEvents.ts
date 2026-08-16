
import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { startOfWeek, endOfWeek, addDays, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval, format } from 'date-fns'
import { eventOverlapsRange } from '../utils/eventTime'
import { normalizePossessiveSuffixCasing } from '../utils/eventTitle'
import type {
  CalendarEvent, FamilyMember, EventEnrichment,
  EventLogistic, EventChecklistItem, EventActionItem,
} from '../types'
import type { EventTransportationPlan } from '../lib/eventTransportation'
import { useFamilyMembers } from './useFamilyMembers'
import { useMemberAvailability } from './useMemberAvailability'
import {
  deserializeRoutineFromAvailabilityRules,
  generateConsolidatedRoutineActionEvents,
  type FamilyRoutine,
} from '../lib/familyRoutines'

export interface EventWithDetails extends Omit<CalendarEvent, 'members' | 'enrichment'> {
  members: {
    id: string
    role: string
    family_member: FamilyMember
  }[]
  enrichment: EventEnrichment | null
  plan_override: EventPlanOverride | null
  logistics: EventLogistic[]
  checklist: EventChecklistItem[]
  actions: EventActionItem[]
}

export interface EventPlanOverride {
  event_id: string
  verified: boolean | null
  waits: boolean | null
  driver_overrides: Record<string, string> | null
  mode_override: 'appointment' | 'pickup' | 'hosted' | 'trip' | null
  two_driver_confirmed: boolean
  transportation_plan: EventTransportationPlan | null
  location_signature: string | null
  location_projection_blocked?: boolean
  created_at?: string
  updated_at: string
}

const EVENT_SUMMARY_SELECT = `
  id,
  title,
  description,
  start_time,
  end_time,
  all_day,
  event_type,
  location_name,
  address,
  lat,
  lng,
  google_event_id,
  google_calendar_id,
  google_connection_id,
  source_member_id,
  status,
  is_enriched,
  rrule,
  recurrence_master_id,
  record_kind,
  series_id,
  occurrence_key,
  original_start_time,
  original_start_date,
  is_exception,
  exception_paths,
  series_revision_applied,
  created_at,
  updated_at,
  trip_id,
  leg_type,
  flight_number,
  confirmation_number,
  event_members (
    id,
    role,
    family_member:family_members (
      id,
      name,
      role,
      color_hex,
      can_drive
    )
  ),
  event_plan_overrides (
    event_id,
    verified,
    waits,
    driver_overrides,
    mode_override,
    two_driver_confirmed,
    location_signature,
    location_projection_blocked,
    updated_at
  ),
  event_enrichments (
    id,
    event_id,
    category,
    category_locked,
    confidence,
    what_to_bring,
    contact_name,
    contact_phone,
    cost_estimate,
    dietary_notes,
    prep_notes,
    departure_time,
    drive_time_mins,
    weather_at_event,
    weather_summary
  ),
  event_action_items (
    id,
    event_id,
    title,
    description,
    due_date,
    is_urgent,
    completed,
    completed_at,
    assigned_to,
    created_at
  )
`

const EVENT_DETAIL_SELECT = `
  *,
  event_members (
    id,
    role,
    family_member:family_members (*)
  ),
  event_plan_overrides (
    event_id,
    verified,
    waits,
    driver_overrides,
    mode_override,
    two_driver_confirmed,
    transportation_plan,
    location_signature,
    location_projection_blocked,
    updated_at
  ),
  event_enrichments (*),
  event_logistics (*),
  event_checklist_items (*),
  event_action_items (*)
`

function normalizeEventRow(row: any): EventWithDetails {
  return {
    ...row,
    title: normalizePossessiveSuffixCasing(typeof row.title === 'string' ? row.title : ''),
    members: row.event_members?.map((eventMember: any) => ({
      id: eventMember.id,
      role: eventMember.role,
      family_member: eventMember.family_member,
    })) || [],
    enrichment: Array.isArray(row.event_enrichments)
      ? row.event_enrichments[0] || null
      : row.event_enrichments || null,
    plan_override: Array.isArray(row.event_plan_overrides)
      ? row.event_plan_overrides[0] || null
      : row.event_plan_overrides || null,
    logistics: (row.event_logistics || []).sort(
      (a: EventLogistic, b: EventLogistic) => a.sort_order - b.sort_order,
    ),
    checklist: (row.event_checklist_items || []).sort(
      (a: EventChecklistItem, b: EventChecklistItem) => a.sort_order - b.sort_order,
    ),
    actions: row.event_action_items || [],
  }
}

async function fetchEventsForRange(start: Date, end: Date): Promise<EventWithDetails[]> {
  const { data: events, error } = await supabase
    .from('events')
    .select(EVENT_SUMMARY_SELECT)
    .lt('start_time', end.toISOString())
    .gt('end_time', start.toISOString())
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .neq('record_kind', 'series_template')
    .order('start_time')

  if (error) throw error

  return (events || [])
    .map(normalizeEventRow)
    // Keep all-day events anchored to their configured local date portion.
    .filter((event) => eventOverlapsRange(event, start, end))
}

export async function fetchEventDetails(eventId: string): Promise<EventWithDetails | null> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_DETAIL_SELECT)
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()

  if (error) {
    if (error.code === 'PGRST116' || error.message?.includes('Cannot coerce the result to a single JSON object')) {
      return null
    }
    throw error
  }
  return data ? normalizeEventRow(data) : null
}

export function useEventDetails(event: EventWithDetails | null, enabled = true) {
  return useQuery({
    queryKey: ['event-details', event?.id],
    queryFn: () => fetchEventDetails(event!.id),
    enabled: enabled && Boolean(event?.id),
    staleTime: 5 * 60_000,
  })
}

interface EventTransportationPlanRow {
  event_id: string
  transportation_plan: EventTransportationPlan | null
}

function useEventTransportationPlans(anchor: Date) {
  const rangeStart = startOfMonth(anchor)
  const rangeEnd = addDays(rangeStart, 46)

  return useQuery({
    queryKey: ['event-transportation-plans', rangeStart.toISOString()],
    queryFn: async (): Promise<EventTransportationPlanRow[]> => {
      const { data, error } = await supabase
        .from('event_plan_overrides')
        .select('event_id, transportation_plan, events!inner(id)')
        .not('transportation_plan', 'is', null)
        .lt('events.start_time', rangeEnd.toISOString())
        .gt('events.end_time', rangeStart.toISOString())
        .is('events.deleted_at', null)
        .neq('events.status', 'cancelled')

      if (error) throw error
      return (data ?? []).map((row: any) => ({
        event_id: row.event_id,
        transportation_plan: row.transportation_plan,
      }))
    },
    staleTime: 5 * 60_000,
  })
}

function useEventsForRange(queryKey: readonly unknown[], start: Date, end: Date) {
  useRealtimeEventInvalidation()
  const eventsQuery = useQuery({
    queryKey,
    queryFn: () => fetchEventsForRange(start, end),
    staleTime: 60_000,
  })
  const transportationQuery = useEventTransportationPlans(start)
  const { data: familyMembers = [] } = useFamilyMembers()
  const memberIds = useMemo(() => familyMembers.map((m) => m.id), [familyMembers])
  const { rules: availabilityRules = [] } = useMemberAvailability(memberIds)

  const familyRoutines = useMemo<FamilyRoutine[]>(() => {
    return familyMembers
      .map((m) => deserializeRoutineFromAvailabilityRules(m.id, availabilityRules))
      .filter((r): r is FamilyRoutine => Boolean(r && r.enabled))
  }, [familyMembers, availabilityRules])

  const routineEventsInRange = useMemo<EventWithDetails[]>(() => {
    if (familyRoutines.length === 0 || familyMembers.length === 0) return []
    const intervalEnd = new Date(end.getTime() - 1)
    if (intervalEnd < start) return []
    const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(intervalEnd) })
    return days.flatMap((day) => {
      const rawEvents = generateConsolidatedRoutineActionEvents({
        routines: familyRoutines,
        members: familyMembers,
        date: day,
      })
      return rawEvents.map((ev): EventWithDetails => ({
        ...ev,
        members: (ev.members || []).map((m, idx) => ({
          id: m.id || `m-${idx}`,
          role: m.role || 'passenger',
          family_member: m.family_member || familyMembers.find(f => f.id === m.family_member_id)!,
        })).filter(m => Boolean(m.family_member)),
        enrichment: ev.enrichment || null,
        plan_override: (ev as any).plan_override || null,
        logistics: [],
        checklist: [],
        actions: [],
      }))
    }).filter((event) => eventOverlapsRange(event, start, end))
  }, [familyRoutines, familyMembers, start, end])

  const events = useMemo(() => {
    if (!eventsQuery.data) return eventsQuery.data
    const plansByEventId = new Map(
      (transportationQuery.data ?? []).map((row) => [row.event_id, row.transportation_plan]),
    )
    const baseEvents = eventsQuery.data.map((event) => {
      const transportationPlan = plansByEventId.get(event.id)
      if (!transportationPlan) return event
      return {
        ...event,
        plan_override: {
          event_id: event.id,
          verified: null,
          waits: null,
          driver_overrides: null,
          mode_override: null,
          two_driver_confirmed: false,
          location_signature: null,
          location_projection_blocked: false,
          updated_at: event.updated_at,
          ...event.plan_override,
          transportation_plan: transportationPlan,
        },
      }
    })

    const isDuplicateOrHandled = (re: EventWithDetails) => {
      const reDate = format(new Date(re.start_time), 'yyyy-MM-dd')
      const reTitle = (re.title || '').toLowerCase()
      const isReDrop = reTitle.includes('drop off')
      const isRePick = reTitle.includes('pick up') || reTitle.includes('picked up')

      return baseEvents.some((be) => {
        const beDate = format(new Date(be.start_time), 'yyyy-MM-dd')
        if (beDate !== reDate) return false
        const beTitle = (be.title || '').toLowerCase()
        if (beTitle === reTitle) return true

        if (isReDrop && (beTitle.includes('drop off') || beTitle.includes('dropped off'))) {
          if ((reTitle.includes('palm beach') || reTitle.includes('pbp')) && (beTitle.includes('palm beach') || beTitle.includes('pbp'))) return true
          if (reTitle.includes('bak') && beTitle.includes('bak')) return true
        }
        if (isRePick && (beTitle.includes('pick up') || beTitle.includes('picked up'))) {
          if ((reTitle.includes('palm beach') || reTitle.includes('pbp')) && (beTitle.includes('palm beach') || beTitle.includes('pbp') || beTitle.includes('owen & emme'))) return true
          if (reTitle.includes('bak') && beTitle.includes('bak')) return true
        }
        return false
      })
    }

    const newRoutineEvents = routineEventsInRange.filter((re) => !isDuplicateOrHandled(re))

    return [...baseEvents, ...newRoutineEvents].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    )
  }, [eventsQuery.data, transportationQuery.data, routineEventsInRange])

  const error = eventsQuery.error ?? transportationQuery.error
  return {
    ...eventsQuery,
    data: events,
    error,
    isError: Boolean(error),
  }
}

export function useWeekEvents(selectedDate: Date) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 })
  const weekEnd = addDays(endOfWeek(selectedDate, { weekStartsOn: 0 }), 1)

  return useEventsForRange(['events', 'week', weekStart.toISOString()], weekStart, weekEnd)
}

/** Fetches 14 days starting from `today` for AI context and rolling views. */
export function useRollingEvents(today: Date) {
  const start = startOfDay(today)
  // Preserve existing coverage (today through +14 days) using an exclusive end.
  const end   = addDays(start, 15)

  return useEventsForRange(['events', 'rolling', start.toISOString()], start, end)
}

export interface WeekEventIndexItem {
  id: string
  start_time: string
  end_time: string
  all_day: boolean
}

/** Minimal seven-day index used only for Home's event-count buttons. */
export function useWeekEventIndex(selectedDate: Date) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 })
  const weekEnd = addDays(endOfWeek(selectedDate, { weekStartsOn: 0 }), 1)
  useRealtimeEventInvalidation()

  return useQuery({
    queryKey: ['events', 'week-index', weekStart.toISOString()],
    queryFn: async (): Promise<WeekEventIndexItem[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('id, start_time, end_time, all_day')
        .lt('start_time', weekEnd.toISOString())
        .gt('end_time', weekStart.toISOString())
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .neq('record_kind', 'series_template')
        .order('start_time')

      if (error) throw error
      return data ?? []
    },
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
const _planInvalidateCallbacks = new Set<() => void>()
const _queryClientInstances = new Set<ReturnType<typeof useQueryClient>>()
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
let _planDebounceTimer: ReturnType<typeof setTimeout> | null = null
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null

function _evictDeletedEventFromCache(deletedId: string) {
  if (!deletedId) return
  _queryClientInstances.forEach((qc) => {
    qc.setQueriesData<EventWithDetails[]>({ queryKey: ['events'] }, (old) => {
      if (!Array.isArray(old)) return old
      return old.filter((ev) => ev.id !== deletedId)
    })
    qc.removeQueries({ queryKey: ['event-details', deletedId] })
  })
}

function _fireInvalidation() {
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null
    _invalidateCallbacks.forEach(f => f())
  }, 600)
}

function _firePlanInvalidation() {
  if (_planDebounceTimer) clearTimeout(_planDebounceTimer)
  _planDebounceTimer = setTimeout(() => {
    _planDebounceTimer = null
    _planInvalidateCallbacks.forEach(f => f())
  }, 600)
}

function _subscribeRealtimeChannel() {
  if (_realtimeChannel) return
  _realtimeChannel = supabase
    .channel('events-realtime-singleton')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (payload: any) => {
      if (payload?.eventType === 'DELETE' && payload.old?.id) {
        _evictDeletedEventFromCache(payload.old.id)
      } else if (payload?.eventType === 'UPDATE' && payload.new?.id && payload.new?.status === 'cancelled') {
        _evictDeletedEventFromCache(payload.new.id)
      }
      _fireInvalidation()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_members' }, _fireInvalidation)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_plan_overrides' }, _firePlanInvalidation)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_enrichments' }, _fireInvalidation)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_logistics' }, _fireInvalidation)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_checklist_items' }, _fireInvalidation)
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        // Connected / reconnected: catch up on any missed updates
        _fireInvalidation()
        _firePlanInvalidation()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.warn('[CalendarRealtime] Channel status:', status, err?.message ?? '')
        if (_realtimeSubscribers > 0 && !_reconnectTimer) {
          _reconnectTimer = setTimeout(() => {
            _reconnectTimer = null
            if (_realtimeSubscribers > 0 && _realtimeChannel) {
              try { supabase.removeChannel(_realtimeChannel) } catch {}
              _realtimeChannel = null
              _subscribeRealtimeChannel()
            }
          }, 3000)
        }
      }
    })
}

function useRealtimeEventInvalidation() {
  const qc = useQueryClient()
  useEffect(() => {
    const cb = () => {
      void qc.invalidateQueries({ queryKey: ['events'] })
      void qc.invalidateQueries({ queryKey: ['event-details'] })
    }
    const planCb = () => {
      void qc.invalidateQueries({ queryKey: ['event-transportation-plans'] })
      void qc.invalidateQueries({ queryKey: ['event-details'] })
    }
    _invalidateCallbacks.add(cb)
    _planInvalidateCallbacks.add(planCb)
    _queryClientInstances.add(qc)
    _realtimeSubscribers++

    if (_realtimeSubscribers === 1) {
      _subscribeRealtimeChannel()
    }

    return () => {
      _invalidateCallbacks.delete(cb)
      _planInvalidateCallbacks.delete(planCb)
      _queryClientInstances.delete(qc)
      _realtimeSubscribers--
      if (_realtimeSubscribers === 0) {
        if (_reconnectTimer) {
          clearTimeout(_reconnectTimer)
          _reconnectTimer = null
        }
        if (_realtimeChannel) {
          supabase.removeChannel(_realtimeChannel)
          _realtimeChannel = null
        }
        if (_debounceTimer) {
          clearTimeout(_debounceTimer)
          _debounceTimer = null
        }
        if (_planDebounceTimer) {
          clearTimeout(_planDebounceTimer)
          _planDebounceTimer = null
        }
      }
    }
  }, [qc])
}

export function useTodayEvents(date: Date) {
  const dayStart = startOfDay(date)
  const dayEnd = addDays(dayStart, 1)

  return useEventsForRange(['events', 'today', dayStart.toISOString()], dayStart, dayEnd)
}

export function useTomorrowEvents(date: Date) {
  const tomorrowStart = startOfDay(addDays(date, 1))
  const tomorrowEnd = addDays(tomorrowStart, 1)

  return useEventsForRange(['events', 'tomorrow', tomorrowStart.toISOString()], tomorrowStart, tomorrowEnd)
}

export function useMonthEvents(selectedDate: Date) {
  const monthStart = startOfMonth(selectedDate)
  const monthEnd = addDays(endOfMonth(selectedDate), 1)

  return useEventsForRange(['events', 'month', monthStart.toISOString()], monthStart, monthEnd)
}