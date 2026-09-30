import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { invalidateAllCalendarQueries } from '../lib/eventMutations'
import type { EmailAnswer, EmailReviewData } from './emailReview'

/**
 * What came in by email (phase 2, canvas row 14): the waiting offers and a few it skipped, from the
 * `email-offers` function. New mail is read every 15 minutes, so a quarter-hourly refresh is plenty; an
 * answer here refreshes it at once, and "Add it" refreshes the calendar, to-dos and lists it saved to.
 */
export function useEmailOffers() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['email-offers'],
    queryFn: async (): Promise<EmailReviewData> => {
      const { data, error } = await supabase.functions.invoke('email-offers', { body: { action: 'list' } })
      if (error) throw error
      return { count: Number(data?.count ?? 0), offers: data?.offers ?? [], skipped: data?.skipped ?? [] }
    },
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  })
  const act = useCallback(async (id: string, what: EmailAnswer): Promise<{ ok: boolean; message?: string }> => {
    const { data, error } = await supabase.functions.invoke('email-offers', { body: { action: 'act', id, what } })
    if (what === 'add') {
      invalidateAllCalendarQueries(queryClient, '')
      void queryClient.invalidateQueries({ queryKey: ['todos'] })
      void queryClient.invalidateQueries({ queryKey: ['grocery'] })
    }
    // The count and the list follow the answer; the card itself moves on in the review.
    void queryClient.invalidateQueries({ queryKey: ['email-offers'] })
    if (error) return { ok: false, message: (data as { error?: string } | null)?.error ?? 'That didn’t save. Nothing was changed.' }
    return { ok: true }
  }, [queryClient])
  return { data: query.data ?? null, act }
}
