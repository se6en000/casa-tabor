import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { LIVE_LIST } from '../lib/eventsCachePersister'
import { outingLink, outingWhen, type Outing, type TownNews } from '../../supabase/functions/_shared/scout.mjs'
import type { OutingDetails } from './outingCard'

export type OutingAnswer = 'saved' | 'not_for_us' | 'new'

/** The paper's second and third pages (canvas 72): what the Scout checked, and the morning's news around town. */
export interface ScoutPaper {
  outings: Outing[]
  news: TownNews[]
  today: string
  /** Save, Not for us, or un-save: shown at once, kept by the Scout (it learns from it). */
  answer?: (id: string, status: OutingAnswer) => void
  /** What its own page says (canvas 77): read once when its card first opens, kept. */
  details?: (id: string) => Promise<OutingDetails | null>
  /** To the family's phones (canvas 77): its name, when and where, and its link. */
  send?: (o: Outing) => Promise<void>
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
    // On screen with a stale copy (a reload's restored one), or back to the tab: read again (Oct 8, the Mac's stuck To do).
    ...LIVE_LIST,
  })
  const answer = useCallback((id: string, status: OutingAnswer) => {
    qc.setQueryData<ScoutPaper>(KEY, (d) => d && {
      ...d,
      outings: status === 'not_for_us' ? d.outings.filter((o) => o.id !== id) : d.outings.map((o) => (o.id === id ? { ...o, status } : o)),
    })
    void supabase.functions.invoke('scout', { body: { action: 'feedback', id, status } })
  }, [qc])
  const details = useCallback(async (id: string) => {
    const { data: reply } = await supabase.functions.invoke('scout', { body: { action: 'details', id } })
    return ((reply as { details?: OutingDetails | null } | null)?.details) ?? null
  }, [])
  const send = useCallback(async (o: Outing) => {
    const body = [outingWhen(o), o.place].filter(Boolean).join(' · ')
    const { error } = await supabase.functions.invoke('send-push-notification', { body: { title: o.title, body: body ? `${body} — from the wall` : 'From the wall', url: outingLink(o), tag: `outing:${o.id}`, data: { url: outingLink(o) } } })
    if (error) throw error
  }, [])
  return data ? { ...data, answer, details, send } : null
}
