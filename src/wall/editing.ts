import { reconcileTransportationLegTimes, rescheduledDepartureIso } from '../lib/eventMutations.ts'
import type { EventTransportationPlan } from '../lib/eventTransportation'
import { clockTime } from './header.ts'
import type { DayPlan, WallEvent, WallMember } from './engine/types'

// Editing an event or reminder on the wall (boards 03d/03e/03f): a draft of the
// title, day, times and place, what changed, a preview for the engine, and the
// list of existing save steps (eventMutations.ts) to run. Pure, so it's tested
// without rendering or a database.

const MINUTE = 60_000
const STEP_MIN = 15
const DAY_MIN = 24 * 60
const DAY_CHIPS = 6

/** The fields editing reads, beyond what the engine does. */
export interface EditableEvent extends WallEvent {
  event_type?: string | null
  has_due_date?: boolean | null
}

export interface DraftPlace {
  name: string
  address: string
  /** From the route lookup; null when unknown or when there's no place. */
  driveMinutes: number | null
}

export interface EditDraft {
  title: string
  /** Local midnight of the event's day. */
  day: Date
  startMin: number
  endMin: number
  allDay: boolean
  /** Reminders only: no due date at all. */
  anytime: boolean
  place: DraftPlace
}

export type ChangeField = 'title' | 'day' | 'start' | 'end' | 'allDay' | 'anytime' | 'place'

export interface DraftChange {
  field: ChangeField
  /** The old value, as shown next to the new one ("was 12:30 PM"). */
  was: string
}

export type SaveStep =
  | { kind: 'title'; title: string }
  | { kind: 'schedule'; start: Date; end: Date; allDay: boolean }
  | { kind: 'clearDueDate' }
  | { kind: 'venue'; venue: { name: string; address: string; driveMinutes?: number } }

const midnight = (d: Date) => {
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)
  return day
}
const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()
const atMinutes = (day: Date, minutes: number) => new Date(midnight(day).getTime() + minutes * MINUTE)
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)
const timeLabel = (minutes: number) =>
  `${clockTime(atMinutes(new Date(2000, 0, 1), minutes))} ${minutes % DAY_MIN < 12 * 60 ? 'AM' : 'PM'}`
const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export function isReminder(event: EditableEvent): boolean {
  return event.event_type === 'reminder'
}

/**
 * "No place" only makes sense when no trip is planned: with a saved transportation
 * plan the wall (and the save path) would still treat it as an outing.
 */
export function canClearPlace(event: EditableEvent): boolean {
  return !(event.plan_override?.transportation_plan?.legs?.length)
}

export function draftFromEvent(event: EditableEvent): EditDraft {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const sameDayEnd = midnight(end).getTime() === midnight(start).getTime() ? minutesOfDay(end) : DAY_MIN
  return {
    title: event.title,
    day: midnight(start),
    startMin: minutesOfDay(start),
    endMin: Math.max(sameDayEnd, minutesOfDay(start) + STEP_MIN),
    allDay: Boolean(event.all_day),
    anytime: isReminder(event) && event.has_due_date === false,
    place: {
      name: (event.location_name ?? '').trim(),
      address: (event.address ?? '').trim(),
      driveMinutes: event.enrichment?.drive_time_mins ?? null,
    },
  }
}

export function stepStart(draft: EditDraft, delta: number): EditDraft {
  const duration = draft.endMin - draft.startMin
  const startMin = clamp(draft.startMin + delta, 0, DAY_MIN - STEP_MIN)
  return { ...draft, startMin, endMin: Math.min(startMin + duration, DAY_MIN) }
}

export function stepEnd(draft: EditDraft, delta: number): EditDraft {
  return { ...draft, endMin: clamp(draft.endMin + delta, draft.startMin + STEP_MIN, DAY_MIN) }
}

export const setDay = (draft: EditDraft, day: Date): EditDraft => ({ ...draft, day: midnight(day) })
export const setAllDay = (draft: EditDraft, allDay: boolean): EditDraft => ({ ...draft, allDay })
export const setAnytime = (draft: EditDraft, anytime: boolean): EditDraft => ({ ...draft, anytime })
export const setTitle = (draft: EditDraft, title: string): EditDraft => ({ ...draft, title })
export const setPlace = (draft: EditDraft, place: DraftPlace): EditDraft => ({ ...draft, place })

export interface DayChip {
  date: Date
  /** "FRI" */
  weekday: string
  selected: boolean
}

/** Today and the next five days as chips, plus the draft's own day when it falls outside them. */
export function dayChips(now: Date, selected: Date): DayChip[] {
  const today = midnight(now)
  const chips: DayChip[] = []
  for (let i = 0; i < DAY_CHIPS; i += 1) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    chips.push({ date, weekday: weekdayShort(date), selected: date.getTime() === midnight(selected).getTime() })
  }
  if (!chips.some((c) => c.selected)) chips.push({ date: midnight(selected), weekday: weekdayShort(selected), selected: true })
  return chips
}

const weekdayShort = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()

