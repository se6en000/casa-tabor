import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Known } from './PersonPage'
import type { Surface } from './surface'

/** What Casa knows about one person (the casa-memory function): null while it loads, 'error' if it can't. */
export function usePersonKnown(memberId: string, surface: Surface): Known | null | 'error' {
  const { data, isError } = useQuery({
    queryKey: ['person-known', memberId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('casa-memory', { body: { action: 'about', member_id: memberId, on_wall: surface === 'wall' } })
      if (error) throw error
      return data as Known
    },
    staleTime: 5 * 60_000,
  })
  if (isError) return 'error'
  return data ?? null
}
