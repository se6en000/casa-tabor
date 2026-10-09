export interface LinkFacts {
  title: string | null
  description: string | null
  image: string | null
  site: string | null
  types: string[]
  recipe: boolean
  declared: Array<Record<string, unknown>>
}

export interface ShareRead {
  kind: 'events' | 'place' | 'recipe' | 'other'
  summary: string
  place: { name: string; town: string | null; said: string | null } | null
}

export function urlsIn(text: unknown): string[]
export function wordsOf(text: unknown): string
export function sourceOf(input: { url?: string | null; hasImage?: boolean; screenshot?: boolean }): string
export function isWalled(url: unknown): boolean
export function decodeEntities(s: unknown): string
export function linkFacts(html: unknown): LinkFacts
export function tiktokFacts(o: unknown): LinkFacts | null
export function factsSayAnything(f: LinkFacts | null): boolean
export function sharePrompt(input: { today: string; source: string; words: string; facts: LinkFacts | null; hasImage: boolean; members?: string[] }): string
export function parseShare(text: unknown): ShareRead
export function itemWhen(item: { date?: string; all_day?: boolean; start_time_local?: string | null; end_time_local?: string | null }): string
export function shareReply(outcome: Record<string, unknown>): string
export function sharedShelf(shelves: Array<{ id: string; label: string; match: RegExp | null }>, text: unknown): { id: string; label: string }
export function sharedHeard(name: string | null, source: string, said: string | null): string
