import { formatWallClock } from './clock.ts'
import type { DayPlan, WallMember } from './engine/types.ts'
import type { TodoItem, TodoList } from './todos.ts'

// The day's small timed jobs (canvas 27a and 27c; Jake, 2026-10-01: "trash and meds dont get lost in the noise").
// By day, NEXT UP is the first slot of the full day's rail; from 7 PM, when the wall has turned to tomorrow, what's
// left of today is the STILL TONIGHT card in the header, with whoever is still out. Chores (household_chores) and
// to-dos with a real time today, in time order; late in rust, due within half an hour in brass, later plain.

export type NextUpState = 'late' | 'soon' | 'later'

export interface NextUpItem {
  /** What a tick is saved against: `chore:<id>:<YYYY-MM-DD>` or `todo:<id>`. */
  key: string
  kind: 'chore' | 'todo' | 'out'
  /** The chore's or to-do's id; for someone out, the calendar item. */
  id: string
  at: Date
  title: string
  /** Whose it is (a chore's doer, or who it's for); null for a to-do. */
  whoId: string | null
  state: NextUpState
  /** "40 min late", "in 20 min", "until 9:30"; null when there's nothing to say. */
  tag: string | null
  /** Someone out: when they're back. */
  until?: Date
  /** "AM"/"PM" when it's in the other half of the day from now (8 AM's to-do on the evening card), else null. */
  meridiem: string | null
  /** A to-do's kind, project, how it got here and whether it's a copy (canvas 74C1; from the server's list). */
  todoKind?: 'reminder' | 'step'
  project?: { id: string; title: string | null; step: number | null; of: number | null } | null
  origin?: TodoOrigin | null
  copyOf?: string | null
}

export interface TodoOrigin { via: 'alexa' | 'hand' | 'email' | 'scan' | 'project' | null; where: 'wall' | 'phone' | null; text: string | null; at: string | null }

/** The small capitals above a card's name (canvas 74C1): "Reminder", "Project · step 2 of 5", "Chore · Jake", "Out". */
export function cardKind(item: Pick<NextUpItem, 'kind'> & Partial<Pick<NextUpItem, 'todoKind' | 'project'>>, whoName: string | null = null): string {
  if (item.kind === 'chore') return whoName ? `Chore · ${whoName}` : 'Chore'
  if (item.kind === 'out') return 'Out'
  if (item.todoKind === 'step') return item.project?.step && item.project.of ? `Project · step ${item.project.step} of ${item.project.of}` : 'Project step'
  return 'Reminder'
}

/** When, as the card's foot says it (short — the foot is one line): "7:17 AM" today, "Wed 4:26 PM" this week, else "Oct 1". */
function whenSaid(iso: string, now: Date): string {
  const d = new Date(iso)
  const clock = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000)
  if (days === 0) return clock
  if (days >= 1 && days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${clock}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** How it got here, at a card's foot (canvas 74C1): Alexa, a hand, an email, a scan, its project — or just when. */
export function originLine(origin: TodoOrigin | null | undefined, projectTitle: string | null, now: Date): string | null {
  if (!origin) return null
  const when = origin.at ? whenSaid(origin.at, now) : null
  const tail = when ? ` · ${when}` : ''
  if (origin.via === 'alexa') return `By Alexa${origin.where === 'phone' ? ' on a phone' : ''}${tail}`
  if (origin.via === 'hand') return `Added on ${origin.where === 'phone' ? 'a phone' : 'the wall'}${tail}`
  if (origin.via === 'email') return origin.text
  if (origin.via === 'scan') return `Scanned${tail}`
  if (origin.via === 'project') return projectTitle
  return when ? `Added ${when}` : null
}

/** Due within this long is "soon" (brass). */
export const SOON_MS = 30 * 60_000

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const choreDoneKey = (choreId: string, date: Date) => `chore:${choreId}:${ymd(date)}`
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b)

/** The half of the day, said only when it isn't now's (live, Oct 1: "8:00 … 6:00 … 8:00" read out of order). */
export const meridiemFor = (at: Date, now: Date) => ((at.getHours() < 12) === (now.getHours() < 12) ? null : formatWallClock(at).meridiem)

