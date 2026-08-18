import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useFamilyMembers } from './useFamilyMembers'
import type { SuggestedEventPlan, SuggestedActionBundle } from '../utils/actionInspectionSynthesis'
import type { PrepItem } from '../types'

export function useCreateSuggestedEvent() {
  const qc = useQueryClient()
  const { data: familyMembers = [] } = useFamilyMembers()
  const [isCreating, setIsCreating] = useState(false)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)

  const createSuggestedEvent = async (
    plan: SuggestedEventPlan,
    sourceItem?: PrepItem | null,
    subjectTitle?: string
  ): Promise<{ success: boolean; eventId?: string; error?: string }> => {
    if (isCreating) return { success: false, error: 'Event creation already in progress' }
    setIsCreating(true)

    try {
      const startIso = plan.allDay
        ? `${plan.date}T00:00:00.000Z`
        : (plan.startTime || `${plan.date}T09:00:00.000Z`)
      const endIso = plan.allDay
        ? `${plan.date}T23:59:59.999Z`
        : (plan.endTime || `${plan.date}T10:00:00.000Z`)

      const { data: newEvt, error: insertErr } = await supabase
        .from('events')
        .insert({
          title: plan.title,
          description: plan.description || `Imported from email action: ${subjectTitle || sourceItem?.event_title || sourceItem?.description || 'Action Item'}`,
          start_time: startIso,
          end_time: endIso,
          all_day: plan.allDay,
          location_name: plan.location || null,
          status: 'confirmed',
          event_type: 'event',
        })
        .select('id')
        .single()

      if (insertErr) throw insertErr

      if (newEvt?.id) {
        // Link primary family member if available
        let memberToLink = familyMembers[0]
        if (plan.assignedMemberName) {
          const match = familyMembers.find((m) => m.name.toLowerCase() === plan.assignedMemberName?.toLowerCase())
          if (match) memberToLink = match
        }

        if (memberToLink) {
          await supabase.from('event_members').insert({
            event_id: newEvt.id,
            family_member_id: memberToLink.id,
            role: 'primary',
            rsvp_status: 'accepted',
          })
        }

        // Link event_id on the prep item if applicable
        if (sourceItem?.id) {
          await supabase.from('prep_items').update({ event_id: newEvt.id }).eq('id', sourceItem.id)
        }

        setCreatedEventId(newEvt.id)
        await qc.invalidateQueries({ queryKey: ['events'] })
        await qc.invalidateQueries({ queryKey: ['prep-items'] })

        // Fire background synchronization edge functions
        void supabase.functions.invoke('create-google-event', { body: { event_id: newEvt.id } }).catch(() => {})
        void supabase.functions.invoke('fetch-event-weather', { body: { event_id: newEvt.id } }).catch(() => {})
        void supabase.functions.invoke('enrich-event', { body: { event_id: newEvt.id } }).catch(() => {})

        navigator.vibrate?.(25)
        return { success: true, eventId: newEvt.id }
      }
      return { success: false, error: 'No event ID returned' }
    } catch (err) {
      console.error('useCreateSuggestedEvent: Failed to create event', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      setIsCreating(false)
    }
  }

  const createSuggestedActionBundle = async (
    bundle: SuggestedActionBundle,
    selectedActionIds: string[],
    sourceItem?: PrepItem | null,
    subjectTitle?: string
  ): Promise<{ success: boolean; createdCount: number; createdEventIds: string[]; error?: string }> => {
    if (isCreating) return { success: false, createdCount: 0, createdEventIds: [], error: 'Action creation in progress' }
    setIsCreating(true)

    const selectedActions = bundle.actions.filter((a) => selectedActionIds.includes(a.id))
    if (selectedActions.length === 0) {
      setIsCreating(false)
      return { success: false, createdCount: 0, createdEventIds: [], error: 'No actions selected' }
    }

    const createdIds: string[] = []

    try {
      for (const action of selectedActions) {
        if (action.type === 'link') {
          // Quick links can open directly in new tab
          if (action.url) {
            window.open(action.url, '_blank', 'noopener,noreferrer')
          }
          continue
        }

        const isReminder = action.type === 'reminder'
        const startIso = action.allDay
          ? `${action.date || '2026-08-19'}T00:00:00.000Z`
          : (action.startTime || (isReminder ? `${action.date || '2026-08-18'}T20:00:00.000Z` : `${action.date || '2026-08-19'}T08:30:00.000Z`))

        const endIso = action.allDay
          ? `${action.date || '2026-08-19'}T23:59:59.999Z`
          : (action.endTime || (isReminder ? `${action.date || '2026-08-18'}T20:30:00.000Z` : `${action.date || '2026-08-19'}T15:00:00.000Z`))

        const { data: newEvt, error: insertErr } = await supabase
          .from('events')
          .insert({
            title: action.title,
            description: action.subtitle || `Generated from ${subjectTitle || sourceItem?.event_title || sourceItem?.description || 'Action Bundle'}`,
            start_time: startIso,
            end_time: endIso,
            all_day: Boolean(action.allDay),
            location_name: action.location || null,
            status: 'confirmed',
            event_type: isReminder ? 'reminder' : 'event',
          })
          .select('id')
          .single()

        if (insertErr) {
          console.warn('Failed to insert event for action:', action.title, insertErr)
          continue
        }

        if (newEvt?.id) {
          createdIds.push(newEvt.id)

          // Link assigned family member if specified
          let memberToLink = familyMembers[0]
          if (action.assignedMemberName) {
            const match = familyMembers.find(
              (m) => m.name.toLowerCase() === action.assignedMemberName?.toLowerCase()
            )
            if (match) memberToLink = match
          }

          if (memberToLink) {
            await supabase.from('event_members').insert({
              event_id: newEvt.id,
              family_member_id: memberToLink.id,
              role: 'primary',
              rsvp_status: 'accepted',
            })
          }

          // Trigger background sync
          void supabase.functions.invoke('create-google-event', { body: { event_id: newEvt.id } }).catch(() => {})
          void supabase.functions.invoke('fetch-event-weather', { body: { event_id: newEvt.id } }).catch(() => {})
          void supabase.functions.invoke('enrich-event', { body: { event_id: newEvt.id } }).catch(() => {})
        }
      }

      if (sourceItem?.id && createdIds.length > 0) {
        await supabase.from('prep_items').update({ event_id: createdIds[0] }).eq('id', sourceItem.id)
      }

      await qc.invalidateQueries({ queryKey: ['events'] })
      await qc.invalidateQueries({ queryKey: ['prep-items'] })

      navigator.vibrate?.([20, 50, 20])
      return { success: true, createdCount: createdIds.length, createdEventIds: createdIds }
    } catch (err) {
      console.error('useCreateSuggestedEvent: Failed to process action bundle', err)
      return {
        success: false,
        createdCount: createdIds.length,
        createdEventIds: createdIds,
        error: err instanceof Error ? err.message : String(err),
      }
    } finally {
      setIsCreating(false)
    }
  }

  return {
    createSuggestedEvent,
    createSuggestedActionBundle,
    isCreating,
    createdEventId,
  }
}
