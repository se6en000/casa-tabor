import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { DayPlan, WallMember } from './engine/types'
import { PAPER_UNTIL_HOUR, paperDate, paperFacts, type PaperWords } from './paper'

/**
 * Today's morning paper (canvas 48a): the words the server wrote, from the morning_papers table. On a morning with
 * none yet, the wall sends its own facts once (supabase/functions/morning-paper writes and keeps them; every wall
 * then shares that one). Null until there are words — the paper shows plain ones meanwhile.
 */
export function useMorningPaper(today: DayPlan | null, members: WallMember[], now: Date, weather?: { temp: number; condition: string } | null): PaperWords | null {
  const qc = useQueryClient()
  const date = paperDate(now)
  const morning = now.getHours() >= 5 && now.getHours() < PAPER_UNTIL_HOUR
  const { data, isFetched } = useQuery({
    queryKey: ['morning-paper', date],
    queryFn: async () => {
      const { data: row, error } = await supabase.from('morning_papers').select('headline, deck, sky').eq('paper_date', date).maybeSingle()
      if (error) throw error
      return (row as PaperWords | null) ?? null
    },
    staleTime: 10 * 60_000,
  })
  const asked = useRef<string | null>(null)
  useEffect(() => {
    if (!morning || !today || !isFetched || data || asked.current === date) return
    asked.current = date
    const facts = paperFacts(today, members, now, weather)
    void supabase.functions.invoke('morning-paper', { body: { facts } }).then(({ data: reply }) => {
      const words = (reply as { words?: PaperWords | null } | null)?.words
      if (words) qc.setQueryData(['morning-paper', date], words)
    })
  }, [morning, today, isFetched, data, date]) // eslint-disable-line react-hooks/exhaustive-deps
  return data ?? null
}
