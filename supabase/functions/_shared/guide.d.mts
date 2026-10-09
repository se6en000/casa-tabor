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
