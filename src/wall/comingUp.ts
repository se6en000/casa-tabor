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
  /** The family members those ideas are for — a phone keeps them from that person. */
  ideasFor?: string[]
  /** A project's step or target (P3.23): its project, to open. */
  projectId?: string
  /** A season that's a real job, not started yet: it can start as this year's project. */
  startable?: boolean
  /** Its plan at a glance, for its dashed card on the To do shelf. */
  plan?: { steps: number; minutes: number; first: string }
  /** A trip away (coverage.ts): opens the trip sheet, where its runs are covered. */
  tripKey?: string
}
export interface GiftIdea { id?: string; for_name: string; for_member_id?: string | null; idea: string }
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
  // `items` keep each idea's id, so it can be corrected by hand (Jake, 2026-09-29).
  const groups: Array<{ name: string; ideas: string[]; items: GiftIdea[] }> = []
  for (const g of ideas) {
    const found = groups.find((x) => x.name.toLowerCase() === g.for_name.toLowerCase())
    if (found) { found.ideas.push(g.idea); found.items.push(g) }
    else groups.push({ name: g.for_name, ideas: [g.idea], items: [g] })
  }
  return groups
}

/**
 * The wall screen's heights at the 1920×1080 stage (measured on the fixture, 2026-09-27): a row
 * (title and step on one line each, cut short rather than wrapped), a section heading above it, the
 * gift-ideas line, and the space between the header and the week strip, less a little slack for
 * the kiosk's 1.333× scale.
 */
// Measured on the stage beside the left panel (canvas 59): a row with its answers under the words; the room above the strip.
export const COMING_UP_SIZES = { row: 188, heading: 39, ideas: 29, area: 848 }

export interface ComingUpEntry { item: ComingUpItem; heading: string | null }

/**
 * Pages of two columns, filled by height: each page takes as many items as two columns hold, split
 * where the taller column is shortest. A column always opens with a heading ("THIS WEEK, CONTINUED"
 * when the section began before it).
 */
export function comingUpPages(items: ComingUpItem[], today: string, sizes = COMING_UP_SIZES): ComingUpEntry[][][] {
  const flat = comingUpSections(items, today).flatMap((s) => s.items.map((item, i) => ({ item, section: s.heading, first: i === 0 })))
  const column = (from: number, to: number): ComingUpEntry[] => flat.slice(from, to).map((e, i) => ({
    item: e.item,
    heading: e.first ? e.section : i === 0 ? `${e.section}, CONTINUED` : null,
  }))
  const height = (col: ComingUpEntry[]) => col.reduce((h, e) => h + (e.heading ? sizes.heading : 0) + sizes.row + (e.item.ideas?.length ? sizes.ideas : 0), 0)
  const pages: ComingUpEntry[][][] = []
  let start = 0
  while (start < flat.length) {
    let best: { end: number; split: number; tallest: number } | null = null
    for (let end = flat.length; end > start && !best; end--) {
      for (let split = start + 1; split <= end; split++) {
        const left = column(start, split)
        const right = column(split, end)
        const tallest = Math.max(height(left), height(right))
        if (tallest > sizes.area) continue
        // On a tie, more on the left.
        if (!best || tallest <= best.tallest) best = { end, split, tallest }
      }
    }
    // A single row always fits; never loop forever on an odd size.
    const { end, split } = best ?? { end: start + 1, split: start + 1 }
    pages.push([column(start, split), column(split, end)].filter((c) => c.length > 0))
    start = end
  }
  return pages
}

/** On a phone: never the gift ideas meant for whoever is holding it (as the assistant does). */
export function forViewer(items: ComingUpItem[], viewerId: string): ComingUpItem[] {
  return items.map((i) => (i.ideas && viewerId && i.ideasFor?.includes(viewerId) ? { ...i, ideas: undefined } : i))
}
