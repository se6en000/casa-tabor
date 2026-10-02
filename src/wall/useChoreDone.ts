import { useMemo } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { choreDoneKey, ymd } from './nextUp'

// Chores ticked for the day (table household_chore_done; canvas 27a/27c): the wall reads the last two days, so
// tonight's ticks are there after midnight too.

const KEY = ['household-chore-done']

export function useChoreDone(now: Date): Set<string> {
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  // A plain list in the cache (it's kept on the phone between launches, and a Set doesn't survive that); a Set here.
  const { data } = useQuery({
    queryKey: [...KEY, ymd(since)],
    queryFn: async (): Promise<string[]> => {
      const { data: rows, error } = await supabase.from('household_chore_done').select('chore_id, on_date').gte('on_date', ymd(since))
      if (error) throw error
      return (rows ?? []).map((r) => choreDoneKey(r.chore_id as string, new Date(`${r.on_date}T12:00:00`)))
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  })
  return useMemo(() => new Set(data ?? []), [data])
}

export async function setChoreDone(queryClient: QueryClient, choreId: string, date: Date, done: boolean): Promise<void> {
  const { error } = done
    ? await supabase.from('household_chore_done').upsert({ chore_id: choreId, on_date: ymd(date) })
    : await supabase.from('household_chore_done').delete().eq('chore_id', choreId).eq('on_date', ymd(date))
  if (error) throw error
  await queryClient.invalidateQueries({ queryKey: KEY })
}
