import type { QueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import type { FamilyMember } from '../types'
import type { EventTransportationPlan } from './eventTransportation.ts'
import {
  syncTransportationAttendees,
  buildLogisticsStepsFromRoute,
  parseDistanceMilesFromSummary,
} from './eventTransportation.ts'
import {
  saveEventTransportationOverride,
} from './eventPlanOverrides.ts'
import {
  publishEventAggregatePatch,
  evictEventFromAllCaches,
} from './eventAggregateCache.ts'
import { normalizeAllDayEventRange } from '../utils/allDayEventRange.ts'

export interface EventVenuePayload {
  name: string
  address: string
  driveMinutes?: number
  distanceMiles?: number
  routeSummary?: string
  departureTimeIso?: string
}

export function calculateSnoozeWindow(
  startTimeIso: string | null | undefined,
  snoozeMinutes: number,
  durationMinutes: number = 15,
  referenceNow: Date = new Date(),
): { start: string; end: string } {
  const baseTime = startTimeIso ? new Date(startTimeIso) : referenceNow
  const referenceMs = baseTime.getTime() < referenceNow.getTime() ? referenceNow.getTime() : baseTime.getTime()
  const newStart = new Date(referenceMs + snoozeMinutes * 60 * 1000)
  const newEnd = new Date(newStart.getTime() + durationMinutes * 60 * 1000)
  return {
    start: newStart.toISOString(),
    end: newEnd.toISOString(),
  }
}

export function reconcileTransportationLegTimes(
  plan: EventTransportationPlan,
  startDate: Date,
  endDate: Date,
): EventTransportationPlan {
  const startStr = format(startDate, 'HH:mm')
  const endStr = format(endDate, 'HH:mm')
  return {
    ...plan,
    legs: plan.legs.map((leg) => {
      if (leg.timing === 'arrive_by' || leg.purpose === 'drive' || leg.purpose === 'dropoff') {
        return { ...leg, time: startStr }
      }
      if (leg.timing === 'depart_at' || leg.purpose === 'return' || leg.purpose === 'pickup') {
        return { ...leg, time: endStr }
      }
      return leg
    }),
  }
}

export function reconcileTransportationDestination(
  plan: EventTransportationPlan,
  venue: EventVenuePayload,
): EventTransportationPlan {
  const eventPlace = {
    name: venue.name || 'Destination',
    address: venue.address || '',
    kind: 'event' as const,
  }
  return {
    ...plan,
    legs: plan.legs.map((leg) => ({
      ...leg,
      origin: leg.origin.kind === 'event' || leg.purpose === 'return' || leg.purpose === 'pickup' ? eventPlace : leg.origin,
      destination: leg.destination.kind === 'event' || leg.purpose === 'drive' || leg.purpose === 'dropoff' ? eventPlace : leg.destination,
    })),
  }
}

export function triggerGoogleEventSync(
  supabase: SupabaseClient,
  eventId: string,
  options?: { titleOnly?: boolean },
) {
  if (!eventId) return
  void supabase.functions.invoke('sync-event-to-google', {
    body: {
      event_id: eventId,
      title_only: options?.titleOnly === true,
      enqueue_on_failure: true,
    },
  }).catch((err) => {
    console.warn('[eventMutations] Background sync-event-to-google notice:', err)
  })
}

export function invalidateAllCalendarQueries(queryClient: QueryClient, eventId?: string) {
  void queryClient.invalidateQueries({ queryKey: ['events'] })
  void queryClient.invalidateQueries({ queryKey: ['today-events'] })
  void queryClient.invalidateQueries({ queryKey: ['rolling-events'] })
  void queryClient.invalidateQueries({ queryKey: ['prep-items'] })
  void queryClient.invalidateQueries({ queryKey: ['conflicts'] })
  void queryClient.invalidateQueries({ queryKey: ['event-details'] })
  if (eventId) {
    void queryClient.invalidateQueries({ queryKey: ['event-details', eventId] })
  }
  void queryClient.refetchQueries({ queryKey: ['events'], type: 'active' })
}

export async function materializeSyntheticRoutineEvent(
  supabase: SupabaseClient,
  queryClient: QueryClient,
  syntheticEvent: EventWithDetails,
  overrides?: {
    title?: string
    startDate?: Date
    endDate?: Date
    durationMinutes?: number
    venue?: EventVenuePayload
    selectedMemberIds?: string[]
    category?: string
    mode?: 'event' | 'reminder'
    isAllDay?: boolean
  },
  options?: {
    familyMembers?: FamilyMember[]
    homeAddress?: string
  },
): Promise<EventWithDetails> {
  const newEventId = crypto.randomUUID()
  const members = options?.familyMembers ?? []

  const isAllDay = overrides?.isAllDay === true
  const title = (overrides?.title ?? syntheticEvent.title ?? 'New Event').trim()
  let startTime = overrides?.startDate ? overrides.startDate.toISOString() : (syntheticEvent.start_time || new Date().toISOString())
  let endTime = overrides?.endDate ? overrides.endDate.toISOString() : (syntheticEvent.end_time || new Date(new Date(startTime).getTime() + 15 * 60000).toISOString())
  if (isAllDay && overrides?.startDate) {
    const pad = (n: number) => String(n).padStart(2, '0')
    const startStr = `${overrides.startDate.getFullYear()}-${pad(overrides.startDate.getMonth() + 1)}-${pad(overrides.startDate.getDate())}`
    const endStr = overrides.endDate
      ? `${overrides.endDate.getFullYear()}-${pad(overrides.endDate.getMonth() + 1)}-${pad(overrides.endDate.getDate())}`
      : startStr
    const range = normalizeAllDayEventRange(startStr, endStr)
    startTime = range.start
    endTime = range.end
  }
  const locationName = (overrides?.venue?.name ?? syntheticEvent.location_name ?? '').trim()
  const address = (overrides?.venue?.address ?? syntheticEvent.address ?? '').trim()
  const eventType = overrides?.mode ?? syntheticEvent.event_type ?? 'event'
  const category = (overrides?.category ?? syntheticEvent.enrichment?.category ?? 'School').toLowerCase().replace(/\s+/g, '_')
  const driveMins = isAllDay ? 0 : (overrides?.venue?.driveMinutes ?? syntheticEvent.enrichment?.drive_time_mins ?? (locationName.toLowerCase().includes('palm beach') ? 10 : 15))
  const routeSummary = isAllDay ? null : (overrides?.venue?.routeSummary ?? syntheticEvent.enrichment?.route_summary ?? (driveMins ? `${driveMins} min drive` : null))

  const depTimeIso = (!isAllDay && driveMins > 0)
    ? new Date(new Date(startTime).getTime() - (driveMins + 5) * 60000).toISOString()
    : (isAllDay ? null : (syntheticEvent.enrichment?.departure_time ?? null))

  const { error: evErr } = await supabase
    .from('events')
    .insert({
      id: newEventId,
      title,
      description: syntheticEvent.description ?? null,
      start_time: startTime,
      end_time: endTime,
      all_day: isAllDay,
      event_type: eventType,
      location_name: locationName || null,
      address: address || null,
      status: 'confirmed',
      is_enriched: true,
      is_exception: true,
      record_kind: 'single',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

  if (evErr) throw evErr

  const targetMemberIds = overrides?.selectedMemberIds ?? (syntheticEvent.members ?? []).map((m) => m.family_member?.id || m.id).filter(Boolean)
  const memberInserts = targetMemberIds.map((mid) => {
    const mem = members.find((m) => m.id === mid)
    const isDriver = mem?.role === 'parent' || mem?.can_drive
    return {
      event_id: newEventId,
      family_member_id: mid,
      role: isDriver ? 'driver' : 'passenger',
      rsvp_status: 'accepted',
    }
  })

  if (memberInserts.length > 0) {
    const { error: memErr } = await supabase.from('event_members').insert(memberInserts)
    if (memErr) console.warn('[materializeSyntheticRoutineEvent] event_members error:', memErr)
  }

  const enrichmentPayload = {
    id: crypto.randomUUID(),
    event_id: newEventId,
    category,
    category_locked: true,
    confidence: 'high' as const,
    drive_time_mins: driveMins,
    departure_time: depTimeIso,
    route_summary: routeSummary,
    what_to_bring: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const { error: enrErr } = await supabase.from('event_enrichments').insert(enrichmentPayload)
  if (enrErr) console.warn('[materializeSyntheticRoutineEvent] event_enrichments error:', enrErr)

  invalidateAllCalendarQueries(queryClient, newEventId)
  triggerGoogleEventSync(supabase, newEventId)

  return {
    ...syntheticEvent,
    id: newEventId,
    title,
    start_time: startTime,
    end_time: endTime,
    location_name: locationName,
    address,
    event_type: eventType,
    is_exception: true,
    enrichment: enrichmentPayload as any,
    members: memberInserts.map((mi) => ({
      id: crypto.randomUUID(),
      role: mi.role,
      family_member: members.find((m) => m.id === mi.family_member_id)!,
    })).filter((m) => Boolean(m.family_member)),
  }
}

export async function updateEventTitle(
  supabase: SupabaseClient,
  queryClient: QueryClient,
  eventId: string,
  newTitle: string,
) {
  publishEventAggregatePatch(queryClient, eventId, { title: newTitle })
  const { error } = await supabase
    .from('events')
    .update({ title: newTitle, updated_at: new Date().toISOString() })
    .eq('id', eventId)
  if (error) throw error
  invalidateAllCalendarQueries(queryClient, eventId)
  triggerGoogleEventSync(supabase, eventId, { titleOnly: true })
}

export async function updateEventSchedule(
  supabase: SupabaseClient,
  queryClient: QueryClient,
  event: EventWithDetails,
  startDate: Date,
  endDate: Date,
  isAllDay: boolean = false,
) {
  let startIso = startDate.toISOString()
  let endIso = endDate.toISOString()
  if (isAllDay) {
    const pad = (n: number) => String(n).padStart(2, '0')
    const startStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`
    const endStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`
    const range = normalizeAllDayEventRange(startStr, endStr)
    startIso = range.start
    endIso = range.end
  }

  const driveMins = isAllDay ? null : event.enrichment?.drive_time_mins
  const newDepTimeIso = (!isAllDay && driveMins !== undefined && driveMins !== null && driveMins > 0)
    ? new Date(startDate.getTime() - (driveMins + 5) * 60_000).toISOString()
    : null

  publishEventAggregatePatch(queryClient, event.id, {
    start_time: startIso,
    end_time: endIso,
    all_day: isAllDay,
    enrichment: event.enrichment ? {
      ...event.enrichment,
      departure_time: isAllDay ? null : (newDepTimeIso ?? event.enrichment.departure_time),
      updated_at: new Date().toISOString(),
    } : null,
    updated_at: new Date().toISOString(),
  })

  // 1. If a transportation plan exists, update the leg arrival and return times
  if (!isAllDay && event.plan_override?.transportation_plan) {
    const updatedPlan = reconcileTransportationLegTimes(
      event.plan_override.transportation_plan,
      startDate,
      endDate,
    )
    await saveEventTransportationOverride({
      supabase,
      queryClient,
      event,
      transportationPlan: updatedPlan,
      waits: event.plan_override.waits,
      modeOverride: event.plan_override.mode_override,
    })
  }

  // 2. Update events table
  const { error } = await supabase
    .from('events')
    .update({
      start_time: startIso,
      end_time: endIso,
      all_day: isAllDay,
      updated_at: new Date().toISOString(),
    })
    .eq('id', event.id)

  if (error) throw error

  // 3. If departure time shifted or was cleared, update event_enrichments
  if (isAllDay || newDepTimeIso) {
    try {
      await supabase
        .from('event_enrichments')
        .update({
          departure_time: isAllDay ? null : newDepTimeIso,
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', event.id)
    } catch (enrichErr) {
      console.warn('[updateEventSchedule] Enrichment update warning:', enrichErr)
    }
  }

  invalidateAllCalendarQueries(queryClient, event.id)
  triggerGoogleEventSync(supabase, event.id)
}

export async function updateEventVenue(
  supabase: SupabaseClient,
  queryClient: QueryClient,
  event: EventWithDetails,
  venue: EventVenuePayload,
  options?: {
    homeAddress?: string
    familyMembers?: FamilyMember[]
  }
) {
  const isHome = (venue.name || '').toLowerCase() === 'home' || !venue.address?.trim()
  let driveMins = isHome ? 0 : venue.driveMinutes
  let distMiles = isHome ? 0 : venue.distanceMiles
  let routeSummary = isHome ? null : venue.routeSummary
  let depTimeIso = isHome ? null : venue.departureTimeIso

  // If driving venue but ETA metrics not passed, attempt on-the-fly resolution
  if (!isHome && (driveMins === undefined || distMiles === undefined)) {
    try {
      const { data } = await supabase.functions.invoke('route-eta', {
        body: {
          origin: options?.homeAddress || null,
          destination: venue.address,
          arrival_time: event.start_time || null,
          buffer_mins: 5,
        },
      })
      if (data?.found) {
        driveMins = data.drive_time_mins ?? 0
        distMiles = data.distance_miles ?? parseDistanceMilesFromSummary(data.route_summary) ?? 0
        routeSummary = data.route_summary ?? null
        depTimeIso = data.departure_time ?? null
      }
    } catch (err) {
      console.warn('[updateEventVenue] Failed to resolve route ETA:', err)
    }
  }

  // Calculate departure time if we have drive time but no explicit departure time
  if (!isHome && driveMins !== undefined && !depTimeIso && event.start_time) {
    const start = new Date(event.start_time)
    if (!Number.isNaN(start.getTime())) {
      const depDate = new Date(start.getTime() - (driveMins + 5) * 60_000)
      depTimeIso = depDate.toISOString()
    }
  }

  // Generate logistics steps
  let steps: any[] = []
  if (!isHome && driveMins !== undefined) {
    const attendeeNames = (event.members ?? [])
      .map((m) => m.family_member?.name || '')
      .filter(Boolean)
    const driver1 = event.plan_override?.transportation_plan?.legs?.[0]?.driverName || 'Jake'
    const driver2 = event.plan_override?.transportation_plan?.legs?.[1]?.driverName || driver1
    const waitOnSite = event.plan_override?.waits !== false

    steps = buildLogisticsStepsFromRoute({
      eventId: event.id,
      eventTitle: event.title,
      startTime: event.start_time || new Date().toISOString(),
      endTime: event.end_time || new Date().toISOString(),
      venueName: venue.name,
      venueAddress: venue.address,
      homeAddress: options?.homeAddress,
      driveMinutes: driveMins,
      distanceMiles: distMiles ?? 0,
      driverLeg1: driver1,
      driverLeg2: driver2,
      attendees: attendeeNames,
      waitOnSite,
      bufferMinutes: 5,
    })
  }

  // Reconcile plan override
  let updatedPlan: EventTransportationPlan | null = null
  if (event.plan_override?.transportation_plan) {
    updatedPlan = reconcileTransportationDestination(
      event.plan_override.transportation_plan,
      venue,
    )
  }

  // Optimistic UI cache update with complete enrichment & departure time
  const optimisticEnrichment = {
    ...(event.enrichment ?? {
      id: crypto.randomUUID(),
      event_id: event.id,
      weather_at_event: null,
      weather_summary: null,
      what_to_bring: [],
      prep_notes: null,
      outfit_suggestion: null,
      parking_notes: null,
      dietary_notes: null,
      cost_estimate: null,
      contact_name: null,
      contact_phone: null,
      meal_impact: null,
      category: null,
      category_locked: false,
      confidence: 'high' as const,
      enriched_by: null,
      enriched_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }),
    drive_time_mins: driveMins ?? null,
    departure_time: depTimeIso ?? null,
    route_summary: routeSummary ?? (driveMins ? `${driveMins} min • ${distMiles ?? 0} mi` : null),
    updated_at: new Date().toISOString(),
  }

  publishEventAggregatePatch(queryClient, event.id, {
    location_name: venue.name,
    address: venue.address,
    enrichment: optimisticEnrichment,
    logistics: steps,
    ...(updatedPlan ? {
      plan_override: {
        ...(event.plan_override ?? {
          event_id: event.id,
          verified: true,
          waits: true,
          mode_override: null,
          two_driver_confirmed: false,
          driver_overrides: null,
          location_projection_blocked: false,
          created_at: new Date().toISOString(),
        }),
        transportation_plan: updatedPlan,
        location_signature: `${venue.name}|${venue.address}`,
        updated_at: new Date().toISOString(),
      }
    } : {}),
    updated_at: new Date().toISOString(),
  })

  // 1. If transportation plan exists, save override
  if (updatedPlan) {
    await saveEventTransportationOverride({
      supabase,
      queryClient,
      event: { ...event, location_name: venue.name, address: venue.address },
      transportationPlan: updatedPlan,
      waits: event.plan_override?.waits,
      modeOverride: event.plan_override?.mode_override,
    })
  }

  // 2. Update events table
  const { error: eventError } = await supabase
    .from('events')
    .update({
      location_name: venue.name,
      address: venue.address,
      updated_at: new Date().toISOString(),
    })
    .eq('id', event.id)

  if (eventError) throw eventError

  // 3. Upsert event_enrichments with recalculated drive time and departure time
  try {
    await supabase
      .from('event_enrichments')
      .upsert({
        event_id: event.id,
        drive_time_mins: driveMins ?? null,
        departure_time: depTimeIso ?? null,
        route_summary: routeSummary ?? (driveMins ? `${driveMins} min • ${distMiles ?? 0} mi` : null),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'event_id' })
  } catch (enrichErr) {
    console.warn('[updateEventVenue] Enrichment update warning:', enrichErr)
  }

  // 4. Regenerate event_logistics steps in database
  try {
    if (isHome) {
      await supabase.from('event_logistics').delete().eq('event_id', event.id)
    } else if (steps.length > 0) {
      await supabase.from('event_logistics').delete().eq('event_id', event.id)
      await supabase.from('event_logistics').insert(steps)
    }
  } catch (logErr) {
    console.warn('[updateEventVenue] Logistics update warning:', logErr)
  }

  invalidateAllCalendarQueries(queryClient, event.id)
  triggerGoogleEventSync(supabase, event.id)
}

export async function toggleEventAttendee(
  supabase: SupabaseClient,
  queryClient: QueryClient,
  event: EventWithDetails,
  memberId: string,
  isSelected: boolean,
  allFamilyMembers: FamilyMember[],
) {
  const currentMemberIds = (event.members ?? []).map((m) => m.family_member?.id || m.id).filter(Boolean)
  const nextMemberIds = isSelected
    ? [...currentMemberIds, memberId]
    : currentMemberIds.filter((id) => id !== memberId)

  const attendeeNames = allFamilyMembers
    .filter((m) => nextMemberIds.includes(m.id))
    .map((m) => m.name)

  // 1. Sync transportation plan attendee roster and passengers
  if (event.plan_override?.transportation_plan) {
    const updatedPlan = syncTransportationAttendees(
      event.plan_override.transportation_plan,
      attendeeNames,
    )
    await saveEventTransportationOverride({
      supabase,
      queryClient,
      event,
      transportationPlan: updatedPlan,
      waits: event.plan_override.waits,
      modeOverride: event.plan_override.mode_override,
    })
  }

  // 2. Update event_members table
  if (isSelected) {
    const { error } = await supabase
      .from('event_members')
      .insert({
        event_id: event.id,
        family_member_id: memberId,
        role: 'attendee',
        rsvp_status: 'accepted',
      })
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('event_members')
      .delete()
      .eq('event_id', event.id)
      .eq('family_member_id', memberId)
    if (error) throw error
  }

  invalidateAllCalendarQueries(queryClient, event.id)
  triggerGoogleEventSync(supabase, event.id)
}

export async function updateEventCategory(
  supabase: SupabaseClient,
  queryClient: QueryClient,
  eventId: string,
  catName: string,
  mode: 'reminder' | 'event',
) {
  const catSlug = catName.toLowerCase().replace(/\s+/g, '_')

  const { error: eventError } = await supabase
    .from('events')
    .update({
      event_type: mode === 'reminder' ? 'reminder' : 'event',
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)

  if (eventError) throw eventError

  await supabase
    .from('event_enrichments')
    .upsert({
      event_id: eventId,
      category: catSlug,
      category_locked: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'event_id' })

  invalidateAllCalendarQueries(queryClient, eventId)

  // Trigger Google sync:
  // - For 'event': creates or updates the Google Calendar event
  // - For 'reminder': deletes from Google Calendar if previously synced and clears Google IDs
  triggerGoogleEventSync(supabase, eventId)
}

export async function snoozeEventOrReminder(
  supabase: SupabaseClient,
  queryClient: QueryClient,
  event: EventWithDetails,
  durationMinutes: number = 60,
) {
  const { start, end } = calculateSnoozeWindow(
    event.start_time,
    durationMinutes,
    15,
    new Date(),
  )

  // 1. Optimistic multi-query update
  publishEventAggregatePatch(queryClient, event.id, {
    start_time: start,
    end_time: end,
    status: 'confirmed',
  })

  // 2. Persist to DB
  const { error } = await supabase
    .from('events')
    .update({
      start_time: start,
      end_time: end,
      status: 'confirmed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', event.id)

  if (error) throw error
  invalidateAllCalendarQueries(queryClient, event.id)
}

export async function completeEventOrReminder(
  supabase: SupabaseClient,
  queryClient: QueryClient,
  event: EventWithDetails,
) {
  // 1. 0ms Evict from all cached queries
  evictEventFromAllCaches(queryClient, event.id)

  const isReminder = event.event_type === 'reminder'
  if (isReminder) {
    const { error } = await supabase.rpc('complete_reminder_with_linked_actions', {
      p_reminder_id: event.id,
      p_expected_updated_at: event.updated_at ?? null,
    })
    if (error) {
      console.warn('[eventMutations] RPC fallback to direct cancellation:', error)
      const { error: cancelError } = await supabase
        .from('events')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', event.id)
      if (cancelError) throw cancelError

      await supabase
        .from('prep_items')
        .update({ dismissed: true, completed: true, completed_at: new Date().toISOString() })
        .eq('source_ref', event.id)
        .eq('dismissed', false)
    }
  } else {
    const { error } = await supabase
      .from('events')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', event.id)
    if (error) throw error
  }

  invalidateAllCalendarQueries(queryClient, event.id)
}

export async function deleteCalendarEvent(
  supabase: SupabaseClient,
  queryClient: QueryClient,
  eventId: string,
) {
  // 1. 0ms Evict from all cached queries
  evictEventFromAllCaches(queryClient, eventId)

  // Trigger Google deletion asynchronously
  void supabase.functions.invoke('delete-google-event', {
    body: { event_id: eventId },
  }).catch((err) => {
    console.warn('[eventMutations] Background delete-google-event notice:', err)
  })

  // 2. Clean up dependent child tables to prevent foreign key lock delays/timeouts
  await Promise.allSettled([
    supabase.from('event_members').delete().eq('event_id', eventId),
    supabase.from('event_enrichments').delete().eq('event_id', eventId),
    supabase.from('event_plan_overrides').delete().eq('event_id', eventId),
    supabase.from('prep_items').delete().eq('source_ref', eventId),
    supabase.from('event_logistics').delete().eq('event_id', eventId),
    supabase.from('event_checklist_items').delete().eq('event_id', eventId),
    supabase.from('event_action_items').delete().eq('event_id', eventId),
  ])

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)

  if (error) throw error
  invalidateAllCalendarQueries(queryClient, eventId)
}
