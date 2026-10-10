import type { GuidePlace } from './guide.mjs'
import type { Outing } from './scout.mjs'

export type ListTag = 'try' | 'spot' | 'asked' | 'again' | 'family' | 'kelly' | 'jake' | 'local' | 'hot' | 'gem' | 'big'
export interface GuideWatch { id: string; name: string; kind: 'again' | 'asked'; whose: 'us' | 'family' | 'jake' | 'kelly'; note?: string | null; query?: string; status?: string }
export interface CalendarHit { next: string | null; last: string | null }
export interface ListItem {
  key: string
  type: 'place' | 'outing'
  id: string
  tags: ListTag[]
  is: string | null
  when: string
  title: string
  where: string
  heard: string | null
  why: string | null
  date: string | null
  time: string | null
  place?: GuidePlace
  outing?: Outing & { watch_id?: string | null }
  onCalendar?: boolean
  lastCalendar?: string | null
  /** Why it's a candidate (for its rank): asked, their own, again, a spot, the guide's saved, the scout's, the surprise. */
  from?: 'asked' | 'own' | 'again' | 'spot' | 'saved' | 'scout' | 'surprise'
  /** The kind its answers teach about: "watch:…", "night:trivia", "shelf:oysters". */
  lean?: string | null
}
export type Leanings = Record<string, { yes: number; no: number }>
export interface YourListPage { highlights: ListItem[]; more: ListItem[]; later: ListItem[]; counts: { places: number; onCalendar: number; later: number } }

export const LIST_SIZE: { highlights: number; more: number }
export const LIST_TAGS: Record<'try' | 'spot' | 'asked' | 'again' | 'family' | 'kelly' | 'jake', string>
export function clock(hhmm: string | null | undefined): string | null
export function dayWord(ymd: string, today: string): string
export function placeItem(p: GuidePlace, opts?: { today: string; calendar?: Record<string, CalendarHit>; surprise?: boolean }): ListItem
export function outingItem(o: Outing, opts?: { today: string; watch?: GuideWatch | null }): ListItem
export function calendarHits(places: Array<{ id: string; name: string }>, events: Array<{ title?: string | null; location_name?: string | null; start_time?: string | null }>, today: string): Record<string, CalendarHit>
export function surprisePick<T extends { status: string; labels?: string[]; beyond?: boolean; score?: number }>(places: T[], today: string, leanings?: Leanings): T | null
export function leanKey(x: Record<string, any> | null | undefined): string | null
export function tallyLeanings(rows?: { outings?: Array<Record<string, any>>; places?: Array<Record<string, any>>; today?: string | null }): Leanings
export const FADE_DAYS: { no: number; yes: number }
export const NO_BACKOFF_DAYS: number[]
export const NOT_NOW_DAYS: number
export function placeSaidNo(p: { no_count?: number | null; status?: string } | null, today: string, nowIso?: string): { no_count: number; said_no_at: string; snoozed_until: string | null; status: string }
export function snoozed(p: { snoozed_until?: string | null } | null, today: string): boolean
export function leaning(leanings: Leanings | null | undefined, key: string | null | undefined): number
export function wantScore(it: ListItem, opts: { today: string; leanings?: Leanings }): number
export function yourList(input: { places?: GuidePlace[]; outings?: Array<Outing & { watch_id?: string | null }>; watches?: GuideWatch[]; today: string; nowTime?: string | null; calendar?: Record<string, CalendarHit>; leanings?: Leanings }): YourListPage
export function laterLine(later: ListItem[], n?: number): string | null

export interface WatchEvent { title: string; date: string; time: string | null; venue: string | null; town: string | null; price_from: number | null; url: string; line: string | null }
export const WATCH_DAYS: number
export function watchPrompt(watch: { query: string }, opts: { today: string; until: string }): string
export function parseWatchEvents(text: unknown, opts: { today: string; until: string }): WatchEvent[]
export function watchOuting(e: WatchEvent, watch: { id: string; whose: string }): Record<string, unknown>
export interface LikeFound { name: string; town: string | null; what: string | null; alike: string | null; source: string | null }
export function likePrompt(p: Partial<GuidePlace> & { name: string }, opts: { today: string; have?: string[] }): string
export function parseLike(text: unknown, name: string): { knownFor: string | null; places: LikeFound[] }
export function watchTooFar(e: { venue?: string | null; town?: string | null }): boolean
export const UNCHECKED: string
export function collapseWatchDates<T extends { title: string; date: string; time: string | null }>(events: T[]): Array<T & { also: string[] }>
