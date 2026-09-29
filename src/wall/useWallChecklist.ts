import { useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { WallChecklistItem } from './packing'

/**
 * Checklist items for the given events ("Pack tonight"). Keyed under 'events'
 * so the shared calendar realtime channel (which watches event_checklist_items)
 * refreshes it when an item is ticked.
 */
export function useWallChecklist(eventIds: string[]): WallChecklistItem[] {
  const ids = [...new Set(eventIds)].sort()
  const { data } = useQuery({
    queryKey: ['events', 'wall-checklist', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<WallChecklistItem[]> => {
      const { data: rows, error } = await supabase
        .from('event_checklist_items')
        .select('id, event_id, label, checked, sort_order')
        .in('event_id', ids)
      if (error) throw error
      return (rows ?? []) as WallChecklistItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
  return data ?? []
}

/** Tick or untick one item; the wall's checklist refreshes right away. */
export async function toggleChecklistItem(queryClient: QueryClient, id: string, checked: boolean): Promise<void> {
  const { error } = await supabase.from('event_checklist_items').update({ checked }).eq('id', id)
  if (error) throw error
  await queryClient.invalidateQueries({ queryKey: ['events', 'wall-checklist'] })
}

/** One event's own list — a reminder's too (the wall's week list only loads outings and activities). */
export function useEventChecklist(eventId: string): WallChecklistItem[] {
  return useWallChecklist(eventId ? [eventId] : [])
}

/** Add a line to an event's get & pack list, at the end (Jake, 2026-09-29: "manually add items"). */
export async function addChecklistItem(queryClient: QueryClient, eventId: string, label: string): Promise<void> {
  const { data, error: readError } = await supabase.from('event_checklist_items').select('sort_order').eq('event_id', eventId).order('sort_order', { ascending: false }).limit(1)
  if (readError) throw readError
  const sortOrder = ((data?.[0] as { sort_order?: number } | undefined)?.sort_order ?? -1) + 1
  const { error } = await supabase.from('event_checklist_items').insert({ event_id: eventId, label, sort_order: sortOrder })
  if (error) throw error
  await queryClient.invalidateQueries({ queryKey: ['events'] })
}
