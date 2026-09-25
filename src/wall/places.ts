import type { SavedPlace, SavedPlaceCategory } from '../types'

// Choosing a place on the wall (board 03f): your saved places first, then
// Google Maps (the existing place-search function). Pure helpers, tested.

/** A result from the place-search edge function. */
export interface PlaceSearchResult {
  place_id: string
  name: string
  address: string
  street?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  lat: number | null
  lng: number | null
  phone?: string | null
  primary_type?: string | null
}

type PlaceRow = Pick<SavedPlace, 'name' | 'aliases' | 'address' | 'city' | 'state' | 'zip' | 'occurrence_count' | 'dismissed_at'>

const YOUR_PLACES_LIMIT = 6

/** A real name, not a street address someone saved as the name ("100 Greenwood Drive, …"). */
export function isNamedPlace(place: Pick<SavedPlace, 'name'>): boolean {
  const name = place.name.trim()
  return name.length > 0 && !/^\d/.test(name) && !/,\s*[A-Z]{2}\b/.test(name)
}

export function savedPlaceFullAddress(place: Pick<SavedPlace, 'address' | 'city' | 'state' | 'zip'>): string {
  const cityLine = [place.city, [place.state, place.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [place.address, cityLine].filter(Boolean).join(', ')
}

/** Named, not dismissed, with an address; matching the search; most used first. */
export function yourPlaces<T extends PlaceRow>(places: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  return places
    .filter((p) => isNamedPlace(p) && !p.dismissed_at && (p.address ?? '').trim())
    .filter((p) => !q || [p.name, p.address ?? '', ...(p.aliases ?? [])].some((text) => text.toLowerCase().includes(q)))
    .sort((a, b) => (b.occurrence_count ?? 0) - (a.occurrence_count ?? 0) || a.name.localeCompare(b.name))
    .slice(0, YOUR_PLACES_LIMIT)
}

export function placeFromSaved(place: Pick<SavedPlace, 'name' | 'address' | 'city' | 'state' | 'zip'>): { name: string; address: string } {
  return { name: place.name, address: savedPlaceFullAddress(place) }
}

export function placeFromSearch(result: PlaceSearchResult): { name: string; address: string } {
  return { name: result.name, address: result.address }
}

/** The kinds offered when saving a new place (the rest stay available in Settings). */
export const SAVE_PLACE_KINDS: Array<{ value: SavedPlaceCategory; label: string }> = [
  { value: 'sports', label: 'Sports' },
  { value: 'school', label: 'School' },
  { value: 'medical', label: 'Medical' },
  { value: 'friends_house', label: "Friend's" },
  { value: 'other', label: 'Other' },
]
