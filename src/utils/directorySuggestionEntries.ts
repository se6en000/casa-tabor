// Normalizes unconfirmed saved_places/saved_contacts rows into one unified list so
// the Needs You "directory suggestion" card can render a real per-entry Add/Skip
// review, backed by actual household directory candidates (not just the aggregate
// notification text). See supabase/functions/build-household-graph/index.ts's
// discover_directory_candidates() for how these rows are populated.
import type { SavedContact, SavedPlace } from '../types'

const PLACE_CATEGORY_LABELS: Record<SavedPlace['category'], string> = {
  restaurant: 'Restaurant',
  friends_house: "Friend's house",
  school: 'School',
  sports: 'Sports / Venue',
  work: 'Work',
  medical: 'Medical',
  travel: 'Travel',
  errand: 'Errand',
  home_service: 'Home Service',
  social: 'Social / Venue',
  other: 'Other',
}

export interface DirectorySuggestionEntry {
  id: string
  kind: 'place' | 'contact'
  name: string
  categoryLabel: string
  occurrenceCount: number
  createdAt: string
}

type SuggestedPlace = Pick<SavedPlace, 'id' | 'name' | 'category' | 'occurrence_count' | 'created_at'>
type SuggestedContact = Pick<SavedContact, 'id' | 'name' | 'occurrence_count' | 'created_at'>

const DEFAULT_LIMIT = 5

export function toDirectorySuggestionEntries(
  places: SuggestedPlace[],
  contacts: SuggestedContact[],
  limit: number = DEFAULT_LIMIT,
): DirectorySuggestionEntry[] {
  const entries: DirectorySuggestionEntry[] = [
    ...places.map((p) => ({
      id: p.id,
      kind: 'place' as const,
      name: p.name,
      categoryLabel: PLACE_CATEGORY_LABELS[p.category] ?? 'Other',
      occurrenceCount: p.occurrence_count,
      createdAt: p.created_at,
    })),
    ...contacts.map((c) => ({
      id: c.id,
      kind: 'contact' as const,
      name: c.name,
      categoryLabel: 'Contact',
      occurrenceCount: c.occurrence_count,
      createdAt: c.created_at,
    })),
  ]

  entries.sort((a, b) => {
    if (b.occurrenceCount !== a.occurrenceCount) return b.occurrenceCount - a.occurrenceCount
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return entries.slice(0, limit)
}
