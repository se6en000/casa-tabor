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
}

/** Due within this long is "soon" (brass). */
export const SOON_MS = 30 * 60_000

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const choreDoneKey = (choreId: string, date: Date) => `chore:${choreId}:${ymd(date)}`
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b)

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
      items.push({ key, kind: 'chore', id: chore.choreId, at: chore.at, title: chore.title, whoId: chore.doerId ?? chore.forMemberId, state: stateAt(chore.at, now), tag: tagFor(chore.at, now) })
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
      items.push({ key, kind: 'todo', id: item.id, at, title: item.title, whoId: null, state: stateAt(at, now), tag: tagFor(at, now) })
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
    })
  }
  return out
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
  const room = columns * 2
  return items.length <= room ? { shown: items, more: 0 } : { shown: items.slice(0, room), more: items.length - room }
}
