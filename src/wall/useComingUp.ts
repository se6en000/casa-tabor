import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { onCalendarChange } from '../hooks/useCalendarEvents'
import type { AheadProject, ComingUpAction, ComingUpItem, GiftIdea, HandledItem } from './comingUp'

export interface ComingUpData { items: ComingUpItem[]; projects: AheadProject[]; ideas: GiftIdea[]; today: string; handled: HandledItem[] }

/** On the Horizon (canvas 63–64): what a ✓ kept (what was done, its event), or a ✕'s "fewer like this". */
export interface ActExtra { outcome?: { text: string; title: string; date: string; eventId?: string | null; by: 'you' | 'alexa' }; fewer?: boolean; item?: { title: string; kind: string } }

/**
 * The Coming up list and gift ideas (P3.19), from the `coming-up` function — the same list the Sunday
 * push and the plan-by pokes use. It changes slowly (a day at a time, or when someone answers an
 * item), so a quarter-hourly refresh is plenty; an answer here refreshes it at once.
 */
export function useComingUp({ surface = 'wall' }: { surface?: 'wall' | 'phone' } = {}) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['coming-up'],
    queryFn: async (): Promise<ComingUpData> => {
      const { data, error } = await supabase.functions.invoke('coming-up', { body: { action: 'list' } })
      if (error) throw error
      return { items: data?.items ?? [], projects: data?.projects ?? [], ideas: data?.ideas ?? [], today: String(data?.today ?? ''), handled: data?.handled ?? [] }
    },
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  })
  // What's already set on each line (canvas 66) follows the calendar (Jake, Oct 7: "will that get updated or refreshed
  // in realtime as things change?"): a change anywhere refreshes it, at most once in 20 seconds for a burst of them.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = onCalendarChange(() => {
      if (timer) return
      timer = setTimeout(() => { timer = null; void queryClient.invalidateQueries({ queryKey: ['coming-up'] }) }, 20_000)
    })
    return () => { off(); if (timer) clearTimeout(timer) }
  }, [queryClient])
  const act = useCallback(async (key: string, action: ComingUpAction, extra: ActExtra = {}): Promise<string | null> => {
    // Gone from the list straight away; the refresh confirms it.
    queryClient.setQueryData<ComingUpData>(['coming-up'], (old) => (old ? { ...old, items: old.items.filter((i) => i.key !== key) } : old))
    const { data, error } = await supabase.functions.invoke('coming-up', { body: { action, key, surface, ...extra } })
    await queryClient.invalidateQueries({ queryKey: ['coming-up'] })
    if (error) throw error
    // The words a ✕ taught ("fall festival"), to say so.
    return (data as { taught?: string } | null)?.taught ?? null
  }, [queryClient, surface])
  // Undo from the timeline: back on the list as it was; a ✕'s rule taken back.
  const undo = useCallback(async (key: string) => {
    const { error } = await supabase.functions.invoke('coming-up', { body: { action: 'undo', key, surface } })
    await queryClient.invalidateQueries({ queryKey: ['coming-up'] })
    if (error) throw error
  }, [queryClient, surface])
  // A season starts as this year's project (P3.23, canvas 11c); the new project's id, to open it.
  const start = useCallback(async (key: string): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke('coming-up', { body: { action: 'start', key, surface } })
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['coming-up'] }), queryClient.invalidateQueries({ queryKey: ['todos'] })])
    if (error) throw error
    return (data as { project_id?: string | null } | null)?.project_id ?? null
  }, [queryClient, surface])
  // A gift idea corrected by hand, or removed (null) — Jake, 2026-09-29: voice mishears brand names.
  const editIdea = useCallback(async (id: string, idea: string | null) => {
    queryClient.setQueryData<ComingUpData>(['coming-up'], (old) => (old ? { ...old, ideas: idea == null ? old.ideas.filter((g) => g.id !== id) : old.ideas.map((g) => (g.id === id ? { ...g, idea } : g)) } : old))
    const { error } = await supabase.functions.invoke('coming-up', { body: { action: idea == null ? 'idea_remove' : 'idea_edit', id, idea, surface } })
    await queryClient.invalidateQueries({ queryKey: ['coming-up'] })
    if (error) throw error
  }, [queryClient, surface])
  return { data: query.data ?? null, act, undo, start, editIdea }
}
