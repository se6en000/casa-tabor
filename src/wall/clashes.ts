import type { DayPlan, WallMember } from './engine/types.ts'

// What else is going on for these people while something happens — Casa's card ("Clashes with School (Liv)") and the
// phone's form and scanner say it the same way.

/** "Clashes with Bak Middle School (Liv)" for anyone going whose day has something else then (drives aside). */
export function clashLines(plan: DayPlan | null, people: string[], start: Date, end: Date, members: WallMember[], ignoreId?: string): string[] {
  if (!plan || people.length === 0 || !(end > start)) return []
  const lines = people.flatMap((id) => (plan.lanes.get(id) ?? [])
    .filter((s) => s.sourceId !== ignoreId && s.kind !== 'drive' && s.start < end && s.end > start)
    .map((s) => `Clashes with ${s.label} (${members.find((m) => m.id === id)?.name ?? ''})`))
  return [...new Set(lines)]
}
