import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../lib/supabase'
import { useFamilyMembers } from '../../../../hooks/useFamilyMembers'
import { useSavedPlaces, findSavedPlaceByAddress } from '../../../../hooks/useSavedPlaces'
import { CATEGORY_LABEL } from '../../categoryFields'
import { getEventStartDate, getEventEndDate } from '../../../../utils/eventTime'
import type { EventWithDetails } from '../../../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../../../types'
import type { LivingFlowState, LivingFlowMode, TravelBehavior, RecurrenceScope, VenueInfo } from '../types'
import {
  buildEventTransportationPlanForMode,
  buildLogisticsStepsFromRoute,
  parseDistanceMilesFromSummary,
  type LogisticsMode,
} from '../../../../lib/eventTransportation'
import { saveEventTransportationOverride } from '../../../../lib/eventPlanOverrides'
import { useAppStore } from '../../../../stores/appStore'
import type { EventLocationScope } from '../../../../lib/eventLocation'
import {
  loadRecurringEditorContext,
  saveRecurringEditorMutation,
  deleteRecurringEditorMutation,
  announceRecurringDelete,
  announceRecurringSave,
  truncateRecurrenceLinesForFuture,
  type RecurringEditorContext,
} from '../../../../lib/recurringEventEditor'
import {
  materializeSyntheticRoutineEvent,
  updateEventTitle,
  updateEventSchedule,
  updateEventVenue,
  toggleEventAttendee,
  updateEventCategory,
  snoozeEventOrReminder,
  completeEventOrReminder,
  deleteCalendarEvent,
  triggerGoogleEventSync,
  invalidateAllCalendarQueries,
} from '../../../../lib/eventMutations'
import { evictEventFromAllCaches } from '../../../../lib/eventAggregateCache'


const DEFAULT_VENUE: VenueInfo = {
  name: 'Home',
  address: '',
  driveMinutes: 0,
  distanceMiles: 0
}

function normalizeCategoryName(rawCat?: string | null): { slug: string; label: string } {
  if (!rawCat) return { slug: 'social', label: 'Social' }
  const lower = rawCat.toLowerCase().replace(/\s+/g, '_')
  const label = CATEGORY_LABEL[lower] || rawCat.charAt(0).toUpperCase() + rawCat.slice(1).replace(/_/g, ' ')
  return { slug: lower, label }
}

function isLikelyReminderOrHome(event: EventWithDetails | null, rawCategory?: string | null): boolean {
  if (!event) return false
  if (event.event_type === 'reminder') return true
  const cat = (rawCategory || event.enrichment?.category || '').toLowerCase()
  if (['home_maintenance', 'errand', 'chores', 'meds_health', 'pet_care', 'family_admin'].includes(cat)) {
    return true
  }
  const hasNoAddress = !event.address || event.address.trim() === ''
  const isHomeLocation = (event.location_name || '').toLowerCase() === 'home'
  if (hasNoAddress && isHomeLocation) return true
  return false
}

