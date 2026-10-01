import type { SavedPlaceCategory } from '../types'
import { yourPlaces, savedPlaceFullAddress, type PlaceSearchResult } from './places.ts'

// Finding a place in fewer taps (canvas row 23; Jake, 2026-09-30: "make it easier to find saved places and new places
// alike, much more efficient, less taps"). Before typing: where this event went before, the people's own places,
// recent ones. Typing: one list, yours first, the map's below. A map place picked is kept as one of yours on its own.

export interface PlaceOption {
  key: string
  name: string
  address: string
  /** "6 TIMES", "LAST TIME", "YOURS" */
  tag?: string
  /** A saved place's id (yours), or the map's result (new). */
  savedId?: string
  result?: PlaceSearchResult
}

interface EventLike {
  id: string
  title: string
  start_time: string
  location_name?: string | null
  address?: string | null
  members?: Array<{ family_member_id?: string | null }> | null
}
interface RoutineLike { memberId: string; venueName: string; venueAddress: string; enabled: boolean }
interface SavedLike { id: string; name: string; aliases: string[]; address: string | null; city: string | null; state: string | null; zip: string | null; occurrence_count: number; dismissed_at: string | null }

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
/** What makes two events "the same thing": the part before a colon ("Softball: Huskies @ …" → softball), else the title. */
export function titleKey(title: string): string {
  return norm(title.split(':')[0])
}
const isHome = (name: string) => norm(name) === 'home'

export interface PlaceSuggestions {
  before: PlaceOption[]
  theirs: PlaceOption[]
  recent: PlaceOption[]
}

export function placeSuggestions({ title, eventId, memberIds, events, routines, now }: {
  title: string
  eventId?: string
  memberIds: string[]
  events: EventLike[]
  routines: RoutineLike[]
  now: Date
}): PlaceSuggestions {
  const key = titleKey(title)
  const placed = events.filter((e) => e.id !== eventId && (e.location_name?.trim() || e.address?.trim()) && !isHome(e.location_name ?? ''))
  const nameOf = (e: EventLike) => (e.location_name?.trim() || e.address!.trim())
  const seen = new Set<string>()
  const take = (name: string) => {
    const k = norm(name)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  }

  // Where this event went before (past ones with the same name), the most often first.
  const groups = new Map<string, { name: string; address: string; count: number; last: number }>()
  if (key.length >= 3) {
    for (const e of placed) {
      const at = new Date(e.start_time).getTime()
      if (at >= now.getTime() || titleKey(e.title) !== key) continue
      const name = nameOf(e)
      const g = groups.get(norm(name)) ?? { name, address: e.address?.trim() ?? '', count: 0, last: 0 }
      g.count += 1
      if (at > g.last) { g.last = at; g.address = e.address?.trim() || g.address }
      groups.set(norm(name), g)
    }
  }
  const before = [...groups.values()].sort((a, b) => b.count - a.count || b.last - a.last).slice(0, 2)
    .filter((g) => take(g.name))
    .map((g) => ({ key: `before:${norm(g.name)}`, name: g.name, address: g.address, tag: g.count > 1 ? `${g.count} TIMES` : 'LAST TIME' }))

  // The people's own places: their routines' (school, work).
  const theirs = routines.filter((r) => r.enabled && memberIds.includes(r.memberId) && r.venueName.trim())
    .filter((r) => take(r.venueName))
    .slice(0, 3)
    .map((r) => ({ key: `theirs:${norm(r.venueName)}`, name: r.venueName.trim(), address: r.venueAddress.trim() }))

  // Recent places anyone went (the last 30 days), the latest first.
  const since = now.getTime() - 30 * 86_400_000
  const recent = placed.filter((e) => { const at = new Date(e.start_time).getTime(); return at < now.getTime() && at >= since })
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
    .filter((e) => take(nameOf(e)))
    .slice(0, 3)
    .map((e) => ({ key: `recent:${norm(nameOf(e))}`, name: nameOf(e), address: e.address?.trim() ?? '' }))
  return { before, theirs, recent }
}

/** Typing: one list — your places that match first, then the map's (not ones you already have). */
export function placeList(query: string, saved: SavedLike[], results: PlaceSearchResult[], max = 6): PlaceOption[] {
  const yours = yourPlaces(saved, query).map((p) => ({ key: `yours:${p.id}`, name: p.name, address: savedPlaceFullAddress(p), tag: 'YOURS', savedId: p.id }))
  const have = (r: PlaceSearchResult) => yours.some((y) => norm(y.name) === norm(r.name) || (y.address && r.address && norm(r.address).startsWith(norm(y.address).split(' ').slice(0, 3).join(' '))))
  const map = results.filter((r) => !have(r)).map((r) => ({ key: `map:${r.place_id}`, name: r.name, address: r.address, result: r }))
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
