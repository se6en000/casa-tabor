import { clockTime, placeName } from './header.ts'
import type { DayPlan, Trip, WallMember } from './engine/types'
import type { Posture } from './posture'
import { homeItems } from './headerLead.ts'
import { packingGroups, type WallChecklistItem } from './packing.ts'
import type { ComingUpItem } from './comingUp'
import type { TodoList } from './todos'

// The morning paper (canvas 48a; Jake, Oct 6: "bring in the briefing into the calm screen … only for the morning …
// a button to dismiss it … a newspaper editorial look"). The facts come from the day the wall already has — so the
// paper never says something the wall doesn't — and the server writes only the headline, the line under it and the
// sky, once a day (supabase/functions/morning-paper). Pure, so it's tested.

/** Calm mornings until this hour (after the morning rush, which shows the full day). */
export const PAPER_UNTIL_HOUR = 11

export interface PaperRun { at: string; text: string; alert: string | null }
export interface PaperFacts {
  /** The day, yyyy-mm-dd (the paper's key). */
  date: string
  /** "Wednesday, October 7, 2026" */
  day: string
  runs: PaperRun[]
  /** Someone flying or driving away, or coming home. */
  away: string[]
  /** All-day things: a test, a birthday, a spirit day. */
  also: string[]
  weatherNow: string | null
}
/** One line of the brief: a short title and the line under it. */
export interface BriefLine { title: string; detail: string }
/**
 * The morning brief (canvas 58; Jake, Oct 6: "heres what to worry about today, heres what to prepare for the
 * weekend/next week, heres something a month out … dig up some stuff that I may have forgot about … surprise me").
 */
export interface PaperBrief {
  /** The headline's second half, set in brass italic ("and a big weekend coming."). */
  turn: string | null
  today: BriefLine[]
  weekend: BriefLine[]
  month: BriefLine[]
  wayOut: BriefLine[]
  /** One thing gone quiet: "You may have forgotten". */
  forgot: BriefLine | null
  /** The day's surprise — a date night, an outing, a year ago — with its own small label ("Worth a try · date night"). */
  feature: (BriefLine & { label: string }) | null
  /** One line at the foot: a family joke, or something nearby. */
  aside: string | null
}
/** What the server writes. */
export interface PaperWords { headline: string; deck: string; sky: string; brief?: PaperBrief | null }

/**
 * What the wall knows beyond today, for the brief to reach into: the week ahead, Coming up (lead times reach months
 * out), projects and to-dos that have gone quiet. Gift ideas never go in — the paper is on the family's wall.
 */
export interface BriefFacts {
  people: string[]
  week: Array<{ day: string; lines: string[] }>
  comingUp: Array<{ title: string; date: string; daysAway: number; nextStep: string; late: boolean }>
  projects: Array<{ title: string; done: number; total: number; next: string | null; aim: string | null }>
  quiet: string[]
  /** Due today or soon enough for a heads-up (todo-stage.mjs): "Clean the washing machine (tomorrow)". */
  soon?: string[]
}

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** "Emme", "Emme & Owen", "Liv, Emme & Owen". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

function runOf(trip: Trip, nameOf: (id: string | null) => string | null): PaperRun {
  const travelers = joinNames(trip.travelerIds.map(nameOf).filter((n): n is string => Boolean(n)))
  const driver = nameOf(trip.driverId)
  const place = placeName(trip)
  const alert = trip.driverId ? null : 'no driver yet'
  if (trip.kind === 'dropoff') {
    return { at: clockTime(trip.leaveAt ?? trip.arriveAt), text: driver ? `${driver} takes ${travelers} to ${place}` : `${travelers} to ${place}`, alert }
  }
  if (trip.kind === 'pickup') {
    return { at: clockTime(trip.arriveAt), text: driver ? `${driver} picks up ${travelers} at ${place}` : `Pick up ${travelers} at ${place}`, alert }
  }
  const who = travelers || driver || ''
  return { at: clockTime(trip.arriveAt), text: `${who ? `${who} · ` : ''}${trip.title} at ${place}`, alert }
}