export function stateAt(at: Date, now: Date): NextUpState {
  const ms = at.getTime() - now.getTime()
  return ms < 0 ? 'late' : ms <= SOON_MS ? 'soon' : 'later'
}

/** "40 min late" under an hour, then just "Late"; "in 20 min" when it's soon. */
export function tagFor(at: Date, now: Date): string | null {
  const minutes = Math.round((at.getTime() - now.getTime()) / 60_000)
  const state = stateAt(at, now)
  if (state === 'late') return -minutes < 60 ? `${Math.max(1, -minutes)} min late` : 'Late'
  if (state === 'soon') return minutes <= 0 ? 'now' : `in ${minutes} min`
  return null
}

/** A to-do's time today, or null: a date with no time (stored at midnight, or at 5 PM by the iOS sync) isn't timed. */
export function todoTimeToday(item: Pick<TodoItem, 'dueAt' | 'due' | 'snoozedUntil'>, now: Date): Date | null {
  if (!item.dueAt || !item.due || item.snoozedUntil) return null
  const at = new Date(item.dueAt)
  if (!sameDay(at, now)) return null
  const hm = at.getHours() * 60 + at.getMinutes()
  return hm === 0 || hm === 17 * 60 ? null : at
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4))

/**
 * Today's chores and timed to-dos not yet done, in time order. A to-do at the same minute as a chore with a word
 * in common is the same job ("Trash out to the street" in Reminders, "Trash to the street" as a chore): one line.
 */
export function nextUpItems(plan: DayPlan | null, list: Pick<TodoList, 'nextUp' | 'groups'> | null, done: ReadonlySet<string>, now: Date): NextUpItem[] {
  const items: NextUpItem[] = []
  if (plan && sameDay(plan.date, now)) {
    for (const chore of plan.chores) {
      const key = choreDoneKey(chore.choreId, now)
      if (done.has(key)) continue
      items.push({ key, kind: 'chore', id: chore.choreId, at: chore.at, title: chore.title, whoId: chore.doerId ?? chore.forMemberId, state: stateAt(chore.at, now), tag: tagFor(chore.at, now), meridiem: meridiemFor(chore.at, now) })
    }
  }
  if (list) {
    const seen = new Set<string>()
    for (const item of [...list.nextUp, ...Object.values(list.groups).flat()]) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      const at = todoTimeToday(item, now)
      const key = `todo:${item.id}`
      if (!at || done.has(key)) continue
      const mine = words(item.title)
      if (items.some((c) => c.kind === 'chore' && c.at.getTime() === at.getTime() && [...words(c.title)].some((w) => mine.has(w)))) continue
      items.push({
        key, kind: 'todo', id: item.id, at, title: item.stepTitle ?? item.title, whoId: null, state: stateAt(at, now), tag: tagFor(at, now), meridiem: meridiemFor(at, now),
        todoKind: item.kind, project: item.project ?? null, origin: item.origin ?? null, copyOf: item.copyOf ?? null,
      })
    }
  }
  return items.sort((a, b) => a.at.getTime() - b.at.getTime() || a.title.localeCompare(b.title))
}

/**
 * Who is still out tonight (canvas 27c, "Kelly at the gym until 9:30"): someone at a place away from home now or
 * later this evening, one line each (the first such block). Not chores, drives or a trip away (the trip has its own
 * marks).
 */
export function outTonight(plan: DayPlan | null, members: WallMember[], now: Date): NextUpItem[] {
  if (!plan || !sameDay(plan.date, now)) return []
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const out: NextUpItem[] = []
  for (const member of members) {
    const block = (plan.lanes.get(member.id) ?? [])
      .filter((s) => s.kind !== 'drive' && !s.chore && !s.travel && s.placeStatus === 'away' && s.end > now && s.start < midnight)
      .sort((a, b) => a.start.getTime() - b.start.getTime())[0]
    if (!block) continue
    out.push({
      key: `out:${member.id}`,
      kind: 'out',
      id: block.sourceId,
      at: block.start,
      title: `${member.name} at ${placeWords(block.label)}`,
      whoId: member.id,
      state: 'later',
      tag: `until ${formatWallClock(block.end).time}`,
      until: block.end,
      meridiem: meridiemFor(block.start, now),
    })
  }
  return out
}

