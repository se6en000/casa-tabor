import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { usePageVisibility } from './usePageVisibility'
import {
  type ProposedActionSlot,
  type EvaluatedDaySchedule,
  evaluateDayScheduleWithProposedSlot,
  type CalendarEventSummary,
} from '../utils/daySchedulePeek'

export function useDayEventsPeek(proposedAction: ProposedActionSlot | null, enabled = true) {
  const isVisible = usePageVisibility()
  const dateStr = proposedAction?.date || proposedAction?.startTime?.slice(0, 10) || null

  return useQuery({
    queryKey: ['day-events-peek', dateStr],
    enabled: enabled && isVisible && !!dateStr,
    staleTime: 30_000,
    queryFn: async (): Promise<EvaluatedDaySchedule> => {
      if (!dateStr || !proposedAction) {
        return {
          dateStr: dateStr || '',
          existingEventsCount: 0,
          isDayCompletelyClear: true,
          hasConflict: false,
          conflictingEvents: [],
          timelineItems: [],
        }
      }

      // Fetch with buffer to ensure no events are missed across timezone boundaries
      const rangeStart = `${dateStr}T00:00:00-12:00`
      const rangeEnd = `${dateStr}T23:59:59+14:00`

      const { data, error } = await supabase
        .from('events')
        .select(`
          id,
          title,
          description,
          start_time,
          end_time,
          all_day,
          category,
          event_type,
          google_event_id,
          location_name,
          members:event_members(
            id,
            family_member:family_members(id, name, color_hex)
          )
        `)
        .gte('start_time', rangeStart)
        .lte('start_time', rangeEnd)
        .order('start_time', { ascending: true })

      if (error) {
        console.warn('Error fetching day peek events:', error)
      }

      const events: CalendarEventSummary[] = (data || []).map((row: any) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        start_time: row.start_time,
        end_time: row.end_time,
        all_day: row.all_day,
        category: row.category || row.event_type,
        google_event_id: row.google_event_id,
        location_name: row.location_name,
        members: row.members || [],
      }))

      return evaluateDayScheduleWithProposedSlot(events, proposedAction)
    },
  })
}
