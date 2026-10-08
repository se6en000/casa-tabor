import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Outing, TownNews } from '../../supabase/functions/_shared/scout.mjs'

export type OutingAnswer = 'saved' | 'not_for_us' | 'new'

/** The paper's second and third pages (canvas 72): what the Scout checked, and the morning's news around town. */
export interface ScoutPaper {
  outings: Outing[]
  news: TownNews[]
  today: string
  /** Save, Not for us, or un-save: shown at once, kept by the Scout (it learns from it). */
  answer?: (id: string, status: OutingAnswer) => void
}

const KEY = ['scout-list']

/** One call for both pages (supabase/functions/scout, { action: 'list' }); the tables are the server's alone. */
export function useScout(): ScoutPaper | null {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data: reply, error } = await supabase.functions.invoke('scout', { body: { action: 'list' } })
      if (error) throw error
      const r = reply as Partial<ScoutPaper> | null
      return { outings: r?.outings ?? [], news: r?.news ?? [], today: r?.today ?? '' }
    },
    staleTime: 30 * 60_000,
    refetchInterval: 60 * 60_000,
  })
  const answer = useCallback((id: string, status: OutingAnswer) => {
    qc.setQueryData<ScoutPaper>(KEY, (d) => d && {
      ...d,
      outings: status === 'not_for_us' ? d.outings.filter((o) => o.id !== id) : d.outings.map((o) => (o.id === id ? { ...o, status } : o)),
    })
    void supabase.functions.invoke('scout', { body: { action: 'feedback', id, status } })
  }, [qc])
  return data ? { ...data, answer } : null
}
