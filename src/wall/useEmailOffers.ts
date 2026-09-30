import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { invalidateAllCalendarQueries } from '../lib/eventMutations'
import type { EmailAct, EmailOffer, EmailReviewData } from './emailReview'

/**
 * What came in by email (phase 2, canvas row 14): the waiting offers, the kept-posted lines (row 15) and a few
 * it skipped, from the `email-offers` function. New mail is read every 15 minutes, so a quarter-hourly refresh
 * is plenty; an answer here refreshes it at once, and "Add it" refreshes the calendar, to-dos and lists it saved to.
 */
export function useEmailOffers() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['email-offers'],
    queryFn: async (): Promise<EmailReviewData> => {
      const { data, error } = await supabase.functions.invoke('email-offers', { body: { action: 'list' } })
      if (error) throw error
      return { count: Number(data?.count ?? 0), offers: data?.offers ?? [], skipped: data?.skipped ?? [], posted: data?.posted ?? [], text_on_wall: data?.text_on_wall !== false }
    },
    // Fresh each time a review opens (the phone mounts it then): an older list added the same to-dos twice.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 15 * 60_000,
  })
  const act: EmailAct = useCallback(async (id, what, ids) => {
    const { data, error } = await supabase.functions.invoke('email-offers', { body: { action: 'act', id, what, ...(ids ? { ids } : {}) } })
    if (what === 'add') {
      invalidateAllCalendarQueries(queryClient, '')
      void queryClient.invalidateQueries({ queryKey: ['todos'] })
      void queryClient.invalidateQueries({ queryKey: ['grocery'] })
    }
    // The count and the list follow the answer; the card itself moves on in the review.
    void queryClient.invalidateQueries({ queryKey: ['email-offers'] })
    if (what === 'keep_posted') void queryClient.invalidateQueries({ queryKey: ['email-settings'] })
    if (error) return { ok: false, message: (data as { error?: string } | null)?.error ?? 'That didn’t save. Nothing was changed.' }
    return { ok: true, offer: ((data as { offer?: EmailOffer | null } | null)?.offer ?? null) }
  }, [queryClient])
  return { data: query.data ?? null, act }
}

export interface EmailSettings {
  keep: Array<{ id: string; kind: 'sender' | 'topic'; label: string; source: string; created_at: string }>
  quiet: Array<{ id: string; from: string; kind: string; since: string | null; skipped: number }>
  text_on_wall: boolean
}

/** Settings › Email (canvas 15e): what's kept posted, what's quiet, the wall switch — each change saved at once. */
export function useEmailSettings() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['email-settings'],
    queryFn: async (): Promise<EmailSettings> => {
      const { data, error } = await supabase.functions.invoke('email-offers', { body: { action: 'rules' } })
      if (error) throw error
      return { keep: data?.keep ?? [], quiet: data?.quiet ?? [], text_on_wall: data?.text_on_wall !== false }
    },
    staleTime: 0,
  })
  const change = useCallback(async (body: Record<string, unknown>): Promise<{ ok: boolean; message?: string }> => {
    const { data, error } = await supabase.functions.invoke('email-offers', { body })
    void queryClient.invalidateQueries({ queryKey: ['email-settings'] })
    void queryClient.invalidateQueries({ queryKey: ['email-offers'] })
    return error ? { ok: false, message: (data as { error?: string } | null)?.error ?? 'That didn’t save.' } : { ok: true }
  }, [queryClient])
  return { data: query.data ?? null, change }
}
