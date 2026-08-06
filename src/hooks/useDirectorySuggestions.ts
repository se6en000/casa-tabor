import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toDirectorySuggestionEntries, type DirectorySuggestionEntry } from '../utils/directorySuggestionEntries'

/** Fetches real unconfirmed household directory candidates (populated by
 * discover_directory_candidates(), see build-household-graph) so the Needs You
 * "directory suggestion" card can show a genuine per-entry Add/Skip review
 * instead of only the aggregate notification text. Disabled until the caller
 * actually expands the review (pass `enabled: false` while collapsed). */
export function useDirectorySuggestionEntries(enabled: boolean, limit = 5) {
  return useQuery({
    queryKey: ['directory-suggestion-entries'],
    enabled,
    queryFn: async (): Promise<DirectorySuggestionEntry[]> => {
      const [placesResult, contactsResult] = await Promise.all([
        supabase
          .from('saved_places')
          .select('id, name, category, occurrence_count, created_at')
          .eq('confirmed', false)
          .is('dismissed_at', null),
        supabase
          .from('saved_contacts')
          .select('id, name, occurrence_count, created_at')
          .eq('confirmed', false)
          .is('dismissed_at', null),
      ])
      if (placesResult.error) throw placesResult.error
      if (contactsResult.error) throw contactsResult.error
      return toDirectorySuggestionEntries(placesResult.data ?? [], contactsResult.data ?? [], limit)
    },
    staleTime: 15_000,
  })
}

export function useConfirmDirectorySuggestionEntry() {
  const qc = useQueryClient()
  return async (entry: Pick<DirectorySuggestionEntry, 'id' | 'kind'>) => {
    const table = entry.kind === 'place' ? 'saved_places' : 'saved_contacts'
    await supabase.from(table).update({ confirmed: true }).eq('id', entry.id)
    qc.invalidateQueries({ queryKey: ['directory-suggestion-entries'] })
  }
}

export function useDismissDirectorySuggestionEntry() {
  const qc = useQueryClient()
  return async (entry: Pick<DirectorySuggestionEntry, 'id' | 'kind'>) => {
    const table = entry.kind === 'place' ? 'saved_places' : 'saved_contacts'
    // Tombstone via dismissed_at rather than deleting — a hard delete would let
    // the next discover_directory_candidates() scan recreate the same suggestion.
    await supabase.from(table).update({ dismissed_at: new Date().toISOString() }).eq('id', entry.id)
    qc.invalidateQueries({ queryKey: ['directory-suggestion-entries'] })
  }
}
