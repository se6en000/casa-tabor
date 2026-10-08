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
  /** What's already set (canvas 66): it's on the calendar; a reminder for it. */
  onCalendar?: boolean
  reminder?: { id: string; title: string; at: string; allDay: boolean } | null
}

/** "Reminder Sun 7 PM", "Reminder Fri Oct 9" (no time when it has none) — within a week, the weekday is enough. */
export function reminderMark(reminder: { at: string; allDay: boolean }, now = new Date()): string {
  const d = new Date(reminder.at)
  const days = (d.getTime() - now.getTime()) / 86_400_000
  const day = days >= 0 && days < 6 ? d.toLocaleDateString('en-US', { weekday: 'short' }) : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')
  const midnight = d.getHours() === 0 && d.getMinutes() === 0
  const time = reminder.allDay || midnight ? '' : ` ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00 ', ' ')}`
  return `Reminder ${day}${time}`
}
/** A project on Ahead, one entry (canvas 68–69): coming-up.mjs groupProjects. */
export interface AheadProject {
  key: string
  projectId: string
  title: string
  done: number
  total: number
  left: number
  next: { title: string; date: string | null } | null
  /** Its aim date (or its season's day); null when none. */
  target: string | null
  /** When its open steps fall. */
  from: string | null
  to: string | null
  /** Where its dot sits on the timeline. */
  date: string | null
}

const MONTH = (date: string, form: 'long' | 'short') => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: form, timeZone: 'UTC' })
/** "Target Sun Nov 22"; with no target, when its steps fall (Jake: "or maybe just, 'in november' if theres no due date"). */
export function projectWhen(p: Pick<AheadProject, 'target' | 'from' | 'to'>): string {
  if (p.target) return `Target ${horizonDate(p.target)}`
  if (!p.from || !p.to) return 'No dates yet'
  return p.from.slice(0, 7) === p.to.slice(0, 7) ? `In ${MONTH(p.from, 'long')}` : `${MONTH(p.from, 'short')} – ${MONTH(p.to, 'short')}`
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

// ── On the Horizon (canvas 63–64; Jake, Oct 7: "this is more of a Future view, vs a planner, that done on the to do
// side" → "lets go with On the Horizon"). A reading list by time, nearest boldest; a tap talks a line through with
// Alexa; ✓ handled / ✕ not for us clear it; a strip below shows the weeks ahead as dots. ─────────────────────────

/** Something handled (the coming-up function's `handled`): on the timeline as a ✓, with what was done. */
export interface HandledItem { key: string; title: string; date: string; text: string; eventId: string | null; by: string; at: string }

export interface HorizonGroup { key: string; heading: string; tone: 'near' | 'soon' | 'far'; items: ComingUpItem[] }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** This week · Next two weeks · Later in <this month> · <next month> and on — empty ones left out, each by date. */
export function horizonGroups(items: ComingUpItem[], today: string): HorizonGroup[] {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
  const month = Number(today.slice(5, 7)) - 1
  const groups: HorizonGroup[] = [
    { key: 'week', heading: 'This week', tone: 'near', items: sorted.filter((i) => i.daysAway <= 6) },
    { key: 'two', heading: 'Next two weeks', tone: 'soon', items: sorted.filter((i) => i.daysAway > 6 && i.daysAway <= 20) },
    { key: 'month', heading: `Later in ${MONTHS[month]}`, tone: 'far', items: sorted.filter((i) => i.daysAway > 20 && Number(i.date.slice(5, 7)) - 1 === month && i.date.slice(0, 4) === today.slice(0, 4)) },
  ]
  const placed = new Set(groups.flatMap((g) => g.items.map((i) => i.key)))
  groups.push({ key: 'later', heading: `${MONTHS[(month + 1) % 12]} and on`, tone: 'far', items: sorted.filter((i) => !placed.has(i.key)) })
  return groups.filter((g) => g.items.length > 0)
}

/** "Thu Oct 8" */
export function horizonDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '')
}

/** Its dot: tomorrow or sooner rust, the next three weeks brass, further stone. */
export function horizonTone(item: Pick<ComingUpItem, 'daysAway'>): 'rust' | 'brass' | 'stone' {
  return item.daysAway <= 2 ? 'rust' : item.daysAway <= 20 ? 'brass' : 'stone'
}

export interface HorizonEntry { item: ComingUpItem; heading: string | null; tone: HorizonGroup['tone'] }

/** Two columns a page, filled in order by rows (a heading is half a row); what doesn't fit goes to the next page. */
export function horizonPages(groups: HorizonGroup[], rowsPerColumn = 9): HorizonEntry[][][] {
  const pages: HorizonEntry[][][] = [[[], []]]
  let col = 0
  let used = 0
  const place = (entry: HorizonEntry, cost: number) => {
    if (used + cost > rowsPerColumn) {
      col += 1
      used = 0
      if (col > 1) { pages.push([[], []]); col = 0 }
      // A heading carried over to a new column says so again.
      if (!entry.heading) { entry = { ...entry, heading: lastHeading }; cost += 0.5 }
    }
    pages[pages.length - 1][col].push(entry)
    used += cost
  }
  let lastHeading: string | null = null
  for (const g of groups) {
    g.items.forEach((item, i) => {
      lastHeading = g.heading
      // A line with its marks (canvas 66) takes a little more room.
      const marks = item.onCalendar || item.reminder ? 0.3 : 0
      place({ item, heading: i === 0 ? g.heading : null, tone: g.tone }, (i === 0 ? 1.5 : 1) + marks)
    })
  }
  return pages
}
