import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Where things went, further back than the calendar cache (a week): the last six months' events that had a place,
 * read once when the place picker opens (canvas 23a: "where Huskies practice went before", recent places).
 */
const BACK_DAYS = 180

export interface PlaceHistoryRow { id: string; title: string; start_time: string; location_name: string | null; address: string | null }

export function usePlaceHistory(enabled: boolean): PlaceHistoryRow[] {
  const { data } = useQuery({
    queryKey: ['events', 'place-history'],
    enabled,
    queryFn: async (): Promise<PlaceHistoryRow[]> => {
      const now = new Date()
      const from = new Date(now.getTime() - BACK_DAYS * 86_400_000)
      const { data: rows, error } = await supabase
        .from('events')
        .select('id, title, start_time, location_name, address')
        .gte('start_time', from.toISOString())
        .lt('start_time', now.toISOString())
        .is('deleted_at', null)
        .not('location_name', 'is', null)
        .order('start_time', { ascending: false })
        .limit(500)
      if (error) throw error
      return (rows ?? []) as PlaceHistoryRow[]
    },
    staleTime: 30 * 60_000,
  })
  return data ?? []
}
