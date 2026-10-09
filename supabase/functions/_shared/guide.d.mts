export const STAND_OUT: Array<[string, string]>
export const GO_BACK: Array<['soon' | 'someday' | 'once', string]>
export const ASK_DAYS: number

/** One parent's "How was it?" about one outing (public.outing_ratings). */
export interface OutingRating {
  id: string
  event_id: string
  member_id: string
  title: string
  place: string
  address: string | null
  visited_at: string
  status: 'ask' | 'rated' | 'didnt_go' | 'dismissed'
  ask_after: string
  stars?: number | null
  go_back?: 'soon' | 'someday' | 'once' | null
  stood_out?: string[] | null
  note?: string | null
}

export interface RateCandidate {
  event_id: string
  title: string
  place: string
  address: string | null
  visited_at: string
  members: Array<{ id: string; name: string }>
}

export function rateCandidates(events: unknown[], options?: { home?: string | null }): RateCandidate[]
export function rateAskPrompt(candidates: RateCandidate[]): string
export function parseRateAsk(text: string, count: number): number[]
export function rateRows(candidates: RateCandidate[], kept: number[], now?: Date): Array<Omit<OutingRating, 'id'>>
export function ratingsToAsk<T extends Pick<OutingRating, 'member_id' | 'visited_at' | 'status' | 'ask_after'>>(rows: T[], now: Date, memberId?: string | null): T[]
export function askAgainAt(now: Date): string
export function whenItWas(visitedAt: string, now: Date): string

export interface GuideTaste {
  loves: string[]
  tryFirst: string[]
  places: Array<{ name: string; note?: string }>
  teams: string[]
  reachMin: number
}
export const TASTE_KEY: string
export const REACH_CHOICES: Array<[number, string]>
export const DEFAULT_TASTE: GuideTaste
export function tasteOf(saved: unknown): GuideTaste

export type GuideLabel = 'local' | 'hot' | 'gem' | 'big'
/** A place worth trying (public.guide_places), as the scout's list sends it. */
export interface GuidePlace {
  id: string
  name: string
  address: string | null
  shelf: string
  shelf_label: string
  drive_min: number | null
  beyond: boolean
  rating: number | null
  rating_count: number | null
  maps_url: string | null
  website: string | null
  buzz: Array<{ kind: 'reddit' | 'press'; said: string | null; new: boolean; url: string | null }>
  labels: GuideLabel[]
  heard: string | null
  why: string | null
  touristy: boolean
  status: 'live' | 'saved' | 'not_for_us' | 'been'
}
export interface GuideShelf { id: string; label: string; match: RegExp | null; queries: string[] }
export const GUIDE_SHELVES: GuideShelf[]
export const GUIDE_AREAS: Array<{ id: string; name: string; lat: number | null; lng: number | null }>
export function guideShelves(taste: GuideTaste): GuideShelf[]
export function guideDriveMin(home: { lat: number; lng: number }, loc: { lat: number; lng: number }): number
export function placeVerdict(p: Record<string, any>, home: { lat: number; lng: number } | null, reachMin?: number): { ok: true; minutes: number; beyond: boolean } | { ok: false; note: string }
export function sameName(a: unknown, b: unknown): boolean
export function buzzPrompt(shelf: { label: string }, today: string): string
export function parseBuzz(text: string): Array<{ name: string; town: string | null; said: string | null; kind: 'reddit' | 'press'; new: boolean }>
export function reviewTrend(snaps: Array<{ seen_on: string; rating_count: number }>, now?: Date): { added: number; growth: number; days: number } | null
export function guideLabels(p: Record<string, any>, evidence?: { buzz?: Array<Record<string, any>>; trend?: { added: number; growth: number; days: number } | null }): string[]
export function heardLine(p: Record<string, any>, evidence?: { buzz?: Array<Record<string, any>>; trend?: { added: number; growth: number; days: number } | null }): string
export function guideScore(p: Record<string, any>): number
export function curatePrompt(places: Array<Record<string, any>>, taste: GuideTaste): string
export function parseCurate(text: string, count: number): Map<number, { keep: boolean; touristy: boolean; why: string | null }>
/** Places worth trying for the page: by shelf in the guide's order, the best few of each, then the rest. */
export function placesByShelf(places: GuidePlace[], each?: number): { shown: Array<{ shelf: string; label: string; places: GuidePlace[] }>; more: number; total: number }
/** A short town from an address: "Delray Beach". */
export function townOf(address: string | null): string | null
