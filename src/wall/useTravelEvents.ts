import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { WallEvent } from './engine/types'

/**
 * Trips further out than the calendar cache (two weeks): flights, drives and "Trip …" events for the next four
 * months, so a trip's coverage can be planned the day it lands in Casa (Jake, 2026-10-01: "we should start planning
 * coverage right away"). Keyed under 'events' so the calendar's live channel refreshes it.
 */
const AHEAD_DAYS = 120

export function useTravelEvents(now: Date): WallEvent[] {
  const day = now.toDateString()
  const { data } = useQuery({
    queryKey: ['events', 'wall-travel', day],
    queryFn: async (): Promise<WallEvent[]> => {
      const from = new Date(day)
      from.setDate(from.getDate() - 14)
      const to = new Date(day)
      to.setDate(to.getDate() + AHEAD_DAYS)
      const { data: rows, error } = await supabase
        .from('events')
        .select('id, title, start_time, end_time, all_day, event_type, status, location_name, address, leg_type, trip_id, event_members(family_member_id, role)')
        .gte('end_time', from.toISOString())
        .lte('start_time', to.toISOString())
        .is('deleted_at', null)
        .or('leg_type.not.is.null,title.ilike.%flight%,title.ilike.%drive to %,title.ilike.%drive home%,title.ilike.%drive back%,title.ilike.%trip%')
        .limit(300)
      if (error) throw error
      return ((rows ?? []) as Array<WallEvent & { event_members?: WallEvent['members'] }>).map((r) => ({ ...r, members: r.event_members ?? [] }))
    },
    staleTime: 10 * 60_000,
  })
  return data ?? []
}
