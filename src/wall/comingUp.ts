// The Coming up screen's model (boards 07a/07b, approved by Jake 2026-09-27): the digest from the
// `coming-up` function, grouped the way the family acts on it. Shared by the wall and the phone.

/** One item as the `coming-up` function returns it (`buildComingUp`). */
export interface ComingUpItem {
  key: string
  kind: string
  title: string
  /** YYYY-MM-DD, the day itself. */
  date: string
  daysAway: number
  nextStep: string
  /** YYYY-MM-DD, when to start. */
  pokeOn: string
  late: boolean
  ideas?: string[]
}
export interface GiftIdea { for_name: string; idea: string }
export type ComingUpAction = 'done' | 'snooze' | 'dismiss'

const plus = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400e3).toISOString().slice(0, 10)
const short = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Start now (late, or its plan-by day is today), this week, later — empty groups left out. */
export function comingUpSections(items: ComingUpItem[], today: string) {
  const week = plus(today, 7)
  const groups = [
    { heading: 'START NOW', items: items.filter((i) => i.late || i.pokeOn <= today) },
    { heading: 'THIS WEEK', items: items.filter((i) => !i.late && i.pokeOn > today && i.pokeOn <= week) },
    { heading: 'LATER', items: items.filter((i) => !i.late && i.pokeOn > week) },
  ]
  return groups.filter((g) => g.items.length > 0)
}

/** "Plan by Oct 5 · in 68 days", "Plan by Sep 23 · late · in 3 days". */
export function planByLine(item: ComingUpItem, today: string) {
  const by = item.pokeOn === today ? 'today' : item.pokeOn === plus(today, 1) ? 'tomorrow' : short(item.pokeOn)
  const away = item.daysAway <= 0 ? 'today' : item.daysAway === 1 ? 'tomorrow' : `in ${item.daysAway} days`
  return `Plan by ${by}${item.late ? ' · late' : ''} · ${away}`
}

/** The week strip's eighth tile. */
export function comingUpTile(items: ComingUpItem[], today: string) {
  return { count: items.length, startNow: items.filter((i) => i.late || i.pokeOn <= today).length }
}

/** The Gift ideas sheet: ideas grouped by who they're for, in the order first saved. */
export function ideasByPerson(ideas: GiftIdea[]) {
  const groups: Array<{ name: string; ideas: string[] }> = []
  for (const g of ideas) {
    const found = groups.find((x) => x.name.toLowerCase() === g.for_name.toLowerCase())
    if (found) found.ideas.push(g.idea)
    else groups.push({ name: g.for_name, ideas: [g.idea] })
  }
  return groups
}
