import type { QueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import * as RRulePkg from 'rrule'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
// @ts-expect-error recurrence-engine-core is a plain JS module without ambient types
import { createRecurrenceEngine } from '../../supabase/functions/_shared/recurrence-engine-core.mjs'
import type { EventWithDetails } from '../hooks/useCalendarEvents'

const rrulestr = RRulePkg.rrulestr || (RRulePkg as unknown as { default: { rrulestr: typeof RRulePkg.rrulestr } }).default?.rrulestr
const recurrenceEngine = createRecurrenceEngine({ rrulestr, formatInTimeZone, fromZonedTime })
import type { FamilyMember } from '../types'
import type { EventTransportationPlan } from './eventTransportation.ts'
import {
  syncTransportationAttendees,
  buildLogisticsStepsFromRoute,
  parseDistanceMilesFromSummary,
  buildEventTransportationPlanForMode,
  type LogisticsMode,
} from './eventTransportation.ts'
import {
  saveEventTransportationOverride,
} from './eventPlanOverrides.ts'
import {
  publishEventAggregatePatch,
  evictEventFromAllCaches,
} from './eventAggregateCache.ts'
import { normalizeAllDayEventRange } from '../utils/allDayEventRange.ts'
import { serializeToZonedIso } from '../utils/eventTime.ts'
import type { TravelBehavior } from '../components/calendar/living-flow/types.ts'

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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('casa-event-mutated', { detail: { eventId } }))
  }
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
    travelBehavior?: TravelBehavior
    driverLeg1?: string
    driverLeg2?: string
  },
  options?: {
    familyMembers?: FamilyMember[]
    homeAddress?: string
  },
): Promise<EventWithDetails> {
  const newEventId = crypto.randomUUID()
  const members = options?.familyMembers ?? []
  const homeAddress = options?.homeAddress || '3209 Washington Road, West Palm Beach, FL, 33405-1646'

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
  const locLower = `${locationName} ${address}`.toLowerCase()
  const isHomeLoc = locLower === 'home' || locLower === 'house' || locLower.includes('3209 washington')
  const defaultDriveMins = isHomeLoc ? 0 : (locLower.includes('bak') || locLower.includes('echo lake')) ? 20 : (locLower.includes('palm beach public') || locLower.includes('cocoanut')) ? 10 : 15
  const driveMins = isAllDay ? 0 : (overrides?.venue?.driveMinutes ?? syntheticEvent.enrichment?.drive_time_mins ?? defaultDriveMins)
  const routeSummary = isAllDay ? null : (overrides?.venue?.routeSummary ?? syntheticEvent.enrichment?.route_summary ?? (driveMins ? `${driveMins} min drive` : null))

  const depTimeIso = (!isAllDay && driveMins > 0)
    ? new Date(new Date(startTime).getTime() - driveMins * 60000).toISOString()
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

  // Resolve drivers
  const findMemberByName = (name?: string | null): FamilyMember | undefined => {
    if (!name) return undefined
    const lower = name.toLowerCase().trim()
    return members.find(m => m.name.toLowerCase() === lower || m.full_name?.toLowerCase() === lower)
  }

  const driver1Name = overrides?.driverLeg1 ?? syntheticEvent.plan_override?.transportation_plan?.legs?.[0]?.driverName ?? 'Jake'
  const driver2Name = overrides?.driverLeg2 ?? syntheticEvent.plan_override?.transportation_plan?.legs?.[1]?.driverName ?? driver1Name

  const driver1Member = findMemberByName(driver1Name)
  const driver2Member = findMemberByName(driver2Name)

  // Resolve travel behavior
  let travelBehavior: LogisticsMode = (overrides?.travelBehavior as LogisticsMode) ?? 'stay'
  if (!overrides?.travelBehavior) {
    const rawPlan = syntheticEvent.plan_override?.transportation_plan
    if (rawPlan) {
      if (rawPlan.legs.length === 0) travelBehavior = 'none'
      else if (rawPlan.legs.length === 1) {
        if (rawPlan.legs[0].purpose === 'dropoff') travelBehavior = 'dropoff_only'
        else if (rawPlan.legs[0].purpose === 'pickup') travelBehavior = 'pickup_only'
      } else if (rawPlan.waitOnSite) travelBehavior = 'stay'
      else travelBehavior = 'two_way'
    } else {
      const lowerTitle = title.toLowerCase()
      if (lowerTitle.includes('pick up') || lowerTitle.includes('pickup') || syntheticEvent.id?.startsWith('routine-pick-')) {
        travelBehavior = 'pickup_only'
      } else if (lowerTitle.includes('drop off') || lowerTitle.includes('dropoff') || syntheticEvent.id?.startsWith('routine-drop-')) {
        travelBehavior = 'dropoff_only'
      } else {
        travelBehavior = 'stay'
      }
    }
  }

  // Build target members: include kids/attendees and driver(s)
  const baseMemberIds = overrides?.selectedMemberIds ?? (syntheticEvent.members ?? [])
    .filter(m => m.role !== 'driver')
    .map(m => m.family_member?.id || m.id)
    .filter(Boolean)

  const activeDriverMembers = [
    (travelBehavior !== 'pickup_only' && driver1Member) ? driver1Member : null,
    (travelBehavior !== 'dropoff_only' && driver2Member) ? driver2Member : null,
  ].filter((m): m is FamilyMember => Boolean(m))

  const distinctMemberInserts = new Map<string, {
    event_id: string
    family_member_id: string
    role: string
    rsvp_status: 'accepted'
  }>()

  // Add passenger/attendee members
  for (const mid of baseMemberIds) {
    distinctMemberInserts.set(mid, {
      event_id: newEventId,
      family_member_id: mid,
      role: 'passenger',
      rsvp_status: 'accepted',
    })
  }

  // Add driver members
  for (const drv of activeDriverMembers) {
    distinctMemberInserts.set(drv.id, {
      event_id: newEventId,
      family_member_id: drv.id,
      role: 'driver',
      rsvp_status: 'accepted',
    })
  }

  const memberInserts = Array.from(distinctMemberInserts.values())

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

  // Build and save transportation plan override & logistics
  let planOverridePayload: any = null
  if (travelBehavior !== 'none' && !isAllDay && driveMins > 0) {
    const driver1Obj = { id: driver1Member?.id ?? null, name: driver1Name }
    const driver2Obj = { id: driver2Member?.id ?? null, name: driver2Name }
    const tempEvent: EventWithDetails = {
      ...syntheticEvent,
      id: newEventId,
      title,
      start_time: startTime,
      end_time: endTime,
      location_name: locationName,
      address,
      members: memberInserts.map(mi => ({
        id: crypto.randomUUID(),
        role: mi.role,
        family_member: members.find(m => m.id === mi.family_member_id)!,
      })).filter(m => Boolean(m.family_member)),
      enrichment: enrichmentPayload as any,
      plan_override: null,
      logistics: [],
      checklist: [],
      actions: [],
    }

    const transportationPlan = buildEventTransportationPlanForMode(
      tempEvent,
      homeAddress,
      travelBehavior,
      { driver1: driver1Obj, driver2: driver2Obj },
    )

    planOverridePayload = await saveEventTransportationOverride({
      supabase,
      queryClient,
      event: tempEvent,
      transportationPlan,
      waits: travelBehavior === 'stay',
      modeOverride: 'appointment',
      driverOverrides: {
        ...(driver1Obj.id ? { 0: driver1Obj.id } : {}),
        ...(driver2Obj.id ? { 1: driver2Obj.id } : {}),
      } as Record<number, string>,
    })

    // Insert logistics steps
    const attendeeNames = memberInserts
      .filter(m => m.role !== 'driver')
      .map(m => members.find(f => f.id === m.family_member_id)?.name || '')
      .filter(Boolean)
    const distMiles = parseDistanceMilesFromSummary(routeSummary)

    const steps = buildLogisticsStepsFromRoute({
      eventId: newEventId,
      eventTitle: title,
      startTime,
      endTime,
      venueName: locationName || 'Destination',
      venueAddress: address || '',
      homeAddress,
      driveMinutes: driveMins,
      distanceMiles: distMiles,
      driverLeg1: driver1Name,
      driverLeg2: driver2Name,
      attendees: attendeeNames,
      waitOnSite: travelBehavior === 'stay',
      mode: travelBehavior,
      bufferMinutes: 5,
    })

    if (steps.length > 0) {
      try {
        await supabase.from('event_logistics').insert(steps)
      } catch (logErr) {
        console.warn('[materializeSyntheticRoutineEvent] event_logistics error:', logErr)
      }
    }
  }

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
    plan_override: planOverridePayload,
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
  let startIso = serializeToZonedIso(startDate)
  let endIso = serializeToZonedIso(endDate)
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

  // 0ms Optimistic UI cache update for attendee avatars and chips
  const targetMember = allFamilyMembers.find((m) => m.id === memberId)
  let nextMembers = event.members ?? []
  if (isSelected && targetMember) {
    if (!nextMembers.some(m => (m.family_member?.id || m.id) === memberId)) {
      nextMembers = [
        ...nextMembers,
        {
          id: crypto.randomUUID(),
          role: 'attendee',
          family_member: targetMember,
        },
      ]
    }
  } else if (!isSelected) {
    nextMembers = nextMembers.filter(m => (m.family_member?.id || m.id) !== memberId)
  }

  publishEventAggregatePatch(queryClient, event.id, {
    members: nextMembers,
    updated_at: new Date().toISOString(),
  })

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

  // 0ms Optimistic UI cache update for category and mode switch
  publishEventAggregatePatch(queryClient, eventId, {
    event_type: mode === 'reminder' ? 'reminder' : 'event',
    enrichment: {
      category: catSlug,
      category_locked: true,
      updated_at: new Date().toISOString(),
    } as any,
    updated_at: new Date().toISOString(),
  })

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
  event?: EventWithDetails | null,
) {
  // 1. 0ms Evict from all cached queries immediately across all screens
  evictEventFromAllCaches(queryClient, eventId)

  // 2. If this is a synthetic routine event, persist a cancelled tombstone so routine generation suppresses it
  if (eventId.startsWith('routine-') && event) {
    await supabase.from('events').insert({
      id: crypto.randomUUID(),
      title: event.title,
      description: event.description,
      start_time: event.start_time,
      end_time: event.end_time,
      all_day: event.all_day ?? false,
      location_name: event.location_name,
      address: event.address,
      status: 'cancelled',
      record_kind: 'single',
      updated_at: new Date().toISOString(),
    })
    invalidateAllCalendarQueries(queryClient, eventId)
    return
  }

  // 3. Resolve Google sync info: extract from event or fetch from DB if needed
  let googleEventId = event?.google_event_id
  let googleCalendarId = event?.google_calendar_id
  let googleConnectionId = event?.google_connection_id
  let sourceMemberId = event?.source_member_id

  if (!googleEventId) {
    try {
      const { data: dbEvent } = await supabase
        .from('events')
        .select('google_event_id, google_calendar_id, google_connection_id, source_member_id')
        .eq('id', eventId)
        .maybeSingle()
      if (dbEvent) {
        googleEventId = dbEvent.google_event_id
        googleCalendarId = dbEvent.google_calendar_id
        googleConnectionId = dbEvent.google_connection_id
        sourceMemberId = dbEvent.source_member_id
      }
    } catch (dbLookupErr) {
      console.warn('[eventMutations] DB lookup error for Google sync fields:', dbLookupErr)
    }
  }

  // 4. Trigger Google deletion if this was a Google-synced event
  if (googleEventId) {
    try {
      const googleRes = await supabase.functions.invoke('delete-google-event', {
        body: {
          event_id: eventId,
          google_event_id: googleEventId,
          google_calendar_id: googleCalendarId,
          google_connection_id: googleConnectionId,
          source_member_id: sourceMemberId,
        },
      })
      if (googleRes.error) {
        const errorMsg = String(googleRes.error.message || '')
        const isNotFound = errorMsg.includes('404') || errorMsg.includes('410') || /not\s*found/i.test(errorMsg)
        if (!isNotFound) {
          console.warn('[eventMutations] Google Calendar deletion warning:', googleRes.error)
        }
      }
    } catch (err) {
      console.warn('[eventMutations] Background delete-google-event error:', err)
    }
  }

  // 5. Clean up dependent child tables to prevent foreign key lock delays/timeouts
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

export async function syncAndMaterializeRecurringSeries(
  supabase: SupabaseClient,
  templateEventId: string,
  options?: { rangeStartIso?: string; rangeEndIso?: string }
): Promise<void> {
  if (!templateEventId) return

  try {
    // 1. Fetch master template event
    const { data: master, error: masterErr } = await supabase
      .from('events')
      .select('*')
      .eq('id', templateEventId)
      .maybeSingle()

    if (masterErr || !master) {
      console.warn('[syncAndMaterializeRecurringSeries] Could not fetch master event:', masterErr)
      return
    }

    // 2. Fetch or create event_series entry
    let { data: series } = await supabase
      .from('event_series')
      .select('*')
      .or(`template_event_id.eq.${templateEventId},id.eq.${(master as any).series_id || '00000000-0000-0000-0000-000000000000'}`)
      .maybeSingle()

    const formattedRrule = master.rrule
      ? (master.rrule.startsWith('RRULE:') ? master.rrule : `RRULE:${master.rrule}`)
      : null

    if (formattedRrule) {
      if (series) {
        await supabase
          .from('event_series')
          .update({
            recurrence_lines: [formattedRrule],
            updated_at: new Date().toISOString(),
          })
          .eq('id', series.id)
        series.recurrence_lines = [formattedRrule]
      } else {
        const { data: createdSeries } = await supabase
          .from('event_series')
          .insert({
            template_event_id: templateEventId,
            recurrence_lines: [formattedRrule],
            ownership: 'casa',
            timezone: 'America/New_York',
            status: 'active',
          })
          .select('*')
          .maybeSingle()
        if (createdSeries) series = createdSeries
      }
    }

    if (series && series.recurrence_lines?.length) {
      // 3. Materialize occurrences locally using recurrence engine
      const startInstant = new Date(master.start_time)
      const endInstant = new Date(master.end_time)
      const durationMs = Math.max(0, endInstant.getTime() - startInstant.getTime())

      const rangeStart = options?.rangeStartIso || new Date(Date.now() - 30 * 86400000).toISOString()
      const rangeEnd = options?.rangeEndIso || new Date(Date.now() + 365 * 86400000).toISOString()

      const { occurrences } = recurrenceEngine.generateOccurrences({
        dtstart: master.start_time,
        durationMs,
        recurrenceLines: series.recurrence_lines,
        timezone: series.timezone || 'America/New_York',
        rangeStart,
        rangeEnd,
        allDay: master.all_day,
      })

      const exdatesSet = new Set<string>(series.exdates || [])

      // Filter out occurrences matching exdates
      const filteredOccurrences = occurrences.filter((occ: { occurrenceKey: string; start: string }) => {
        if (exdatesSet.has(occ.occurrenceKey)) return false
        if (exdatesSet.has(occ.start)) return false
        return true
      })

      // Fetch existing occurrences for this series or master
      const { data: existingOccurrences } = await supabase
        .from('events')
        .select('id, occurrence_key, status, start_time')
        .or(`series_id.eq.${series.id},recurrence_master_id.eq.${templateEventId}`)
        .eq('record_kind', 'occurrence')

      const validKeys = new Set(filteredOccurrences.map((o: { occurrenceKey: string }) => o.occurrenceKey))
      const existingSet = new Set((existingOccurrences || []).map((o) => o.occurrence_key))

      // Prune stale occurrences no longer valid under the updated RRULE (e.g. past UNTIL date or in EXDATE)
      const staleOccurrences = (existingOccurrences || []).filter((o) => {
        if (!o.occurrence_key) return true
        return !validKeys.has(o.occurrence_key)
      })

      if (staleOccurrences.length > 0) {
        const staleIds = staleOccurrences.map((o) => o.id)
        await supabase.from('event_members').delete().in('event_id', staleIds)
        await supabase.from('events').delete().in('id', staleIds)
      }

      // Upsert missing occurrences
      for (const occ of filteredOccurrences) {
        if (!existingSet.has(occ.occurrenceKey)) {
          await supabase.from('events').insert({
            title: master.title,
            description: master.description,
            start_time: occ.start,
            end_time: occ.end,
            all_day: master.all_day,
            location_name: master.location_name,
            address: master.address,
            record_kind: 'occurrence',
            series_id: series.id,
            recurrence_master_id: templateEventId,
            occurrence_key: occ.occurrenceKey,
            original_start_time: occ.originalStartTime,
            status: 'confirmed',
            source_member_id: master.source_member_id,
            google_calendar_id: master.google_calendar_id,
            google_connection_id: master.google_connection_id,
          })
        }
      }
    }

    // 4. Trigger Google Calendar sync
    triggerGoogleEventSync(supabase, templateEventId)

    // 5. Background double-insurance
    void supabase.functions.invoke('materialize-recurring-events', { body: {} }).catch(() => {})
  } catch (err) {
    console.error('[syncAndMaterializeRecurringSeries] Error during series sync and materialization:', err)
  }
}

export async function createOccurrenceException(
  supabase: SupabaseClient,
  occurrenceId: string,
  updates: Partial<EventWithDetails>
): Promise<string | null> {
  const { data: occ, error: fetchErr } = await supabase
    .from('events')
    .select('*')
    .eq('id', occurrenceId)
    .single()

  if (fetchErr || !occ) throw new Error(`Occurrence ${occurrenceId} not found`)

  const originalStartTime = occ.original_start_time || occ.start_time

  const { data: updated, error: updateErr } = await supabase
    .from('events')
    .update({
      ...updates,
      is_exception: true,
      record_kind: 'occurrence',
      original_start_time: originalStartTime,
      updated_at: new Date().toISOString(),
    })
    .eq('id', occurrenceId)
    .select('id')
    .single()

  if (updateErr) throw updateErr

  if (occ.recurrence_master_id) {
    triggerGoogleEventSync(supabase, occ.recurrence_master_id)
  }

  return updated?.id || occurrenceId
}

export async function excludeOccurrence(
  supabase: SupabaseClient,
  occurrenceId: string
): Promise<void> {
  const { data: occ, error: fetchErr } = await supabase
    .from('events')
    .select('id, series_id, recurrence_master_id, occurrence_key, start_time')
    .eq('id', occurrenceId)
    .single()

  if (fetchErr || !occ) return

  const targetKey = occ.occurrence_key || occ.start_time

  if (occ.series_id) {
    const { data: series } = await supabase
      .from('event_series')
      .select('exdates')
      .eq('id', occ.series_id)
      .maybeSingle()

    const currentExdates: string[] = series?.exdates || []
    if (!currentExdates.includes(targetKey)) {
      await supabase
        .from('event_series')
        .update({
          exdates: [...currentExdates, targetKey],
          updated_at: new Date().toISOString(),
        })
        .eq('id', occ.series_id)
    }
  }

  await supabase.from('event_members').delete().eq('event_id', occurrenceId)
  await supabase.from('events').delete().eq('id', occurrenceId)

  if (occ.recurrence_master_id) {
    triggerGoogleEventSync(supabase, occ.recurrence_master_id)
  }
}

