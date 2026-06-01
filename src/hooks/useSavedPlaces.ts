import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { SavedPlace, SavedPlaceCategory } from '../types'

const QUERY_KEY = ['saved_places'] as const

export function useSavedPlaces() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_places')
        .select('*')
        .order('name')
      if (error) throw error
      return data as SavedPlace[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export interface SavePlaceInput {
  name: string
  aliases?: string[]
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  lat?: number | null
  lng?: number | null
  category?: SavedPlaceCategory
  notes?: string | null
}

export function useSavePlace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SavePlaceInput) => {
      const { data, error } = await supabase
        .from('saved_places')
        .insert({ ...input, aliases: input.aliases ?? [] })
        .select()
        .single()
      if (error) throw error
      return data as SavedPlace
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useDeletePlace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_places').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

/** Find a saved place matching a location_name or address string (fuzzy, client-side) */
export function findSavedPlace(places: SavedPlace[], locationName: string | null, address: string | null): SavedPlace | null {
  if (!places.length || (!locationName && !address)) return null
  const needle = (locationName ?? address ?? '').toLowerCase().trim()
  if (!needle) return null
  return places.find(p => {
    const haystack = [p.name, ...p.aliases, p.address ?? ''].map(s => s.toLowerCase())
    return haystack.some(h => h && (h.includes(needle) || needle.includes(h)))
  }) ?? null
}