export function useLivingFlowState(initialEvent: EventWithDetails | null, onClose?: () => void) {
  const queryClient = useQueryClient()
  const { data: familyMembers = [] } = useFamilyMembers()
  const { data: savedPlaces = [] } = useSavedPlaces()

  // Derive initial values from real event
  const initialStartDate = useMemo(() => {
    if (!initialEvent) return new Date()
    return getEventStartDate(initialEvent)
  }, [initialEvent?.start_time, initialEvent?.all_day])

  const initialEndDate = useMemo(() => {
    if (!initialEvent) {
      const d = new Date()
      d.setMinutes(d.getMinutes() + 60)
      return d
    }
    return getEventEndDate(initialEvent)
  }, [initialEvent?.start_time, initialEvent?.end_time, initialEvent?.all_day])

  const initialDuration = useMemo(() => {
    const diff = initialEndDate.getTime() - initialStartDate.getTime()
    return Math.max(15, Math.round(diff / (1000 * 60)))
  }, [initialStartDate, initialEndDate])

  const initialVenue = useMemo<VenueInfo>(() => {
    if (!initialEvent?.location_name && !initialEvent?.address) {
      return DEFAULT_VENUE
    }
    const matchedPlace = findSavedPlaceByAddress(savedPlaces, initialEvent.address)
    const isHome = (initialEvent.location_name || '').toLowerCase() === 'home' || !initialEvent.address
    const enr = initialEvent.enrichment
    const distFromSummary = parseDistanceMilesFromSummary(enr?.route_summary)

    return {
      name: initialEvent.location_name || matchedPlace?.name || 'Destination',
      address: initialEvent.address || '',
      driveMinutes: isHome ? 0 : (enr?.drive_time_mins ?? 0),
      distanceMiles: isHome ? 0 : (distFromSummary ?? 0),
      routeSummary: isHome ? null : (enr?.route_summary ?? null),
    }
  }, [initialEvent?.location_name, initialEvent?.address, initialEvent?.enrichment, savedPlaces])

  // Extract initial attendee IDs
  const initialMemberIds = useMemo(() => {
    if (!initialEvent?.members || initialEvent.members.length === 0) {
      return familyMembers.filter((m: FamilyMember) => m.role === 'parent').map((m: FamilyMember) => m.id)
    }
    return initialEvent.members
      .map((m) => m.family_member?.id || m.id)
      .filter(Boolean)
  }, [initialEvent?.members, familyMembers])

  // Primary attendee
  const initialPrimaryId = useMemo(() => {
    return initialMemberIds[0] || familyMembers.find((m: FamilyMember) => m.role === 'parent')?.id || null
  }, [initialMemberIds, familyMembers])

  const initialTravelBehavior = useMemo<TravelBehavior>(() => {
    const plan = initialEvent?.plan_override?.transportation_plan
    if (plan) {
      if (Array.isArray(plan.legs) && plan.legs.length === 0) return 'none'
      if (plan.legs.length === 1) {
        if (plan.legs[0].purpose === 'dropoff') return 'dropoff_only'
        if (plan.legs[0].purpose === 'pickup') return 'pickup_only'
      }
      if (plan.waitOnSite || initialEvent?.plan_override?.waits !== false) {
        return 'stay'
      }
      return 'two_way'
    }
    const title = (initialEvent?.title || '').toLowerCase()
    if (title.includes('pick up') || title.includes('pickup') || initialEvent?.id?.startsWith('routine-pick-')) {
      return 'pickup_only'
    }
    if (title.includes('drop off') || title.includes('dropoff') || initialEvent?.id?.startsWith('routine-drop-')) {
      return 'dropoff_only'
    }
    return initialEvent?.plan_override?.waits === false ? 'two_way' : 'stay'
  }, [initialEvent?.plan_override, initialEvent?.title, initialEvent?.id])

  const initialDriverLeg1 = useMemo(() => {
    const plan = initialEvent?.plan_override?.transportation_plan
    if (plan?.legs?.[0]?.driverName && plan?.legs?.[0]?.purpose !== 'pickup') return plan.legs[0].driverName
    const overrideId = initialEvent?.plan_override?.driver_overrides?.[0]
    if (overrideId) {
      const match = familyMembers.find(m => m.id === overrideId)
      if (match) return match.name
    }
    const driverMember = initialEvent?.members?.find(m => m.role === 'driver')?.family_member
    if (driverMember?.name) return driverMember.name
    const parent = familyMembers.find(m => m.role === 'parent' && m.can_drive)
    return parent?.name || 'Kelly'
  }, [initialEvent?.plan_override, initialEvent?.members, familyMembers])

  const initialDriverLeg2 = useMemo(() => {
    const plan = initialEvent?.plan_override?.transportation_plan
    if (plan?.legs?.[1]?.driverName) return plan.legs[1].driverName
    if (plan?.legs?.[0]?.purpose === 'pickup' && plan?.legs?.[0]?.driverName) return plan.legs[0].driverName
    const overrideId = initialEvent?.plan_override?.driver_overrides?.[1]
    if (overrideId) {
      const match = familyMembers.find(m => m.id === overrideId)
      if (match) return match.name
    }
    const driverMember = initialEvent?.members?.find(m => m.role === 'driver')?.family_member
    if (driverMember?.name) return driverMember.name
    return initialDriverLeg1
  }, [initialEvent?.plan_override, initialEvent?.members, familyMembers, initialDriverLeg1])

  const normalizedCategory = useMemo(() => {
    return normalizeCategoryName(initialEvent?.enrichment?.category)
  }, [initialEvent?.enrichment?.category])

  const initialMode = useMemo<LivingFlowMode>(() => {
    return isLikelyReminderOrHome(initialEvent, initialEvent?.enrichment?.category) ? 'reminder' : 'event'
  }, [initialEvent])

  const initialIsAllDay = useMemo(() => {
    return Boolean(initialEvent?.all_day)
  }, [initialEvent?.all_day])

  // Local State
  const [state, setState] = useState<LivingFlowState>({
    mode: initialMode,
    title: initialEvent?.title || 'New Event',
    category: normalizedCategory.label,
    categoryIcon: '',
    travelBehavior: initialTravelBehavior,
    driverLeg1: initialDriverLeg1,
    driverLeg2: initialDriverLeg2,
    startDate: initialStartDate,
    endDate: initialEndDate,
    durationMinutes: initialDuration,
    isAllDay: initialIsAllDay,
    bufferMinutes: 5,
    recurScope: 'this',
    venue: initialVenue,
    selectedMemberIds: initialMemberIds,
    primaryMemberId: initialPrimaryId
  })

  // Canonical v2 occurrences use series_id; legacy instances use recurrence_master_id
  const isCanonicalOccurrence = Boolean(initialEvent?.series_id && initialEvent?.record_kind === 'occurrence')
  const [recurringContext, setRecurringContext] = useState<RecurringEditorContext | null>(null)
  const [recurringEditorEnabled, setRecurringEditorEnabled] = useState(false)
  const [recurringEditorWritable, setRecurringEditorWritable] = useState(false)
  const [recurringDeleteEnabled, setRecurringDeleteEnabled] = useState(false)
  const [recurringContextLoading, setRecurringContextLoading] = useState(false)
  const [showDeleteScopeModal, setShowDeleteScopeModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteBlocked, setDeleteBlocked] = useState(false)
  const recurringDeleteActionIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!initialEvent?.id || !isCanonicalOccurrence) {
      setRecurringContext(null)
      setRecurringEditorEnabled(false)
      setRecurringEditorWritable(false)
      setRecurringDeleteEnabled(false)
      setRecurringContextLoading(false)
      return
    }
    let cancelled = false
    setRecurringContextLoading(true)
    setDeleteError(null)
    loadRecurringEditorContext(initialEvent.id)
      .then((result) => {
        if (cancelled) return
        setRecurringEditorEnabled(result.enabled)
        setRecurringEditorWritable(Boolean(result.writable))
        setRecurringDeleteEnabled(Boolean(result.deletable))
        setRecurringContext(result.context ?? null)
      })
      .catch((error: Error) => {
        if (!cancelled) {
          console.warn('[useLivingFlowState] Could not load recurring event context:', error)
        }
      })
      .finally(() => {
        if (!cancelled) setRecurringContextLoading(false)
      })
    return () => { cancelled = true }
  }, [initialEvent?.id, isCanonicalOccurrence])

  const currentEventIdRef = useRef(initialEvent?.id)
  const activeEventRef = useRef<EventWithDetails | null>(initialEvent)
  const lastEventUpdatedAtRef = useRef(initialEvent?.updated_at)

  // Sync state whenever event prop changes
  useEffect(() => {
    if (!initialEvent) return
    const isNewEvent = initialEvent.id !== currentEventIdRef.current
    const isServerUpdate = Boolean(initialEvent.updated_at && initialEvent.updated_at !== lastEventUpdatedAtRef.current)
    currentEventIdRef.current = initialEvent.id
    activeEventRef.current = initialEvent
    lastEventUpdatedAtRef.current = initialEvent.updated_at

    const cat = normalizeCategoryName(initialEvent.enrichment?.category)
    const mode = isLikelyReminderOrHome(initialEvent, initialEvent.enrichment?.category) ? 'reminder' : 'event'

    setState(prev => {
      const venuePropChanged = initialVenue.name !== prev.venue.name || initialVenue.address !== prev.venue.address
      return {
        ...prev,
        mode,
        title: isNewEvent || isServerUpdate ? (initialEvent.title || 'New Event') : (prev.title || initialEvent.title),
        category: cat.label,
        startDate: isNewEvent || isServerUpdate ? initialStartDate : prev.startDate,
        endDate: isNewEvent || isServerUpdate ? initialEndDate : prev.endDate,
        durationMinutes: isNewEvent || isServerUpdate ? initialDuration : prev.durationMinutes,
        isAllDay: isNewEvent || isServerUpdate ? initialIsAllDay : (prev.isAllDay ?? initialIsAllDay),
        venue: isNewEvent || isServerUpdate || venuePropChanged ? initialVenue : prev.venue,
        selectedMemberIds: isNewEvent || isServerUpdate ? initialMemberIds : prev.selectedMemberIds,
        primaryMemberId: isNewEvent || isServerUpdate ? initialPrimaryId : prev.primaryMemberId,
        travelBehavior: isNewEvent || isServerUpdate ? initialTravelBehavior : prev.travelBehavior,
        driverLeg1: isNewEvent || isServerUpdate ? initialDriverLeg1 : prev.driverLeg1,
        driverLeg2: isNewEvent || isServerUpdate ? initialDriverLeg2 : prev.driverLeg2,
      }
    })
  }, [initialEvent?.id, initialEvent?.updated_at, initialStartDate, initialEndDate, initialDuration, initialIsAllDay, initialVenue, initialMemberIds, initialPrimaryId, initialTravelBehavior, initialDriverLeg1, initialDriverLeg2])

  // Resolve live route ETA if event has destination address but missing computed driving metrics
  useEffect(() => {
    if (!initialEvent?.id || !initialEvent.address || (initialEvent.location_name || '').toLowerCase() === 'home') {
      return
    }
    const hasDriveMins = (initialEvent.enrichment?.drive_time_mins ?? 0) > 0
    if (hasDriveMins) return

    let isMounted = true
    setState(prev => ({ ...prev, isCalculatingRoute: true }))

    void (async () => {
      try {
        const { data } = await supabase.functions.invoke('route-eta', {
          body: {
            destination: initialEvent.address,
            arrival_time: initialStartDate.toISOString(),
            buffer_mins: 5,
          },
        })
        if (isMounted && data?.found) {
          const resolvedVenue: VenueInfo = {
            name: initialEvent.location_name || 'Destination',
            address: initialEvent.address || '',
            driveMinutes: data.drive_time_mins ?? 0,
            distanceMiles: data.distance_miles ?? parseDistanceMilesFromSummary(data.route_summary) ?? 0,
            routeSummary: data.route_summary ?? null,
            trafficDelayMinutes: data.traffic_delay_mins ?? 0,
          }
          setState(prev => ({
            ...prev,
            venue: resolvedVenue,
            isCalculatingRoute: false,
          }))
          void updateEventVenue(supabase, queryClient, initialEvent, {
            name: resolvedVenue.name,
            address: resolvedVenue.address,
            driveMinutes: resolvedVenue.driveMinutes,
            distanceMiles: resolvedVenue.distanceMiles,
            routeSummary: resolvedVenue.routeSummary ?? undefined,
          }, { familyMembers })
        } else if (isMounted) {
          setState(prev => ({ ...prev, isCalculatingRoute: false }))
        }
      } catch {
        if (isMounted) setState(prev => ({ ...prev, isCalculatingRoute: false }))
      }
    })()

    return () => { isMounted = false }
  }, [initialEvent?.id, initialEvent?.address, initialStartDate, familyMembers, queryClient])

  // Computed Departure Time (Outbound / Drop-off)
  const departureDate = useMemo(() => {
    const totalPreMinutes = (state.venue.driveMinutes || 0) + state.bufferMinutes
    const base = !state.startDate || isNaN(new Date(state.startDate).getTime()) ? new Date() : new Date(state.startDate)
    base.setMinutes(base.getMinutes() - totalPreMinutes)
    return base
  }, [state.startDate, state.venue.driveMinutes, state.bufferMinutes])

  // Computed Pickup Departure Time (Inbound Departure for Pickup)
  const pickupDepartureDate = useMemo(() => {
    const totalPreMinutes = (state.venue.driveMinutes || 0) + state.bufferMinutes
    const anchorDate = state.travelBehavior === 'pickup_only' ? state.startDate : state.endDate
    const base = !anchorDate || isNaN(new Date(anchorDate).getTime()) ? new Date() : new Date(anchorDate)
    base.setMinutes(base.getMinutes() - totalPreMinutes)
    return base
  }, [state.startDate, state.endDate, state.travelBehavior, state.venue.driveMinutes, state.bufferMinutes])

  // Computed Return Time
  const returnDate = useMemo(() => {
    const base = !state.endDate || isNaN(new Date(state.endDate).getTime()) ? new Date() : new Date(state.endDate)
    base.setMinutes(base.getMinutes() + (state.venue.driveMinutes || 0))
    return base
  }, [state.endDate, state.venue.driveMinutes])

  // ═══════════════ REAL SUPABASE MUTATIONS ═══════════════

  const invalidateCalendar = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['events'] })
    void queryClient.invalidateQueries({ queryKey: ['today-events'] })
    void queryClient.invalidateQueries({ queryKey: ['rolling-events'] })
    void queryClient.invalidateQueries({ queryKey: ['prep-items'] })
    void queryClient.invalidateQueries({ queryKey: ['conflicts'] })
    void queryClient.invalidateQueries({ queryKey: ['event-details'] })
    void queryClient.invalidateQueries({ queryKey: ['member-availability-rules'] })
    void queryClient.invalidateQueries({ queryKey: ['member-availability-exceptions'] })
    if (initialEvent?.id) {
      void queryClient.invalidateQueries({ queryKey: ['event-details', initialEvent.id] })
    }
    void queryClient.refetchQueries({ queryKey: ['events'], type: 'active' })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('casa:event-updated', { detail: { eventId: initialEvent?.id } }))
      window.dispatchEvent(new CustomEvent('casa:overrides-updated'))
    }
  }, [queryClient, initialEvent?.id])

  const persistDriverAndTravel = useCallback(async (
    newDriverLeg1: string,
    newDriverLeg2: string,
    newBehavior: TravelBehavior,
  ) => {
    let currentEvent = activeEventRef.current || initialEvent
    if (!currentEvent?.id) return

    const findMember = (name: string): FamilyMember | undefined => {
      const lower = name.toLowerCase().trim()
      return familyMembers.find(m => m.name.toLowerCase() === lower || m.full_name?.toLowerCase() === lower)
    }

    const driver1Member = findMember(newDriverLeg1)
    const driver2Member = findMember(newDriverLeg2)
    const driver1 = { id: driver1Member?.id ?? null, name: newDriverLeg1 }
    const driver2 = { id: driver2Member?.id ?? null, name: newDriverLeg2 }

    const homeAddress = '3209 Washington Road, West Palm Beach, FL, 33405-1646'
    const waits = newBehavior === 'stay'

    try {
      if (currentEvent.id.startsWith('routine-')) {
        const materialized = await materializeSyntheticRoutineEvent(
          supabase,
          queryClient,
          currentEvent,
          {
            travelBehavior: newBehavior,
            driverLeg1: newDriverLeg1,
            driverLeg2: newDriverLeg2,
          },
          { familyMembers, homeAddress },
        )
        activeEventRef.current = materialized
        currentEventIdRef.current = materialized.id
        useAppStore.getState().setSelectedSidecarEventId(materialized.id)
        return
      }

      const logisticsMode: LogisticsMode =
        newBehavior === 'dropoff' || newBehavior === 'dropoff_only' ? 'dropoff_only' :
        newBehavior === 'pickup_only' ? 'pickup_only' :
        newBehavior

      const finalPlan = buildEventTransportationPlanForMode(
        currentEvent,
        homeAddress,
        logisticsMode,
        { driver1, driver2 },
      )

      await saveEventTransportationOverride({
        supabase,
        queryClient,
        event: currentEvent,
        transportationPlan: finalPlan,
        waits,
        modeOverride: currentEvent.plan_override?.mode_override || 'appointment',
        driverOverrides: {
          ...(driver1.id ? { 0: driver1.id } : {}),
          ...(driver2.id ? { 1: driver2.id } : {}),
        } as Record<number, string>,
      })

      // Sync driver(s) to event_members
      const relevantDriverIds = [
        (newBehavior !== 'pickup_only' && driver1Member?.id) ? driver1Member.id : null,
        (newBehavior !== 'dropoff_only' && driver2Member?.id) ? driver2Member.id : null,
      ].filter((id): id is string => Boolean(id))

      if (relevantDriverIds.length > 0) {
        const existingMembers = currentEvent.members || []
        const existingMemberIds = new Set(existingMembers.map(m => m.family_member?.id || m.id))
        for (const drvId of relevantDriverIds) {
          if (!existingMemberIds.has(drvId)) {
            await supabase.from('event_members').insert({
              event_id: currentEvent.id,
              family_member_id: drvId,
              role: 'driver',
              rsvp_status: 'accepted',
            })
          }
        }
      }

      // Update event_logistics
      const isHome = (currentEvent.location_name || '').toLowerCase() === 'home' || !currentEvent.address?.trim()
      const driveMins = currentEvent.enrichment?.drive_time_mins ?? 0
      if (!isHome && driveMins > 0) {
        const attendeeNames = (currentEvent.members ?? [])
          .filter(m => m.role !== 'driver')
          .map(m => m.family_member?.name || '')
          .filter(Boolean)
        const distMiles = currentEvent.enrichment ? parseDistanceMilesFromSummary(currentEvent.enrichment.route_summary) : 0
        const steps = buildLogisticsStepsFromRoute({
          eventId: currentEvent.id,
          eventTitle: currentEvent.title,
          startTime: currentEvent.start_time || new Date().toISOString(),
          endTime: currentEvent.end_time || new Date().toISOString(),
          venueName: currentEvent.location_name || 'Destination',
          venueAddress: currentEvent.address || '',
          homeAddress,
          driveMinutes: driveMins,
          distanceMiles: distMiles,
          driverLeg1: newDriverLeg1,
          driverLeg2: newDriverLeg2,
          attendees: attendeeNames,
          waitOnSite: waits,
          mode: newBehavior,
          bufferMinutes: 5,
        })
        if (steps.length > 0) {
          try {
            await supabase.from('event_logistics').delete().eq('event_id', currentEvent.id)
            await supabase.from('event_logistics').insert(steps)
          } catch (logErr) {
            console.warn('[LivingFlow] Failed to update logistics steps on driver change:', logErr)
          }
        }
      }

      invalidateCalendar()
      triggerGoogleEventSync(supabase, currentEvent.id)
    } catch (err) {
      console.error('[LivingFlow] Failed to persist driver and travel:', err)
    }
  }, [initialEvent, familyMembers, queryClient, invalidateCalendar])

  // Scoped recurring field mutation helper
  const persistRecurringFieldMutation = useCallback(async (
    changedField: 'title' | 'schedule' | 'venue' | 'attendees' | 'category',
    values: {
      title?: string
      startDate?: Date
      endDate?: Date
      durationMinutes?: number
      isAllDay?: boolean
      venue?: VenueInfo
      selectedMemberIds?: string[]
      category?: string
      mode?: LivingFlowMode
    }
  ): Promise<boolean> => {
    if (!initialEvent?.id) return false
    if (!isCanonicalOccurrence || !recurringEditorEnabled || !recurringEditorWritable || !recurringContext) {
      return false
    }

    const scope = state.recurScope
    const snapshot = recurringContext.effective_bundle as {
      event?: Record<string, unknown>
      members?: Array<Record<string, unknown>>
      enrichment?: Record<string, unknown> | null
    }
    const baselineEvent = snapshot.event ?? (initialEvent as unknown as Record<string, unknown>)
    const changedPaths: string[] = []

    const newIsAllDay = values.isAllDay !== undefined ? values.isAllDay : (state.isAllDay ?? false)
    const newTitle = (values.title ?? state.title).trim()
    const newStart = values.startDate ? values.startDate.toISOString() : (state.startDate ? state.startDate.toISOString() : initialEvent.start_time)
    const newEnd = values.endDate ? values.endDate.toISOString() : (state.endDate ? state.endDate.toISOString() : initialEvent.end_time)
    const durationMs = new Date(newEnd).getTime() - new Date(newStart).getTime()
    const venueInfo = values.venue ?? state.venue
    const newLocation = (venueInfo.name || '').trim() || null
    const newAddress = (venueInfo.address || '').trim() || null
    const memberIds = values.selectedMemberIds ?? state.selectedMemberIds
    const catName = values.category ?? state.category
    const catSlug = normalizeCategoryName(catName).slug

    if (changedField === 'title' || newTitle !== baselineEvent.title) {
      changedPaths.push('event.title')
    }
    if (changedField === 'schedule' || newStart !== baselineEvent.start_time || newEnd !== baselineEvent.end_time || newIsAllDay !== Boolean(baselineEvent.all_day)) {
      changedPaths.push('event.startTime')
      changedPaths.push('event.endTime')
      changedPaths.push('event.allDay')
    }
    if (changedField === 'venue' || newLocation !== ((baselineEvent.location_name as string | null)?.trim() || null) || newAddress !== ((baselineEvent.address as string | null)?.trim() || null)) {
      changedPaths.push('event.locationName')
      changedPaths.push('event.address')
    }
    if (changedField === 'attendees') {
      changedPaths.push('assignments')
    }
    if (changedField === 'category') {
      changedPaths.push('enrichment')
    }

    if (changedPaths.length === 0) return true

    const assignments = memberIds.map((mid) => ({
      family_member_id: mid,
      role: 'attendee',
    })).sort((a, b) => a.family_member_id.localeCompare(b.family_member_id))

    const enrichment = {
      ...(snapshot.enrichment ?? {}),
      category: catSlug,
    }
    delete (enrichment as Record<string, unknown>).id
    delete (enrichment as Record<string, unknown>).event_id
    delete (enrichment as Record<string, unknown>).created_at
    delete (enrichment as Record<string, unknown>).updated_at

    const detailPatch = {
      event: {
        title: newTitle,
        start_time: newStart,
        end_time: newEnd,
        duration_ms: Math.max(15 * 60 * 1000, durationMs),
        all_day: newIsAllDay,
        event_type: values.mode === 'reminder' ? 'reminder' : 'event',
        location_name: newLocation,
        address: newAddress,
        lat: initialEvent.lat ?? null,
        lng: initialEvent.lng ?? null,
      },
      assignments,
      enrichment,
    }

    const seriesPatch: Record<string, unknown> = {
      timezone: recurringContext.series.timezone,
      recurrence_lines: recurringContext.series.recurrence_lines,
    }

    const actionId = crypto.randomUUID()
    const result = await saveRecurringEditorMutation({
      selected_event_id: initialEvent.id,
      action_id: actionId,
      scope,
      expected_series_revision: recurringContext.series.revision,
      changed_paths: changedPaths,
      detail_patch: detailPatch,
      series_patch: seriesPatch,
      preserve_exceptions: true,
    })

    announceRecurringSave({
      title: newTitle,
      affected_occurrences: result.result?.affected_occurrences ?? 0,
      google_sync_status: result.result?.google_sync_status ?? 'not_enabled',
    })

    if (result.result?.series_revision) {
      setRecurringContext(current => current ? {
        ...current,
        series: { ...current.series, revision: result.result.series_revision }
      } : current)
    }

    invalidateCalendar()
    return true
  }, [initialEvent, isCanonicalOccurrence, recurringEditorEnabled, recurringEditorWritable, recurringContext, state, invalidateCalendar])

  // Update Title
  const updateTitle = useCallback(async (newTitle: string) => {
    const trimmed = newTitle.trim() || 'Untitled'
    setState(prev => ({ ...prev, title: trimmed }))
    const currentEvent = activeEventRef.current || initialEvent
    if (!currentEvent?.id) return

    try {
      if (currentEvent.id.startsWith('routine-')) {
        const materialized = await materializeSyntheticRoutineEvent(
          supabase,
          queryClient,
          currentEvent,
          { title: trimmed },
          { familyMembers },
        )
        activeEventRef.current = materialized
        currentEventIdRef.current = materialized.id
        useAppStore.getState().setSelectedSidecarEventId(materialized.id)
        return
      }

      const handled = await persistRecurringFieldMutation('title', { title: trimmed })
      if (!handled) {
        await updateEventTitle(supabase, queryClient, currentEvent.id, trimmed)
      }
    } catch (err) {
      console.error('[LivingFlow] Failed to update event title:', err)
    }
  }, [initialEvent, persistRecurringFieldMutation, queryClient, familyMembers])

  // Toggle Attendee
  const toggleMember = useCallback(async (memberId: string) => {
    const isSelected = state.selectedMemberIds.includes(memberId)
    const nextIds = isSelected 
      ? state.selectedMemberIds.filter(id => id !== memberId)
      : [...state.selectedMemberIds, memberId]

    setState(prev => ({ ...prev, selectedMemberIds: nextIds }))
    const currentEvent = activeEventRef.current || initialEvent
    if (!currentEvent?.id) return

    try {
      if (currentEvent.id.startsWith('routine-')) {
        const materialized = await materializeSyntheticRoutineEvent(
          supabase,
          queryClient,
          currentEvent,
          { selectedMemberIds: nextIds },
          { familyMembers },
        )
        activeEventRef.current = materialized
        currentEventIdRef.current = materialized.id
        useAppStore.getState().setSelectedSidecarEventId(materialized.id)
        return
      }

      const handled = await persistRecurringFieldMutation('attendees', { selectedMemberIds: nextIds })
      if (!handled) {
        await toggleEventAttendee(supabase, queryClient, currentEvent, memberId, !isSelected, familyMembers)
      }
    } catch (err) {
      console.error('[LivingFlow] Failed to toggle member:', err)
    }
  }, [initialEvent, state.selectedMemberIds, persistRecurringFieldMutation, familyMembers, queryClient])

  // Set Travel Behavior
  const setTravelBehavior = useCallback((behavior: TravelBehavior) => {
    setState(prev => {
      const nextLeg2 = behavior === 'stay' ? prev.driverLeg1 : prev.driverLeg2
      void persistDriverAndTravel(prev.driverLeg1, nextLeg2, behavior)
      return { ...prev, travelBehavior: behavior, driverLeg2: nextLeg2 }
    })
  }, [persistDriverAndTravel])

  // Set Driver
  const setDriver = useCallback((leg: 1 | 2, driverName: string, syncBoth: boolean) => {
    setState(prev => {
      const nextLeg1 = (syncBoth || prev.travelBehavior === 'stay' || leg === 1) ? driverName : prev.driverLeg1
      const nextLeg2 = (syncBoth || prev.travelBehavior === 'stay' || leg === 2) ? driverName : prev.driverLeg2
      void persistDriverAndTravel(nextLeg1, nextLeg2, prev.travelBehavior)
      return {
        ...prev,
        driverLeg1: nextLeg1,
        driverLeg2: nextLeg2
      }
    })
  }, [persistDriverAndTravel])

  // Set Venue / Address
  const setVenue = useCallback(async (venue: VenueInfo) => {
    const isHome = (venue.name || '').toLowerCase() === 'home' || !venue.address?.trim()

    setState(prev => ({
      ...prev,
      venue: {
        ...venue,
        driveMinutes: isHome ? 0 : (venue.driveMinutes || prev.venue.driveMinutes || 0),
        distanceMiles: isHome ? 0 : (venue.distanceMiles || prev.venue.distanceMiles || 0),
      },
      isCalculatingRoute: !isHome && !venue.driveMinutes,
    }))

    const currentEvent = activeEventRef.current || initialEvent
    if (!currentEvent?.id) return

    let calculatedVenue = { ...venue }

    if (!isHome && (!calculatedVenue.driveMinutes || calculatedVenue.driveMinutes === 0)) {
      try {
        const { data } = await supabase.functions.invoke('route-eta', {
          body: {
            destination: venue.address,
            arrival_time: state.startDate.toISOString(),
            buffer_mins: state.bufferMinutes,
          },
        })
        if (data?.found) {
          calculatedVenue = {
            ...calculatedVenue,
            driveMinutes: data.drive_time_mins ?? 0,
            distanceMiles: data.distance_miles ?? parseDistanceMilesFromSummary(data.route_summary) ?? 0,
            routeSummary: data.route_summary ?? null,
            trafficDelayMinutes: data.traffic_delay_mins ?? 0,
          }
          setState(prev => ({
            ...prev,
            venue: calculatedVenue,
            isCalculatingRoute: false,
          }))
        } else {
          setState(prev => ({ ...prev, isCalculatingRoute: false }))
        }
      } catch (err) {
        console.warn('[LivingFlow] Failed to compute route ETA:', err)
        setState(prev => ({ ...prev, isCalculatingRoute: false }))
      }
    }

    try {
      if (currentEvent.id.startsWith('routine-')) {
        const materialized = await materializeSyntheticRoutineEvent(
          supabase,
          queryClient,
          currentEvent,
          {
            venue: {
              name: calculatedVenue.name,
              address: calculatedVenue.address,
              driveMinutes: calculatedVenue.driveMinutes,
              distanceMiles: calculatedVenue.distanceMiles,
              routeSummary: calculatedVenue.routeSummary ?? undefined,
            },
          },
          { familyMembers },
        )
        activeEventRef.current = materialized
        currentEventIdRef.current = materialized.id
        useAppStore.getState().setSelectedSidecarEventId(materialized.id)
        return
      }

      const handled = await persistRecurringFieldMutation('venue', { venue: calculatedVenue })
      if (!handled) {
        await updateEventVenue(supabase, queryClient, currentEvent, {
          name: calculatedVenue.name,
          address: calculatedVenue.address,
          driveMinutes: calculatedVenue.driveMinutes,
          distanceMiles: calculatedVenue.distanceMiles,
          routeSummary: calculatedVenue.routeSummary ?? undefined,
        }, {
          familyMembers,
        })
      }
    } catch (err) {
      console.error('[LivingFlow] Failed to update venue:', err)
    }
  }, [initialEvent, state.startDate, state.bufferMinutes, persistRecurringFieldMutation, familyMembers, queryClient])

  // Set Start Time and Duration
  const setStartAndDuration = useCallback(async (startDate: Date, durationMins: number, isAllDayParam?: boolean) => {
    const isAllDay = isAllDayParam !== undefined ? isAllDayParam : (durationMins >= 1440)
    const endDate = isAllDay
      ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 23, 59, 59)
      : new Date(startDate.getTime() + durationMins * 60 * 1000)

    setState(prev => ({
      ...prev,
      startDate,
      endDate,
      durationMinutes: durationMins,
      isAllDay,
    }))

    const currentEvent = activeEventRef.current || initialEvent
    if (!currentEvent?.id) return

    try {
      if (currentEvent.id.startsWith('routine-')) {
        const materialized = await materializeSyntheticRoutineEvent(
          supabase,
          queryClient,
          currentEvent,
          { startDate, endDate, durationMinutes: durationMins, isAllDay },
          { familyMembers },
        )
        activeEventRef.current = materialized
        currentEventIdRef.current = materialized.id
        useAppStore.getState().setSelectedSidecarEventId(materialized.id)
        return
      }

      const handled = await persistRecurringFieldMutation('schedule', { startDate, endDate, durationMinutes: durationMins, isAllDay })
      if (!handled) {
        await updateEventSchedule(supabase, queryClient, currentEvent, startDate, endDate, isAllDay)
      }
    } catch (err) {
      console.error('[LivingFlow] Failed to update event timing:', err)
    }
  }, [initialEvent, persistRecurringFieldMutation, queryClient, familyMembers])

  // Nudge Time (+/- 15m)
  const nudgeMinutes = useCallback((mins: number) => {
    setState(prev => {
      const nextStart = new Date(prev.startDate.getTime() + mins * 60 * 1000)
      const nextEnd = new Date(nextStart.getTime() + prev.durationMinutes * 60 * 1000)
      void setStartAndDuration(nextStart, prev.durationMinutes, false)
      return { ...prev, startDate: nextStart, endDate: nextEnd, isAllDay: false }
    })
  }, [setStartAndDuration])

  // Set Category & Mode
  const setCategory = useCallback(async (catName: string, icon: string, mode: LivingFlowMode = 'event') => {
    setState(prev => ({ ...prev, category: catName, categoryIcon: icon, mode }))
    const currentEvent = activeEventRef.current || initialEvent
    if (!currentEvent?.id) return

    try {
      if (currentEvent.id.startsWith('routine-')) {
        const materialized = await materializeSyntheticRoutineEvent(
          supabase,
          queryClient,
          currentEvent,
          { category: catName, mode },
          { familyMembers },
        )
        activeEventRef.current = materialized
        currentEventIdRef.current = materialized.id
        useAppStore.getState().setSelectedSidecarEventId(materialized.id)
        return
      }

      const handled = await persistRecurringFieldMutation('category', { category: catName, mode })
      if (!handled) {
        await updateEventCategory(supabase, queryClient, currentEvent.id, catName, mode)
      }
    } catch (err) {
      console.error('[LivingFlow] Failed to update category:', err)
    }
  }, [initialEvent, persistRecurringFieldMutation, queryClient, familyMembers])

  // Delete Request Entrypoint
  const requestDelete = useCallback(() => {
    setDeleteError(null)
    setDeleteBlocked(false)
    if (initialEvent?.record_kind === 'series_template') {
      setDeleteError('This is the recurring pattern for this series, not a single event. Edit or delete the series from one of its dated occurrences instead.')
      setDeleteBlocked(true)
      setShowDeleteConfirm(true)
      return
    }
    const isRecurringEvent = isCanonicalOccurrence || Boolean(initialEvent?.series_id || initialEvent?.recurrence_master_id || initialEvent?.rrule)
    if (isRecurringEvent && recurringEditorEnabled) {
      if (!recurringDeleteEnabled) {
        setDeleteError('Recurring event deletion is not enabled for this series yet.')
        setDeleteBlocked(true)
        setShowDeleteConfirm(true)
        return
      }
      setShowDeleteScopeModal(true)
      return
    }
    setShowDeleteConfirm(true)
  }, [initialEvent, isCanonicalOccurrence, recurringDeleteEnabled, recurringEditorEnabled])

  // Single / Non-recurring Event Delete Handler
  const handleDelete = useCallback(async () => {
    if (!initialEvent?.id) return
    const eventId = initialEvent.id
    setDeleting(true)
    // 0ms Optimistic Eviction across all screens
    evictEventFromAllCaches(queryClient, eventId)
    setShowDeleteConfirm(false)
    onClose?.()
    try {
      await deleteCalendarEvent(supabase, queryClient, eventId, initialEvent)
    } catch (err) {
      console.error('[LivingFlow] Delete failed in background:', err)
      invalidateAllCalendarQueries(queryClient, eventId)
    } finally {
      setDeleting(false)
    }
  }, [initialEvent, queryClient, onClose])

  // Canonical Recurring Series Delete Handler
  const handleRecurringDelete = useCallback(async (scope: EventLocationScope) => {
    if (!initialEvent?.id || !recurringContext) {
      setDeleteError('Recurring series details are unavailable.')
      return
    }
    const eventId = initialEvent.id
    setDeleting(true)
    if (scope === 'this' || scope === 'all') {
      evictEventFromAllCaches(queryClient, eventId)
    }
    setShowDeleteScopeModal(false)
    onClose?.()
    try {
      const seriesPatch: Record<string, unknown> = {}
      if (scope === 'future') {
        const originalStart = initialEvent.original_start_time ?? (
          initialEvent.original_start_date ? `${initialEvent.original_start_date}T00:00:00Z` : initialEvent.start_time
        )
        seriesPatch.original_recurrence_lines = truncateRecurrenceLinesForFuture(
          recurringContext.series.recurrence_lines,
          originalStart,
        )
      }
      const actionId = recurringDeleteActionIdRef.current ?? crypto.randomUUID()
      recurringDeleteActionIdRef.current = actionId
      const result = await deleteRecurringEditorMutation({
        selected_event_id: eventId,
        action_id: actionId,
        scope,
        expected_series_revision: recurringContext.series.revision,
        series_patch: seriesPatch,
      })
      recurringDeleteActionIdRef.current = null
      invalidateCalendar()
      announceRecurringDelete({ ...result, title: initialEvent.title, scope })
    } catch (err) {
      console.error('[LivingFlow] Recurring delete failed in background:', err)
      invalidateCalendar()
    } finally {
      setDeleting(false)
    }
  }, [initialEvent, recurringContext, queryClient, invalidateCalendar, onClose])



  const scopeImpacts = recurringContext ? {
    this: {
      affectedCount: recurringContext.impacts.this.occurrence_count,
      preservedExceptionCount: recurringContext.impacts.this.exception_count,
    },
    future: {
      affectedCount: recurringContext.impacts.future.occurrence_count,
      preservedExceptionCount: recurringContext.impacts.future.exception_count,
    },
    all: {
      affectedCount: recurringContext.impacts.all.occurrence_count,
      preservedExceptionCount: recurringContext.impacts.all.exception_count,
    },
  } : undefined

  // Mark Completed / Done
  const markCompleted = useCallback(async () => {
    if (!initialEvent?.id) return
    onClose?.()

    try {
      await completeEventOrReminder(supabase, queryClient, initialEvent)
    } catch (err) {
      console.error('[LivingFlow] Failed to complete event:', err)
    }
  }, [initialEvent, queryClient, onClose])

  // Snooze Reminder
  const snoozeReminder = useCallback(async (durationMinutes: number = 60) => {
    if (!initialEvent?.id) return
    onClose?.()

    try {
      await snoozeEventOrReminder(supabase, queryClient, initialEvent, durationMinutes)
    } catch (err) {
      console.error('[LivingFlow] Failed to snooze reminder:', err)
    }
  }, [initialEvent, queryClient, onClose])

  const setRecurScope = useCallback((scope: RecurrenceScope) => {
    setState(prev => ({ ...prev, recurScope: scope }))
  }, [])

  return {
    state,
    familyMembers,
    departureDate,
    pickupDepartureDate,
    returnDate,
    updateTitle,
    toggleMember,
    setTravelBehavior,
    setDriver,
    setVenue,
    setStartAndDuration,
    nudgeMinutes,
    setCategory,
    deleteEvent: requestDelete,
    requestDelete,
    handleDelete,
    handleRecurringDelete,
    showDeleteScopeModal,
    setShowDeleteScopeModal,
    showDeleteConfirm,
    setShowDeleteConfirm,
    deleting,
    deleteError,
    setDeleteError,
    deleteBlocked,
    setDeleteBlocked,
    recurringDeleteActionIdRef,
    recurringContextLoading,
    scopeImpacts,
    markCompleted,
    snoozeReminder,
    setRecurScope,
    isRecurring: isCanonicalOccurrence || Boolean(initialEvent?.recurrence_master_id),
    isCanonicalOccurrence,
  }
}
