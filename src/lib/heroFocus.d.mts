export interface HeroFocusEvent {
  start_time: string
  end_time?: string | null
  all_day?: boolean
  event_type?: string
}

export function formatDurationLabel(minutes: number): string

export function pickActiveHeroEvent<T extends HeroFocusEvent>(
  events: T[],
  now: Date | number,
): T | null

export function resolveRestingIndex(
  slideEvents: Array<{ id?: string | null }>,
  activeId: string | null | undefined,
  nextTodayId: string | null | undefined,
): number
