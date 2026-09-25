import type { DayPlan } from './engine/types'

/** The calendar item a person's row opens: the one they're in now, else their next one today. */
export function eventForPerson(plan: DayPlan, memberId: string, now: Date, isEvent: (sourceId: string) => boolean): string | null {
  const t = now.getTime()
  const items = (plan.lanes.get(memberId) ?? []).filter((s) => isEvent(s.sourceId))
  const current = items.find((s) => s.start.getTime() <= t && t < s.end.getTime())
  if (current) return current.sourceId
  return items.filter((s) => s.start.getTime() > t).sort((a, b) => a.start.getTime() - b.start.getTime())[0]?.sourceId ?? null
}