/** One line of THIS EVENING (canvas 78C): when, what, whose. */
export interface EveningLine { key: string; at: Date; title: string; whoId: string | null; initial: string; late: boolean; meridiem: string | null }

/** THIS EVENING heading before 4 PM only when every line is from 5 PM on; else LATER TODAY. */
export function eveningHeading(lines: Pick<EveningLine, 'at'>[], now: Date): string {
  return now.getHours() >= 16 || lines.every((l) => l.at.getHours() >= 17) ? 'THIS EVENING' : 'LATER TODAY'
}

/**
 * The rest of today on the calm face's left panel when nothing else is on the road (canvas 78C; Jake, Oct 8: "this
 * could look better"): the chores and timed to-dos still to do; whoever's at work, when they're off; and whoever's
 * out — when they're done there, or when they go. In time order.
 */
export function thisEvening(jobs: NextUpItem[], plan: DayPlan | null, members: WallMember[], now: Date): EveningLine[] {
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? ''
  const line = (key: string, at: Date, title: string, whoId: string | null, late = false): EveningLine => ({ key, at, title, whoId, initial: nameOf(whoId).charAt(0), late, meridiem: meridiemFor(at, now) })
  const lines = jobs.map((j) => line(j.key, j.at, j.title, j.whoId, j.state === 'late'))
  if (plan && sameDay(plan.date, now)) {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    for (const member of members) {
      const work = (plan.lanes.get(member.id) ?? []).find((s) => s.work && s.start <= now && s.end > now && s.end < midnight)
      if (work) lines.push(line(`work:${member.id}`, work.end, `${member.name} off work`, member.id))
    }
  }
  for (const o of outTonight(plan, members, now)) {
    const there = o.at.getTime() <= now.getTime()
    const at = there && o.until ? o.until : o.at
    lines.push(line(o.key, at, there ? `${nameOf(o.whoId)} done at ${o.title.slice(nameOf(o.whoId).length + 4)}` : `${o.title} ${o.tag ?? ''}`.trim(), o.whoId))
  }
  return lines.sort((a, b) => a.at.getTime() - b.at.getTime() || a.title.localeCompare(b.title))
}

/** "Gym" → "the gym", "Ferrin Park" stays as it is. */
function placeWords(label: string): string {
  const name = label.split(':')[0].trim()
  return /^[a-z]/.test(name) || /^(gym|office|work|school|church|practice|pool|park|library|store|beach|doctor|dentist)$/i.test(name) ? `the ${name.toLowerCase()}` : name
}

/** Still tonight: the to-dos first by time, with whoever's out placed among them by when they went. */
export function stillTonight(todo: NextUpItem[], out: NextUpItem[]): NextUpItem[] {
  return [...todo, ...out].sort((a, b) => a.at.getTime() - b.at.getTime() || (a.kind === 'out' ? 1 : 0) - (b.kind === 'out' ? 1 : 0))
}

/** By day NEXT UP looks this far ahead (the coming hours); late ones stay until ticked. */
export const AHEAD_MS = 4 * 3_600_000

/** What NEXT UP shows on the full day: late, or due within the next four hours (8 PM's trash from 4 PM, not at 7 AM). */
export function comingHours(items: NextUpItem[], now: Date): NextUpItem[] {
  return items.filter((i) => i.state === 'late' || i.at.getTime() - now.getTime() <= AHEAD_MS)
}

/** How many fit: two rows a column; `columns` across. The rest are "+N later". */
export function fitNextUp<T>(items: T[], columns: number): { shown: T[]; more: number } {
  // One card a box (canvas 74C1).
  const room = Math.max(1, columns)
  return items.length <= room ? { shown: items, more: 0 } : { shown: items.slice(0, room), more: items.length - room }
}

/** How many of the rail's four boxes NEXT UP takes (canvas 74C1): what get & pack (two) and a decision (one) don't. */
export function nextUpBoxes({ packing, deciding }: { packing: boolean; deciding: boolean }): 1 | 2 | 3 | 4 {
  return Math.max(1, 4 - (packing ? 2 : 0) - (deciding ? 1 : 0)) as 1 | 2 | 3 | 4
}
