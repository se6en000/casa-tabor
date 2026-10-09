export type OutingKind = 'restaurant' | 'fitness' | 'couple' | 'family' | 'music' | 'comedy' | 'trivia'
export interface Outing {
  id: string
  kind: OutingKind
  title: string
  when: string | null
  recurring: string | null
  place: string | null
  address: string | null
  url: string | null
  why: string | null
  free: boolean | null
  drive_min: number | null
  rating: number | null
  rating_count: number | null
  gem: boolean
  status: 'new' | 'offered' | 'saved' | 'not_for_us' | 'been' | 'expired'
  offered_on?: string | null
  source?: string
  verify_note?: string | null
  google_place_id?: string | null
  /** A gig's act (Oct 9): would they know it, what it plays, its genre, and where it stands for them. */
  act?: { known?: 'yes' | 'maybe' | 'no'; plays?: string; of?: string | null; genre?: string | null; standing: 'star' | 'liked' | 'local' }
  venue_kind?: string | null
}
export type NewsSection = 'schools' | 'city' | 'papers'
export interface TownNews { section: NewsSection; headline: string; line: string; source: string; source_date: string | null; source_ref?: string | null; rank: number; news_date?: string; on_date?: string | null }
export type Busy = Record<string, boolean>

export const NEWS_SECTIONS: NewsSection[]
export function outAndAbout(rows: Outing[] | null | undefined, opts: { today: string; busy?: Busy; each?: number }): Record<'couple' | 'family' | 'fitness' | 'restaurant', Outing[]>
export function weekendHighlight(rows: Outing[] | null | undefined, opts: { today: string; busy?: Busy }): { label: 'This weekend' | 'This week'; outing: Outing } | null
export function outingWhen(o: Pick<Outing, 'when' | 'recurring'> & Partial<Outing>): string | null
export function townNewsPage(rows: TownNews[] | null | undefined, today?: string | null): Record<NewsSection, TownNews[]> & { dates: TownNews[] }
export function outingLink(o: Partial<Outing> & Pick<Outing, 'kind' | 'title'>): string
export interface DayPlan { day: string; label: string; items: Outing[]; more: number }
export function outAndAboutPlan(rows: Outing[] | null | undefined, opts: { today: string; nowTime?: string | null }): { weekend: DayPlan[]; nextWeek: Outing[]; later: Outing[]; weekly: Outing[]; places: Outing[]; count: number }
export const OUT_WHAT: string[][]
export const OUT_WHO: string[][]
export function isTouring(o: Outing): boolean
export function outWhenChoices(today: string): string[][]
export function outFiltered(rows: Outing[] | null | undefined, pick: { what?: string; who?: string; when?: string; today: string }): Outing[]
export function outCounts(rows: Outing[] | null | undefined, pick: { what: string; who: string; when: string; today: string }, which: 'what' | 'who' | 'when'): Record<string, number>
export function isBigRoom(place: string | null | undefined): boolean
export function venueKey(name: unknown): string
export function venuePrompt(names: string[]): string
export function parseVenues(text: unknown, count: number): Map<number, { kind: 'cover' | 'concert' | 'original' | 'mixed'; note: string | null }>
export const venueKindOf: (v: { kind?: string; family?: string | null } | null | undefined) => string | null
export function bandRank(o: { title?: string; venue_kind?: string | null }): number
export function actKey(title: unknown): string
export function actPrompt(acts: Array<{ title: string; place?: string | null }>): string
export function parseActs(text: unknown, count: number): Map<number, { known: 'yes' | 'maybe' | 'no'; plays: 'tribute' | 'covers' | 'originals' | 'unknown'; of: string | null; genre: string | null }>
export function genreLiked(genre: string | null | undefined, genres: string[]): boolean
export function actStanding(act: { known?: string; plays?: string; genre?: string | null } | null | undefined, genres: string[]): 'star' | 'liked' | 'local'
