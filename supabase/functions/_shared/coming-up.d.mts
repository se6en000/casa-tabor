// Types for coming-up.mjs, for the wall's fixture (the seasons and their starter plans, P3.23).
export interface SeasonStep { title: string; grp: number; minutes?: number; repeat_minutes?: number; repeat_count?: number; repeat_unit?: string; who?: string }
export interface Season {
  id: string
  title: string
  date: (year: number) => string
  poke: (year: number) => string
  step: string
  template?: SeasonStep[]
}
export const SEASONS: Season[]
export const COMING_UP_WEEKS: number
export function buildComingUp(input: Record<string, unknown>): Array<Record<string, unknown>>
export function fewerLikeMatch(item: { title?: string; kind?: string } | null | undefined, family?: Array<{ name: string; full_name?: string | null }>): string | null
export function handledFromState(stateRows: unknown[], today: string): Array<{ key: string; title: string; date: string; text: string; eventId: string | null; by: string; at: string }>
