import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface TidyChoice { key: string; label: string }
/** One thing Alexa would clean up (canvas 75): what she found, what she'd do, and the answers. */
export interface TidySuggestion { id: string; kind: string; says: string; fix: string; choices: TidyChoice[] }
export interface TidyData {
  open: TidySuggestion[]
  /** The last day of the stretch she looked at (today and the next few). */
  through: string
  answer: (id: string, choice: string) => Promise<void>
  undo: (id: string) => Promise<void>
}

const KEY = ['tidy-list']
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** The morning's tidy-up, still open (supabase/functions/tidy); answering or undoing goes through the same function. */
export function useTidy(): TidyData | null {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data: reply, error } = await supabase.functions.invoke('tidy', { body: { action: 'list' } })
      if (error) throw error
      const r = reply as { suggestions?: TidySuggestion[]; today?: string } | null
      return { open: r?.suggestions ?? [], today: r?.today ?? '' }
    },
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  })
  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data: reply, error } = await supabase.functions.invoke('tidy', { body })
    const failed = error?.message ?? (reply as { error?: string } | null)?.error
    if (failed) throw new Error(failed)
    // The calendar and the to-dos changed: everything that shows them reads again.
    void qc.invalidateQueries()
  }, [qc])
  const answer = useCallback((id: string, choice: string) => call({ action: 'answer', id, choice }), [call])
  const undo = useCallback((id: string) => call({ action: 'undo', id }), [call])
  return data ? { open: data.open, through: data.today ? addDays(data.today, 3) : '', answer, undo } : null
}