/** The day's facts, from what's still ahead of `now` (a run that's done drops off the paper). */
export function paperFacts(plan: DayPlan, members: WallMember[], now: Date, weather?: { temp: number; condition: string } | null): PaperFacts {
  const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.name ?? null : null)
  const runs = plan.trips
    .filter((trip) => !trip.travel && (trip.homeAt ?? trip.arriveAt).getTime() > now.getTime())
    .sort((a, b) => (a.leaveAt ?? a.arriveAt).getTime() - (b.leaveAt ?? b.arriveAt).getTime())
    .map((trip) => runOf(trip, nameOf))
  const away = plan.travel.map((t) => {
    const name = nameOf(t.memberId) ?? 'Someone'
    const goes = t.mode === 'fly' ? 'flies to' : 'drives to'
    if (t.phase === 'leaving') return `${name} ${goes} ${t.city}${t.leaveHomeAt ? `, leaving at ${clockTime(t.leaveHomeAt)}` : ''}`
    if (t.phase === 'returning') return `${name} comes home from ${t.city}${t.homeAt ? ` about ${clockTime(t.homeAt)}` : ''}`
    return `${name} is away in ${t.city} · day ${t.dayIndex} of ${t.dayCount}`
  })
  const also = plan.allDay
    .filter((item) => !item.trip)
    .map((item) => {
      const who = joinNames(item.memberIds.map(nameOf).filter((n): n is string => Boolean(n)))
      return who ? `${who} · ${item.title}` : item.title
    })
  return {
    date: localDate(plan.date),
    day: plan.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    runs,
    away,
    also,
    weatherNow: weather ? `${Math.round(weather.temp)}° and ${weather.condition.toLowerCase()}` : null,
  }
}

/** Until the server's words arrive (or if it can't write them): plain ones from the facts. */
export function fallbackWords(facts: PaperFacts): PaperWords {
  const weekday = facts.day.split(',')[0]
  const missing = facts.runs.find((r) => r.alert)
  const headline = missing
    ? `${missing.text} at ${missing.at} still needs a driver.`
    : facts.away[0] ? `${facts.away[0]}.` : `An easy ${weekday}.`
  const parts = [
    facts.runs.length ? `${facts.runs.length === 1 ? 'One run' : `${facts.runs.length} runs`} on the road` : 'Nothing on the road',
    ...facts.also.slice(0, 2),
  ]
  return { headline, deck: `${parts.join('; ')}.`, sky: facts.weatherNow ? `${facts.weatherNow[0].toUpperCase()}${facts.weatherNow.slice(1)}.` : '' }
}

/** Whether the calm face is the paper: a calm morning not put away today, or a preview from the menu. */
/** From when the paper holds the morning (the night face ends at 6). */
export const PAPER_FROM_HOUR = 6
/** A departure or something at home this close gives way to the full day (Jake, Oct 8: "a leave event in 15 mins"). */
const PAPER_GIVES_WAY_MIN = 15
/** The full day stays this long after a leave-by time, for the leaving itself; then the paper comes back. */
const LEAVING_MIN = 5

/**
 * The morning paper's hours (Jake, Oct 8: "i want the morning paper to show case the morning, can it only get interupted
 * by me dismissing it, or when there is a leave event in 15 mins?"): 6 to 11, whatever the face would otherwise be,
 * until it's put away; a leave-by time 15 minutes out (until just after it) or something at home starting within 15
 * minutes (until it's over) gives way to the full day, and once the car's gone or it's done, the paper comes back.
 * Without a plan (older callers), only the calm face. A preview shows it any time.
 */
export function paperShows(input: { posture: Posture; now: Date; dismissedOn: string | null; previewing: boolean; plan?: DayPlan | null }): boolean {
  if (input.previewing) return true
  const { now } = input
  const hour = now.getHours()
  if (input.posture === 'evening' || hour < PAPER_FROM_HOUR || hour >= PAPER_UNTIL_HOUR || input.dismissedOn === localDate(now)) return false
  if (input.plan === undefined) return input.posture === 'calm'
  const t = now.getTime()
  const soon = PAPER_GIVES_WAY_MIN * 60_000
  const leaving = (input.plan?.trips ?? []).some((trip) => trip.leaveAt && trip.leaveAt.getTime() - t <= soon && t - trip.leaveAt.getTime() < LEAVING_MIN * 60_000)
  const atHome = homeItems(input.plan ?? null, now).some((h) => h.start.getTime() - t <= soon)
  return !leaving && !atHome
}

export const paperDate = localDate

const startOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

