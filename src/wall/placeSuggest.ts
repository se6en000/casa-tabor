import type { SavedPlaceCategory } from '../types'
import { yourPlaces, savedPlaceFullAddress, type PlaceSearchResult } from './places.ts'

// Finding a place in fewer taps (canvas row 23; Jake, 2026-09-30: "make it easier to find saved places and new places
// alike, much more efficient, less taps"; Oct 1: "just use the known places and the first place to look, then the
// google maps"). Your places first, then the map's, nearest first. A new one is offered for saving.

export interface PlaceOption {
  key: string
  name: string
  address: string
  /** "6 TIMES", "LAST TIME", "YOURS" */
  tag?: string
  /** Miles from home (the map's results, nearest first). */
  miles?: number | null
  /** A saved place's id (yours), or the map's result (new). */
  savedId?: string
  result?: PlaceSearchResult
}

interface SavedLike { id: string; name: string; aliases: string[]; address: string | null; city: string | null; state: string | null; zip: string | null; occurrence_count: number; dismissed_at: string | null }

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Typing: one list — your places that match first, then the map's (not ones you already have). */
export function placeList(query: string, saved: SavedLike[], results: PlaceSearchResult[], max = 6): PlaceOption[] {
  const yours = yourPlaces(saved, query).map((p) => ({ key: `yours:${p.id}`, name: p.name, address: savedPlaceFullAddress(p), tag: 'YOURS', savedId: p.id }))
  const have = (r: PlaceSearchResult) => yours.some((y) => norm(y.name) === norm(r.name) || (y.address && r.address && norm(r.address).startsWith(norm(y.address).split(' ').slice(0, 3).join(' '))))
  const map = results.filter((r) => !have(r)).map((r) => ({ key: `map:${r.place_id}`, name: r.name, address: r.address, miles: r.miles ?? null, result: r }))
  return [...yours, ...map].slice(0, max)
}

/** What kind of place a map result is, for keeping it (renamed or re-kinded later in Settings). */
export function guessKind(result: Pick<PlaceSearchResult, 'name' | 'primary_type'>): SavedPlaceCategory {
  const text = `${result.primary_type ?? ''} ${result.name}`.toLowerCase()
  if (/school|academy|elementary|middle|high_school|university|college/.test(text)) return 'school'
  if (/dent|doctor|pediatric|clinic|hospital|health|medical|orthodont|physio|pharmacy/.test(text)) return 'medical'
  if (/park|stadium|field|sports|gym|athletic|arena|pool|rink|ballpark|complex/.test(text)) return 'sports'
  return 'other'
}
