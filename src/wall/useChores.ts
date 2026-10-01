import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { WallChore } from './engine/chores'

/** The household's chores (table household_chores; never synced to Google). */
export function useChores(): WallChore[] {
  const { data } = useQuery({
    queryKey: ['household-chores'],
    queryFn: async (): Promise<WallChore[]> => {
      const { data: rows, error } = await supabase.from('household_chores').select('id, title, member_id, for_member_id, days_of_week, time_local, minutes, enabled, every_weeks, starts_on').eq('enabled', true)
      if (error) throw error
      return (rows ?? []) as WallChore[]
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })
  return data ?? []
}