/** The week, Coming up, projects and quiet to-dos, as plain lines for the brief. */
export function briefFacts(input: {
  members: WallMember[]
  week: DayPlan[]
  now: Date
  checklist?: WallChecklistItem[]
  comingUp?: ComingUpItem[]
  todos?: TodoList | null
}): BriefFacts {
  const { members, now } = input
  const today = localDate(now)
  const week = input.week
    .filter((plan) => localDate(plan.date) > today)
    .slice(0, 7)
    .map((plan) => {
      const facts = paperFacts(plan, members, startOf(plan.date))
      const packing = packingGroups(plan, input.checklist ?? []).groups
        .map((g) => ({ heading: g.heading, open: g.items.filter((i) => !i.checked).map((i) => i.label) }))
        .filter((g) => g.open.length > 0)
      const lines = [
        ...facts.runs.map((r) => `${r.at} ${r.text}${r.alert ? ` (${r.alert})` : ''}`),
        ...facts.away,
        ...facts.also.map((a) => `all day: ${a}`),
        ...packing.map((g) => `${g.heading}: still to pack ${g.open.join(', ')}`),
      ]
      return { day: plan.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), lines: lines.slice(0, 8) }
    })
    .filter((d) => d.lines.length > 0)
  // The wall is read by the whole family: a gift step for one of them says only that there's planning to do.
  const names = members.map((m) => m.name.toLowerCase())
  const forFamily = (title: string) => names.some((n) => title.toLowerCase().includes(n))
  const comingUp = (input.comingUp ?? [])
    .map((i) => ({ title: i.title, date: i.date, daysAway: i.daysAway, nextStep: forFamily(i.title) && /gift|present|surprise/i.test(i.nextStep) ? 'Time to start planning' : i.nextStep, late: i.late }))
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 16)
  const projects = (input.todos?.projects ?? [])
    .filter((p) => p.done < p.total)
    .map((p) => ({ title: p.title, done: p.done, total: p.total, next: p.next, aim: p.aimDate }))
    .slice(0, 8)
  const items = input.todos ? [...input.todos.nextUp, ...Object.values(input.todos.groups).flat()] : []
  // Snoozed is silent in the brief too (Jake, Oct 7: "snoozed from all conversations till its due again").
  const quiet = [...new Map(items
    .filter((t) => !t.snoozedUntil && (t.snoozeCount >= 2 || t.overdue))
    .map((t) => [t.id, t.snoozeCount >= 2 ? `${t.title} (put off ${t.snoozeCount} times)` : `${t.title} (overdue${t.due ? ` since ${t.due}` : ''})`] as const)).values()]
    .slice(0, 8)
  // A heads-up for what's coming due (Jake, Oct 7: "maybe the morning paper can mention it a couple of times").
  const when = (due: string) => {
    const days = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${localDate(input.now)}T12:00:00Z`)) / 86_400_000)
    return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
  }
  const soon = [...new Map(items
    .filter((t) => (t.stage === 'due' || t.stage === 'heads_up') && t.due)
    .map((t) => [t.id, `${t.title} (${when(t.due!)})${t.notes ? ` — its notes: ${t.notes.replace(/\s+/g, ' ').slice(0, 220)}` : ''}`] as const)).values()]
    .slice(0, 6)
  return { people: members.map((m) => m.name), week, comingUp, projects, quiet, soon }
}

const weeksOut = (days: number) => (days < 14 ? `${days} days` : `${Math.round(days / 7)} weeks`)

/** The brief from the facts alone — before the server's words arrive, or if it can't write them. */
export function fallbackBrief(facts: PaperFacts, more: BriefFacts | null): PaperBrief {
  const missing = facts.runs.filter((r) => r.alert)
  const today: BriefLine[] = missing.length
    ? missing.slice(0, 2).map((r) => ({ title: 'Needs a driver', detail: `${r.text} at ${r.at}.` }))
    : [{ title: 'Nothing’s wrong', detail: facts.runs.length ? 'Every run has a driver.' : 'Nothing on the road today.' }]
  // "Emme & Owen · Spirit Day · wear school colors": the event as the title, who and the rest under it.
  today.push(...facts.also.slice(0, 2).map((a) => {
    const [who, ...rest] = a.split(' · ')
    return rest.length ? { title: rest[0], detail: [who, ...rest.slice(1)].join(' · ') } : { title: a, detail: '' }
  }))
  const weekend = (more?.week ?? []).slice(0, 3).map((d) => ({ title: d.day, detail: d.lines[0] + (d.lines.length > 1 ? `, and ${d.lines.length - 1} more` : '') }))
  const ahead = more?.comingUp ?? []
  const line = (i: BriefFacts['comingUp'][number]) => ({ title: `${i.title} · ${weeksOut(i.daysAway)}`, detail: i.nextStep })
  const stalled = (more?.projects ?? []).find((p) => p.next)
  return {
    turn: null,
    today: today.slice(0, 3),
    weekend,
    month: ahead.filter((i) => i.daysAway > 7 && i.daysAway <= 45).slice(0, 3).map(line),
    wayOut: ahead.filter((i) => i.daysAway > 45).slice(0, 3).map(line),
    forgot: stalled ? { title: `${stalled.title} — step ${stalled.done + 1} of ${stalled.total}`, detail: `Next: ${stalled.next}.` } : null,
    feature: null,
    aside: null,
  }
}

type Touchpoint = { x: number; y: number; t: number }

/**
 * The paper's pages turn sideways (canvas 72; Jake, Oct 8: "a left right swipe to move between the pages"): 1 for the
 * next page (a swipe left), -1 for the one before, 0 for a tap or a mostly-up-and-down drag. 80 px, or a quick flick.
 */
export function paperSwipe(start: Touchpoint, end: Touchpoint): -1 | 0 | 1 {
  const dx = end.x - start.x
  const dy = Math.abs(end.y - start.y)
  const far = Math.abs(dx) >= 80 && Math.abs(dx) > dy * 1.5
  const flick = Math.abs(dx) >= 40 && end.t - start.t <= 250 && Math.abs(dx) > dy * 2
  if (!far && !flick) return 0
  return dx < 0 ? 1 : -1
}

/** How far the page follows the hand: nothing until it's clearly sideways; a third past the first or last page. */
export function paperDrag(dx: number, dy: number, page: number, pages: number): number {
  if (Math.abs(dx) <= 8 || Math.abs(dx) <= Math.abs(dy)) return 0
  const pastEdge = (page === 0 && dx > 0) || (page === pages - 1 && dx < 0)
  return pastEdge ? Math.round(dx / 3) : dx
}

/** The front page's cards slim once it has moved this far (canvas 73A). */
export const PAPER_SLIM_AT = 12

/**
 * How far the front page scrolls (canvas 73A): not at all when it all fits above the full cards; otherwise to where its
 * last line clears the slim ones — and at least a little past PAPER_SLIM_AT, so a page that fits only once the cards
 * slim can still slim them. `content` is the words' height; `full`/`slim` the cards' heights with their gaps.
 */
export function frontScrollMax({ content, view, full, slim }: { content: number; view: number; full: number; slim: number }): number {
  if (content + full <= view) return 0
  return Math.max(content + slim - view, PAPER_SLIM_AT + 28)
}

/** Pulled past an end, the page gives a third of the pull. */
export function rubberBand(y: number, max: number): number {
  if (y < 0) return y / 3
  if (y > max) return max + (y - max) / 3
  return y
}

/**
 * One step of the page after the finger lets go (`v` in px/ms, down the page positive): inside, it coasts and slows
 * (friction); past an end, a critically damped spring brings it back to the end without going past it.
 */
export function flingStep({ y, v }: { y: number; v: number }, dt: number, max: number): { y: number; v: number } {
  const step = Math.min(dt, 32)
  const edge = y < 0 ? 0 : y > max ? max : null
  if (edge === null) {
    const nv = v * Math.pow(0.9965, step)
    const ny = y + nv * step
    return { y: ny, v: Math.abs(nv) < 0.005 && ny >= 0 && ny <= max ? 0 : nv }
  }
  // Past the end: x'' = -k·x - c·x', critically damped (c = 2√k), so it settles on the edge without crossing it.
  const k = 0.00028
  const c = 2 * Math.sqrt(k)
  let nv = v + (-k * (y - edge) - c * v) * step
  let ny = y + nv * step
  if ((y - edge) * (ny - edge) <= 0) { ny = edge; nv = 0 }
  if (Math.abs(ny - edge) < 0.3 && Math.abs(nv) < 0.02) { ny = edge; nv = 0 }
  return { y: ny, v: nv }
}