export function draftChanges(event: EditableEvent, draft: EditDraft): DraftChange[] {
  const was = draftFromEvent(event)
  const changes: DraftChange[] = []
  if (draft.title.trim() !== was.title) changes.push({ field: 'title', was: was.title })
  if (draft.anytime !== was.anytime) {
    changes.push({ field: 'anytime', was: was.anytime ? 'Anytime' : `${dayLabel(was.day)} · ${timeLabel(was.startMin)}` })
    return changes.concat(placeChange(was, draft))
  }
  if (draft.day.getTime() !== was.day.getTime()) changes.push({ field: 'day', was: dayLabel(was.day) })
  if (draft.allDay !== was.allDay) changes.push({ field: 'allDay', was: was.allDay ? 'All day' : `${timeLabel(was.startMin)} – ${timeLabel(was.endMin)}` })
  if (!draft.allDay && !was.allDay) {
    if (draft.startMin !== was.startMin) changes.push({ field: 'start', was: timeLabel(was.startMin) })
    if (draft.endMin !== was.endMin) changes.push({ field: 'end', was: timeLabel(was.endMin) })
  }
  return changes.concat(placeChange(was, draft))
}

function placeChange(was: EditDraft, draft: EditDraft): DraftChange[] {
  const same = draft.place.name === was.place.name && draft.place.address === was.place.address
  return same ? [] : [{ field: 'place', was: was.place.name || was.place.address || 'No place' }]
}

function draftRange(draft: EditDraft): { start: Date; end: Date } {
  if (draft.allDay) {
    const end = new Date(draft.day)
    end.setDate(end.getDate() + 1)
    return { start: new Date(draft.day), end }
  }
  return { start: atMinutes(draft.day, draft.startMin), end: atMinutes(draft.day, draft.endMin) }
}

/** The event as it would be after saving, for the engine to preview (same rules as the save). */
export function previewEvent(event: EditableEvent, draft: EditDraft): EditableEvent {
  const changes = draftChanges(event, draft)
  if (changes.length === 0) return event
  const { start, end } = draftRange(draft)
  const timeMoved = changes.some((c) => c.field === 'day' || c.field === 'start' || c.field === 'end' || c.field === 'allDay')
  const placeMoved = changes.some((c) => c.field === 'place')
  const plan = event.plan_override?.transportation_plan as EventTransportationPlan | null | undefined
  const legs = timeMoved && !draft.allDay && plan?.legs ? reconcileTransportationLegTimes(plan, start, end) : plan
  const drive = placeMoved ? draft.place.driveMinutes : event.enrichment?.drive_time_mins ?? null
  const departure = draft.allDay ? null : timeMoved || placeMoved ? rescheduledDepartureIso(start, drive) : event.enrichment?.departure_time ?? null
  return {
    ...event,
    title: draft.title.trim() || event.title,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    all_day: draft.allDay,
    has_due_date: draft.anytime ? false : event.has_due_date,
    location_name: draft.place.name || null,
    address: draft.place.address || null,
    enrichment: { ...(event.enrichment ?? { departure_time: null }), drive_time_mins: drive, departure_time: departure },
    plan_override: event.plan_override && legs ? { ...event.plan_override, transportation_plan: legs as never } : event.plan_override,
  }
}

/** One sentence on what the engine recalculates, or null when nothing on the wall moves. */
export function consequenceLine(before: DayPlan, after: DayPlan, eventId: string, members: WallMember[]): string | null {
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? null
  const was = before.trips.find((t) => t.sourceId === eventId)
  const now = after.trips.find((t) => t.sourceId === eventId)
  if (was && !now) return 'No drive any more: it drops off the road.'
  if (!now?.leaveAt) return null
  const who = nameOf(now.driverId) ?? 'Whoever drives'
  if (!was?.leaveAt) return `${who} leaves at ${clockTime(now.leaveAt)}.`
  if (was.leaveAt.getTime() === now.leaveAt.getTime()) return null
  return `${who} leaves at ${clockTime(now.leaveAt)} instead of ${clockTime(was.leaveAt)}.`
}

/** The existing save paths to run, in order; empty when nothing changed. */
export function savePlanFor(event: EditableEvent, draft: EditDraft): SaveStep[] {
  const changes = draftChanges(event, draft)
  const has = (field: ChangeField) => changes.some((c) => c.field === field)
  const steps: SaveStep[] = []
  if (has('title') && draft.title.trim()) steps.push({ kind: 'title', title: draft.title.trim() })
  if (draft.anytime && has('anytime')) {
    steps.push({ kind: 'clearDueDate' })
  } else if (has('anytime') || has('day') || has('start') || has('end') || has('allDay')) {
    const { start, end } = draftRange(draft)
    steps.push({ kind: 'schedule', start, end, allDay: draft.allDay })
  }
  if (has('place')) {
    steps.push({
      kind: 'venue',
      venue: {
        name: draft.place.name,
        address: draft.place.address,
        ...(draft.place.driveMinutes != null ? { driveMinutes: draft.place.driveMinutes } : {}),
      },
    })
  }
  return steps
}
