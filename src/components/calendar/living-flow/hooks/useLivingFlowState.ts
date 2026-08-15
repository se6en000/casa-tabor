import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../lib/supabase'
import { useFamilyMembers } from '../../../../hooks/useFamilyMembers'
import { useSavedPlaces, findSavedPlaceByAddress } from '../../../../hooks/useSavedPlaces'
import { CATEGORY_LABEL } from '../../categoryFields'
import type { EventWithDetails } from '../../../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../../../types'
import type { LivingFlowState, LivingFlowMode, TravelBehavior, RecurrenceScope, VenueInfo } from '../types'

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
    return {
      name: initialEvent.location_name || matchedPlace?.name || 'Destination',
      address: initialEvent.address || '',
      driveMinutes: isHome ? 0 : 18,
      distanceMiles: isHome ? 0 : 6.5
    }
  }, [initialEvent?.location_name, initialEvent?.address, savedPlaces])

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
    driverLeg1: 'Kelly',
    driverLeg2: 'Kelly',
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
      travelBehavior: initialEvent.plan_override?.waits === false ? 'dropoff' : 'stay'
    }))
  }, [initialEvent, initialStartDate, initialEndDate, initialDuration, initialVenue, initialMemberIds, initialPrimaryId])

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
    queryClient.invalidateQueries({ queryKey: ['events'] })
    queryClient.invalidateQueries({ queryKey: ['prep-items'] })
    queryClient.invalidateQueries({ queryKey: ['conflicts'] })
  }, [queryClient])

  // Update Title
  const updateTitle = useCallback(async (newTitle: string) => {
    setState(prev => ({ ...prev, title: newTitle }))
    if (!initialEvent?.id) return
    try {
      const { error } = await supabase
        .from('events')
        .update({ 
          title: newTitle,
          updated_at: new Date().toISOString()
        })
        .eq('id', initialEvent.id)

      if (error) throw error
      invalidateCalendar()
    } catch (err) {
      console.error('[LivingFlow] Failed to update event title:', err)
    }
  }, [initialEvent?.id, invalidateCalendar])

  // Toggle Attendee
  const toggleMember = useCallback(async (memberId: string) => {
    const isSelected = state.selectedMemberIds.includes(memberId)
    const nextIds = isSelected 
      ? state.selectedMemberIds.filter(id => id !== memberId)
      : [...state.selectedMemberIds, memberId]

    setState(prev => ({ ...prev, selectedMemberIds: nextIds }))

    if (!initialEvent?.id) return
    try {
      if (isSelected) {
        // Remove from event_members
        const { error } = await supabase
          .from('event_members')
          .delete()
          .eq('event_id', initialEvent.id)
          .eq('family_member_id', memberId)
        if (error) throw error
      } else {
        // Add to event_members
        const { error } = await supabase
          .from('event_members')
          .insert({
            event_id: initialEvent.id,
            family_member_id: memberId,
            role: 'attendee',
            rsvp_status: 'accepted'
          })
        if (error) throw error
      }
      invalidateCalendar()
    } catch (err) {
      console.error('[LivingFlow] Failed to toggle member:', err)
    }
  }, [initialEvent?.id, state.selectedMemberIds, invalidateCalendar])

  // Set Travel Behavior
  const setTravelBehavior = useCallback((behavior: TravelBehavior) => {
    setState(prev => ({ ...prev, travelBehavior: behavior }))
  }, [])

  // Set Driver
  const setDriver = useCallback((leg: 1 | 2, driverName: string, syncBoth: boolean) => {
    setState(prev => {
      if (syncBoth || prev.travelBehavior === 'stay') {
        return { ...prev, driverLeg1: driverName, driverLeg2: driverName }
      }
      return leg === 1 
        ? { ...prev, driverLeg1: driverName }
        : { ...prev, driverLeg2: driverName }
    })
  }, [])

  // Set Venue / Address
  const setVenue = useCallback(async (venue: VenueInfo) => {
    setState(prev => ({ ...prev, venue }))
    if (!initialEvent?.id) return
    try {
      const { error } = await supabase
        .from('events')
        .update({
          location_name: venue.name,
          address: venue.address,
          updated_at: new Date().toISOString()
        })
        .eq('id', initialEvent.id)

      if (error) throw error
      invalidateCalendar()
    } catch (err) {
      console.error('[LivingFlow] Failed to update venue:', err)
    }
  }, [initialEvent?.id, invalidateCalendar])

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
      const { error } = await supabase
        .from('events')
        .update({
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', initialEvent.id)

      if (error) throw error
      invalidateCalendar()
    } catch (err) {
      console.error('[LivingFlow] Failed to update event timing:', err)
    }
  }, [initialEvent?.id, invalidateCalendar])

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
    const catSlug = catName.toLowerCase().replace(/\s+/g, '_')
    setState(prev => ({ ...prev, category: catName, categoryIcon: icon, mode }))
    if (!initialEvent?.id) return
    try {
      // 1. Update events table event_type
      const { error: eventError } = await supabase
        .from('events')
        .update({
          event_type: mode === 'reminder' ? 'reminder' : 'event',
          updated_at: new Date().toISOString()
        })
        .eq('id', initialEvent.id)

      if (eventError) throw eventError

      // 2. Upsert event_enrichments category
      await supabase
        .from('event_enrichments')
        .upsert({
          event_id: initialEvent.id,
          category: catSlug,
          category_locked: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'event_id' })

      invalidateCalendar()
    } catch (err) {
      console.error('[LivingFlow] Failed to update category:', err)
    }
  }, [initialEvent?.id, invalidateCalendar])

  // Delete Event
  const deleteEvent = useCallback(async () => {
    if (!initialEvent?.id) return
    if (!confirm('Are you sure you want to delete this event?')) return
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', initialEvent.id)

      if (error) throw error
      invalidateCalendar()
      onClose?.()
    } catch (err) {
      console.error('[LivingFlow] Failed to delete event:', err)
    }
  }, [initialEvent?.id, invalidateCalendar, onClose])

  // Mark Completed
  const markCompleted = useCallback(async () => {
    if (!initialEvent?.id) return
    try {
      const { error } = await supabase
        .from('events')
        .update({ 
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', initialEvent.id)

      if (error) throw error
      invalidateCalendar()
      onClose?.()
    } catch (err) {
      console.error('[LivingFlow] Failed to complete event:', err)
    }
  }, [initialEvent?.id, invalidateCalendar, onClose])

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
    setRecurScope
  }
}
