import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { SavedContact } from '../types'

export { findSavedContactMatch } from '../utils/savedContactMatch'

const QUERY_KEY = ['saved_contacts'] as const

export function useSavedContacts() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_contacts')
        .select('*')
        .order('name')
      if (error) throw error
      return data as SavedContact[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
