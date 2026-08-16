import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useFamilyMembers } from './useFamilyMembers'
import type { SuggestedEventPlan } from '../utils/actionInspectionSynthesis'
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
        if (familyMembers.length > 0) {
          await supabase.from('event_members').insert({
            event_id: newEvt.id,
            family_member_id: familyMembers[0].id,
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

  return {
    createSuggestedEvent,
    isCreating,
    createdEventId,
  }
}
