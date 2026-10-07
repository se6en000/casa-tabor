import type { DayPlan, WallMember } from './engine/types.ts'

// What else is going on for these people while something happens — Casa's card ("Clashes with School (Liv)") and the
// phone's form and scanner say it the same way.

/**
 * "Clashes with Dentist (Liv)" for anyone going whose day has something else then (drives aside). A routine is never a
 * clash (Jake, Oct 7: "If there is a clash with a 'routine' schedule - I really dont need the alert. If it conflicts
 * with a real apt i def want to know") — school, work and the like are what the day is built around.
 */
export function clashLines(plan: DayPlan | null, people: string[], start: Date, end: Date, members: WallMember[], ignoreId?: string): string[] {
  if (!plan || people.length === 0 || !(end > start)) return []
  const lines = people.flatMap((id) => (plan.lanes.get(id) ?? [])
    .filter((s) => s.sourceId !== ignoreId && s.kind !== 'drive' && !s.fromRoutine && s.start < end && s.end > start)
    .map((s) => `Clashes with ${s.label} (${members.find((m) => m.id === id)?.name ?? ''})`))
  return [...new Set(lines)]
}

/**
 * When someone else has them then (Owen's afternoons with Giselle): not an alert, the question to settle — "Owen's
 * with Giselle then — who's taking Owen?" (Jake, Oct 7: "Owen has a dentist apt at 3PM, i would need to coordinate
 * that with Giselle").
 */
export function coverLines(plan: DayPlan | null, people: string[], start: Date, end: Date, members: WallMember[]): string[] {
  if (!plan || people.length === 0 || !(end > start)) return []
  const lines = people.flatMap((id) => {
    const name = members.find((m) => m.id === id)?.name ?? ''
    return (plan.lanes.get(id) ?? [])
      .filter((s) => s.coverName && s.kind === 'at_place' && s.start < end && s.end > start)
      .map((s) => `${name}’s with ${s.coverName} then — who’s taking ${name}?`)
  })
  return [...new Set(lines)]
}
