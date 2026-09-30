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

/**
 * Contacts with the address wherever it's kept (the contact_directory view: their own address, their main
 * place, or a place confirmed for them) — what People and directions read (2026-09-30: Alice's saved house
 * was a confirmed place, and People never found it).
 */
export function useContactDirectory() {
  return useQuery({
    queryKey: ['contact-directory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_directory')
        .select('id, name, aliases, relationship, phone, email, address, place_name, confirmed, occurrence_count, dismissed_at')
        .order('name')
      if (error) throw error
      return (data ?? []).map((c) => ({ ...c, primary_place_id: null })) as Array<SavedContact & { place_name: string | null }>
    },
    staleTime: 5 * 60 * 1000,
  })
}
