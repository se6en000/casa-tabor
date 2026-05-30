import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { FamilyMember } from '../types'

export function useFamilyMembers() {
  return useQuery({
    queryKey: ['family-members'],
    queryFn: async (): Promise<FamilyMember[]> => {
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .order('sort_order')

      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60_000, // family members rarely change
  })
}