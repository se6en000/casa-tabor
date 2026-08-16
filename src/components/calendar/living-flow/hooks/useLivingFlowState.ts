import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
import type { EventLocationScope } from '../../../../lib/eventLocation'
import {
  loadRecurringEditorContext,
  deleteRecurringEditorMutation,
  announceRecurringDelete,
  truncateRecurrenceLinesForFuture,
  type RecurringEditorContext,
} from '../../../../lib/recurringEventEditor'
import {
  updateEventTitle,
  updateEventSchedule,
  updateEventVenue,
  toggleEventAttendee,
  updateEventCategory,
  snoozeEventOrReminder,
  completeEventOrReminder,
  deleteCalendarEvent,
  triggerGoogleEventSync,
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

  const initialTravelBehavior = useMemo<TravelBehavior>(() => {
    const plan = initialEvent?.plan_override?.transportation_plan
    if (!plan || plan.legs.length === 0) {
      return initialEvent?.plan_override?.waits === false ? 'two_way' : 'stay'
    }
    if (plan.legs.length === 1) {
      if (plan.legs[0].purpose === 'dropoff') return 'dropoff_only'
      if (plan.legs[0].purpose === 'pickup') return 'pickup_only'
    }
    if (plan.waitOnSite || initialEvent?.plan_override?.waits !== false) {
      return 'stay'
    }
    return 'two_way'
  }, [initialEvent?.plan_override])

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
      travelBehavior: initialTravelBehavior,
      driverLeg1: initialDriverLeg1,
      driverLeg2: initialDriverLeg2,
    }))
  }, [initialEvent, initialStartDate, initialEndDate, initialDuration, initialVenue, initialMemberIds, initialPrimaryId, initialTravelBehavior, initialDriverLeg1, initialDriverLeg2])

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
    const base = !state.endDate || isNaN(new Date(state.endDate).getTime()) ? new Date() : new Date(state.endDate)
    base.setMinutes(base.getMinutes() - totalPreMinutes)
    return base
  }, [state.endDate, state.venue.driveMinutes, state.bufferMinutes])

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
    triggerGoogleEventSync(supabase, initialEvent.id)
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
    if (isCanonicalOccurrence && recurringEditorEnabled) {
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
  }, [initialEvent?.record_kind, isCanonicalOccurrence, recurringDeleteEnabled, recurringEditorEnabled])

  // Single / Non-recurring Event Delete Handler
  const handleDelete = useCallback(async () => {
    if (!initialEvent?.id) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteCalendarEvent(supabase, queryClient, initialEvent.id)
      setShowDeleteConfirm(false)
      onClose?.()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this event.')
    } finally {
      setDeleting(false)
    }
  }, [initialEvent?.id, queryClient, onClose])

  // Canonical Recurring Series Delete Handler
  const handleRecurringDelete = useCallback(async (scope: EventLocationScope) => {
    if (!initialEvent?.id || !recurringContext) {
      setDeleteError('Recurring series details are unavailable.')
      return
    }
    setDeleting(true)
    setDeleteError(null)
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
        selected_event_id: initialEvent.id,
        action_id: actionId,
        scope,
        expected_series_revision: recurringContext.series.revision,
        series_patch: seriesPatch,
      })
      recurringDeleteActionIdRef.current = null
      invalidateCalendar()
      announceRecurringDelete({ ...result, title: initialEvent.title, scope })
      setShowDeleteScopeModal(false)
      onClose?.()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the selected recurring events.')
    } finally {
      setDeleting(false)
    }
  }, [initialEvent, recurringContext, invalidateCalendar, onClose])

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
    setRecurScope
  }
}
