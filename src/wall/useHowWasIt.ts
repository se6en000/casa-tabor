import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { LIVE_LIST } from '../lib/eventsCachePersister'
import { ASK_DAYS, askAgainAt, ratingsToAsk, type OutingRating } from '../../supabase/functions/_shared/guide.mjs'

// "How was it?" (canvas 85C–D; Jake, Oct 9: "she can prompt a 'something for you' the next day to ask how you would
// rate that place"): the morning's open questions (the scout writes them at 6:15, guide.mjs), and the answers.

export interface RatingAnswer { stars: number | null; go_back: 'soon' | 'someday' | 'once' | null; stood_out: string[]; note?: string | null }
export interface HowWasItData {
  /** Open, oldest outing first; on a phone only that person's. */
  open: OutingRating[]
  answer: (row: OutingRating, answer: RatingAnswer) => Promise<void>
  /** "We didn't go": for everyone asked about it. */
  didntGo: (row: OutingRating) => Promise<void>
  /** "Not now": tomorrow at 7. */
  later: (row: OutingRating) => Promise<void>
}

const KEY = ['outing-ratings']

export function useHowWasIt(now: Date, memberId: string | null = null): HowWasItData | null {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('outing_ratings').select('id, event_id, member_id, title, place, address, visited_at, status, ask_after')
        .eq('status', 'ask').gte('visited_at', new Date(Date.now() - ASK_DAYS * 86_400_000).toISOString()).order('visited_at').limit(20)
      if (error) throw error
      return (rows ?? []) as OutingRating[]
    },
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    ...LIVE_LIST,
  })
  const save = useCallback(async (change: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await change()
    if (error) throw new Error(error.message)
    await qc.invalidateQueries({ queryKey: KEY })
  }, [qc])
  const answer = useCallback((row: OutingRating, a: RatingAnswer) => save(() => supabase.from('outing_ratings')
    .update({ status: 'rated', stars: a.stars, go_back: a.go_back, stood_out: a.stood_out, note: a.note?.trim() || null, answered_at: new Date().toISOString() }).eq('id', row.id)), [save])
  const didntGo = useCallback((row: OutingRating) => save(() => supabase.from('outing_ratings')
    .update({ status: 'didnt_go', answered_at: new Date().toISOString() }).eq('event_id', row.event_id).eq('status', 'ask')), [save])
  const later = useCallback((row: OutingRating) => save(() => supabase.from('outing_ratings')
    .update({ ask_after: askAgainAt(new Date()) }).eq('id', row.id)), [save])
  if (!data) return null
  return { open: ratingsToAsk(data, now, memberId), answer, didntGo, later }
}
