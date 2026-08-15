import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../lib/supabase'
import { useFamilyMembers } from '../../../../hooks/useFamilyMembers'
import { useSavedPlaces, findSavedPlaceByAddress } from '../../../../hooks/useSavedPlaces'
import { CATEGORY_LABEL } from '../../categoryFields'
import type { EventWithDetails } from '../../../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../../../types'
import type { LivingFlowState, LivingFlowMode, TravelBehavior, RecurrenceScope, VenueInfo } from '../types'
import {
  buildEventTransportationPlan,
  applyDriverChangeToPlan,
  applyWaitBehaviorToPlan,
  parseDistanceMilesFromSummary,
} from '../../../../lib/eventTransportation'
import { saveEventTransportationOverride } from '../../../../lib/eventPlanOverrides'
import {
  updateEventTitle,
  updateEventSchedule,
  updateEventVenue,
  toggleEventAttendee,
  updateEventCategory,
  snoozeEventOrReminder,
  completeEventOrReminder,
  deleteCalendarEvent,
} from '../../../../lib/eventMutations'

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
    return initialEvent?.start_time ? new Date(initialEvent.start_time) : new Date()
  }, [initialEvent?.start_time])

  const initialEndDate = useMemo(() => {
    if (initialEvent?.end_time) return new Date(initialEvent.end_time)
    const d = new Date(initialStartDate)
    d.setMinutes(d.getMinutes() + 60)
    return d
  }, [initialEvent?.end_time, initialStartDate])

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

  const initialDriverLeg1 = useMemo(() => {
    const plan = initialEvent?.plan_override?.transportation_plan
    if (plan?.legs?.[0]?.driverName) return plan.legs[0].driverName
    const overrideId = initialEvent?.plan_override?.driver_overrides?.[0]
    if (overrideId) {
      const match = familyMembers.find(m => m.id === overrideId)
      if (match) return match.name
    }
    const parent = familyMembers.find(m => m.role === 'parent' && m.can_drive)
    return parent?.name || 'Kelly'
  }, [initialEvent?.plan_override, familyMembers])

  const initialDriverLeg2 = useMemo(() => {
    const plan = initialEvent?.plan_override?.transportation_plan
    if (plan?.legs?.[1]?.driverName) return plan.legs[1].driverName
    const overrideId = initialEvent?.plan_override?.driver_overrides?.[1]
    if (overrideId) {
      const match = familyMembers.find(m => m.id === overrideId)
      if (match) return match.name
    }
    return initialDriverLeg1
  }, [initialEvent?.plan_override, familyMembers, initialDriverLeg1])

  const normalizedCategory = useMemo(() => {
    return normalizeCategoryName(initialEvent?.enrichment?.category)
  }, [initialEvent?.enrichment?.category])

  const initialMode = useMemo<LivingFlowMode>(() => {
    return isLikelyReminderOrHome(initialEvent, initialEvent?.enrichment?.category) ? 'reminder' : 'event'
  }, [initialEvent])

  // Local State
  const [state, setState] = useState<LivingFlowState>({
    mode: initialMode,
    title: initialEvent?.title || 'New Event',
    category: normalizedCategory.label,
    categoryIcon: '',
    travelBehavior: initialEvent?.plan_override?.waits === false ? 'dropoff' : 'stay',
    driverLeg1: initialDriverLeg1,
    driverLeg2: initialDriverLeg2,
    startDate: initialStartDate,
    endDate: initialEndDate,
    durationMinutes: initialDuration,
    bufferMinutes: 5,
    recurScope: 'this',
    venue: initialVenue,
    selectedMemberIds: initialMemberIds,
    primaryMemberId: initialPrimaryId
  })

  // Sync state whenever event prop changes
  useEffect(() => {
    if (!initialEvent) return
    const cat = normalizeCategoryName(initialEvent.enrichment?.category)
    const mode = isLikelyReminderOrHome(initialEvent, initialEvent.enrichment?.category) ? 'reminder' : 'event'

    setState(prev => ({
      ...prev,
      mode,
      title: initialEvent.title || prev.title,
      category: cat.label,
      startDate: initialStartDate,
      endDate: initialEndDate,
      durationMinutes: initialDuration,
      venue: initialVenue,
      selectedMemberIds: initialMemberIds,
      primaryMemberId: initialPrimaryId,
      travelBehavior: initialEvent.plan_override?.waits === false ? 'dropoff' : 'stay',
      driverLeg1: initialDriverLeg1,
      driverLeg2: initialDriverLeg2,
    }))
  }, [initialEvent, initialStartDate, initialEndDate, initialDuration, initialVenue, initialMemberIds, initialPrimaryId, initialDriverLeg1, initialDriverLeg2])

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

  // Computed Departure Time
  const departureDate = useMemo(() => {
    const totalPreMinutes = (state.venue.driveMinutes || 0) + state.bufferMinutes
    const d = new Date(state.startDate)
    d.setMinutes(d.getMinutes() - totalPreMinutes)
    return d
  }, [state.startDate, state.venue.driveMinutes, state.bufferMinutes])

  // Computed Return Time
  const returnDate = useMemo(() => {
    const d = new Date(state.endDate)
    d.setMinutes(d.getMinutes() + (state.venue.driveMinutes || 0))
    return d
  }, [state.endDate, state.venue.driveMinutes])

  // ═══════════════ REAL SUPABASE MUTATIONS ═══════════════

  const invalidateCalendar = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['events'] })
    void queryClient.invalidateQueries({ queryKey: ['today-events'] })
    void queryClient.invalidateQueries({ queryKey: ['rolling-events'] })
    void queryClient.invalidateQueries({ queryKey: ['prep-items'] })
    void queryClient.invalidateQueries({ queryKey: ['conflicts'] })
    void queryClient.invalidateQueries({ queryKey: ['event-details'] })
    if (initialEvent?.id) {
      void queryClient.invalidateQueries({ queryKey: ['event-details', initialEvent.id] })
    }
    void queryClient.refetchQueries({ queryKey: ['events'], type: 'active' })
  }, [queryClient, initialEvent?.id])

  const persistDriverAndTravel = useCallback(async (
    newDriverLeg1: string,
    newDriverLeg2: string,
    newBehavior: TravelBehavior,
  ) => {
    if (!initialEvent?.id) return

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

    const currentPlan = initialEvent.plan_override?.transportation_plan
      ?? buildEventTransportationPlan(initialEvent, homeAddress, driver1, { waitOnSite: waits })

    const withDriver1 = applyDriverChangeToPlan(currentPlan, 0, driver1, false)
    const withDriver2 = applyDriverChangeToPlan(withDriver1, 1, driver2, false)
    const finalPlan = applyWaitBehaviorToPlan(withDriver2, newBehavior, initialEvent, homeAddress)

    await saveEventTransportationOverride({
      supabase,
      queryClient,
      event: initialEvent,
      transportationPlan: finalPlan,
      waits,
      modeOverride: initialEvent.plan_override?.mode_override || 'appointment',
    })

    invalidateCalendar()
  }, [initialEvent, familyMembers, queryClient, invalidateCalendar])

  // Update Title
  const updateTitle = useCallback(async (newTitle: string) => {
    setState(prev => ({ ...prev, title: newTitle }))
    if (!initialEvent?.id) return
    try {
      await updateEventTitle(supabase, queryClient, initialEvent.id, newTitle)
    } catch (err) {
      console.error('[LivingFlow] Failed to update event title:', err)
    }
  }, [initialEvent?.id, queryClient])

  // Toggle Attendee
  const toggleMember = useCallback(async (memberId: string) => {
    const isSelected = state.selectedMemberIds.includes(memberId)
    const nextIds = isSelected 
      ? state.selectedMemberIds.filter(id => id !== memberId)
      : [...state.selectedMemberIds, memberId]

    setState(prev => ({ ...prev, selectedMemberIds: nextIds }))

    if (!initialEvent?.id) return
    try {
      await toggleEventAttendee(supabase, queryClient, initialEvent, memberId, !isSelected, familyMembers)
    } catch (err) {
      console.error('[LivingFlow] Failed to toggle member:', err)
    }
  }, [initialEvent, state.selectedMemberIds, familyMembers, queryClient])

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

    if (!initialEvent?.id) return

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
      await updateEventVenue(supabase, queryClient, initialEvent, {
        name: calculatedVenue.name,
        address: calculatedVenue.address,
        driveMinutes: calculatedVenue.driveMinutes,
        distanceMiles: calculatedVenue.distanceMiles,
        routeSummary: calculatedVenue.routeSummary ?? undefined,
      }, {
        familyMembers,
      })
    } catch (err) {
      console.error('[LivingFlow] Failed to update venue:', err)
    }
  }, [initialEvent, state.startDate, state.bufferMinutes, familyMembers, queryClient])

  // Set Start Time and Duration
  const setStartAndDuration = useCallback(async (startDate: Date, durationMins: number) => {
    const endDate = new Date(startDate.getTime() + durationMins * 60 * 1000)
    setState(prev => ({
      ...prev,
      startDate,
      endDate,
      durationMinutes: durationMins
    }))

    if (!initialEvent?.id) return
    try {
      await updateEventSchedule(supabase, queryClient, initialEvent, startDate, endDate)
    } catch (err) {
      console.error('[LivingFlow] Failed to update event timing:', err)
    }
  }, [initialEvent, queryClient])

  // Nudge Time (+/- 15m)
  const nudgeMinutes = useCallback((mins: number) => {
    setState(prev => {
      const nextStart = new Date(prev.startDate.getTime() + mins * 60 * 1000)
      const nextEnd = new Date(nextStart.getTime() + prev.durationMinutes * 60 * 1000)
      setStartAndDuration(nextStart, prev.durationMinutes)
      return { ...prev, startDate: nextStart, endDate: nextEnd }
    })
  }, [setStartAndDuration])

  // Set Category & Mode
  const setCategory = useCallback(async (catName: string, icon: string, mode: LivingFlowMode = 'event') => {
    setState(prev => ({ ...prev, category: catName, categoryIcon: icon, mode }))
    if (!initialEvent?.id) return
    try {
      await updateEventCategory(supabase, queryClient, initialEvent.id, catName, mode)
    } catch (err) {
      console.error('[LivingFlow] Failed to update category:', err)
    }
  }, [initialEvent?.id, queryClient])

  // Delete Event
  const deleteEvent = useCallback(async () => {
    if (!initialEvent?.id) return
    if (!confirm('Are you sure you want to delete this?')) return
    onClose?.()

    try {
      await deleteCalendarEvent(supabase, queryClient, initialEvent.id)
    } catch (err) {
      console.error('[LivingFlow] Failed to delete event:', err)
    }
  }, [initialEvent?.id, queryClient, onClose])

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
    returnDate,
    updateTitle,
    toggleMember,
    setTravelBehavior,
    setDriver,
    setVenue,
    setStartAndDuration,
    nudgeMinutes,
    setCategory,
    deleteEvent,
    markCompleted,
    snoozeReminder,
    setRecurScope
  }
}
