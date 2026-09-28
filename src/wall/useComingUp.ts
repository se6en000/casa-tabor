import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { ComingUpAction, ComingUpItem, GiftIdea } from './comingUp'

export interface ComingUpData { items: ComingUpItem[]; ideas: GiftIdea[]; today: string }

/**
 * The Coming up list and gift ideas (P3.19), from the `coming-up` function — the same list the Sunday
 * push and the plan-by pokes use. It changes slowly (a day at a time, or when someone answers an
 * item), so a quarter-hourly refresh is plenty; an answer here refreshes it at once.
 */
export function useComingUp() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['coming-up'],
    queryFn: async (): Promise<ComingUpData> => {
      const { data, error } = await supabase.functions.invoke('coming-up', { body: { action: 'list' } })
      if (error) throw error
      return { items: data?.items ?? [], ideas: data?.ideas ?? [], today: String(data?.today ?? '') }
    },
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  })
  const act = useCallback(async (key: string, action: ComingUpAction) => {
    // Gone from the list straight away; the refresh confirms it.
    queryClient.setQueryData<ComingUpData>(['coming-up'], (old) => (old ? { ...old, items: old.items.filter((i) => i.key !== key) } : old))
    const { error } = await supabase.functions.invoke('coming-up', { body: { action, key } })
    await queryClient.invalidateQueries({ queryKey: ['coming-up'] })
    if (error) throw error
  }, [queryClient])
  return { data: query.data ?? null, act }
}
