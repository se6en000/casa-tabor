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
}
export type NewsSection = 'schools' | 'city' | 'papers'
export interface TownNews { section: NewsSection; headline: string; line: string; source: string; source_date: string | null; source_ref?: string | null; rank: number; news_date?: string }
export type Busy = Record<string, boolean>

export const NEWS_SECTIONS: NewsSection[]
export function outAndAbout(rows: Outing[] | null | undefined, opts: { today: string; busy?: Busy; each?: number }): Record<'couple' | 'family' | 'fitness' | 'restaurant', Outing[]>
export function weekendHighlight(rows: Outing[] | null | undefined, opts: { today: string; busy?: Busy }): { label: 'This weekend' | 'This week'; outing: Outing } | null
export function outingWhen(o: Pick<Outing, 'when' | 'recurring'> & Partial<Outing>): string | null
export function townNewsPage(rows: TownNews[] | null | undefined): Record<NewsSection, TownNews[]>
export function outingLink(o: Partial<Outing> & Pick<Outing, 'kind' | 'title'>): string
