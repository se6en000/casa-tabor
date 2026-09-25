import { DEFAULT_HOME_ADDRESS, reconcileTransportationLegTimes, rescheduledDepartureIso } from '../lib/eventMutations.ts'
import { createDefaultTransportationPlan, type EventTransportationPlan } from '../lib/eventTransportation.ts'
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
  /** Member ids going (not counting a driver-only member). */
  going: string[]
  /** Who drives (stored on the trip plan); null = nobody yet. */
  driverId: string | null
}

export type ChangeField = 'title' | 'day' | 'start' | 'end' | 'allDay' | 'anytime' | 'place' | 'going' | 'driver'

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
  | { kind: 'people'; add: string[]; remove: string[] }
  | { kind: 'driver'; driverId: string | null }

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
    going: goingIds(event),
    driverId: event.plan_override?.transportation_plan?.legs?.find((l) => l.driverId)?.driverId
      ?? memberRefs(event).find((m) => m.role === 'driver')?.id
      ?? null,
  }
}

function memberRefs(event: EditableEvent): Array<{ id: string; role: string | null }> {
  return (event.members ?? [])
    .map((m) => ({ id: m.family_member_id ?? m.family_member?.id ?? null, role: m.role ?? null }))
    .filter((m): m is { id: string; role: string | null } => Boolean(m.id))
}

function goingIds(event: EditableEvent): string[] {
  return [...new Set(memberRefs(event).filter((m) => m.role !== 'driver').map((m) => m.id))]
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

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
export const setGoing = (draft: EditDraft, going: string[]): EditDraft => ({ ...draft, going: [...new Set(going)] })
export const setDriver = (draft: EditDraft, driverId: string | null): EditDraft => ({ ...draft, driverId })

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

export function draftChanges(event: EditableEvent, draft: EditDraft, members: Array<{ id: string; name: string }> = []): DraftChange[] {
  const was = draftFromEvent(event)
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? ((event.members ?? []).find((m) => (m.family_member_id ?? m.family_member?.id) === id)?.family_member as { name?: string } | undefined)?.name ?? id
  const changes: DraftChange[] = []
  if (draft.title.trim() !== was.title) changes.push({ field: 'title', was: was.title })
  if (draft.anytime !== was.anytime) {
    changes.push({ field: 'anytime', was: was.anytime ? 'Anytime' : `${dayLabel(was.day)} · ${timeLabel(was.startMin)}` })
    return changes.concat(placeChange(was, draft)).concat(peopleChanges(was, draft, nameOf))
  }
  if (draft.day.getTime() !== was.day.getTime()) changes.push({ field: 'day', was: dayLabel(was.day) })
  if (draft.allDay !== was.allDay) changes.push({ field: 'allDay', was: was.allDay ? 'All day' : `${timeLabel(was.startMin)} – ${timeLabel(was.endMin)}` })
  if (!draft.allDay && !was.allDay) {
    if (draft.startMin !== was.startMin) changes.push({ field: 'start', was: timeLabel(was.startMin) })
    if (draft.endMin !== was.endMin) changes.push({ field: 'end', was: timeLabel(was.endMin) })
  }
  return changes.concat(placeChange(was, draft)).concat(peopleChanges(was, draft, nameOf))
}

function peopleChanges(was: EditDraft, draft: EditDraft, nameOf: (id: string) => string): DraftChange[] {
  const out: DraftChange[] = []
  if (!sameSet(was.going, draft.going)) out.push({ field: 'going', was: was.going.map(nameOf).join(' & ') || 'Nobody' })
  if (was.driverId !== draft.driverId) out.push({ field: 'driver', was: was.driverId ? nameOf(was.driverId) : 'Nobody yet' })
  return out
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
  const goingMoved = changes.some((c) => c.field === 'going')
  const driverMoved = changes.some((c) => c.field === 'driver')
  let plan = event.plan_override?.transportation_plan as EventTransportationPlan | null | undefined
  if (driverMoved) plan = withDriver(event, plan, draft.driverId)
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
    members: goingMoved ? previewMembers(event, draft.going) : event.members,
    plan_override: legs ? { ...(event.plan_override ?? {}), transportation_plan: legs as never } : event.plan_override,
  }
}

/** The trip plan with a new driver on every leg; a plan is created (as the app does) when there isn't one. */
export function withDriver(event: EditableEvent, plan: EventTransportationPlan | null | undefined, driverId: string | null, driverName = ''): EventTransportationPlan {
  if (plan?.legs?.length) {
    return { ...plan, source: 'manual', legs: plan.legs.map((leg) => ({ ...leg, driverId, driverName: driverId ? driverName : '' })) }
  }
  return createDefaultTransportationPlan(event as never, DEFAULT_HOME_ADDRESS, driverId ? { id: driverId, name: driverName } : null)
}

function previewMembers(event: EditableEvent, going: string[]): EditableEvent['members'] {
  const existing = event.members ?? []
  const idOf = (m: NonNullable<EditableEvent['members']>[number]) => m.family_member_id ?? m.family_member?.id ?? null
  const kept = existing.filter((m) => m.role === 'driver' || going.includes(idOf(m) ?? ''))
  const added = going.filter((id) => !existing.some((m) => idOf(m) === id)).map((id) => ({ family_member_id: id, role: 'attendee' }))
  return [...kept, ...added]
}

/** One sentence on what the engine recalculates, or null when nothing on the wall moves. */
export function consequenceLine(before: DayPlan, after: DayPlan, eventId: string, members: WallMember[]): string | null {
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? null
  const attending = (plan: DayPlan) =>
    [...plan.lanes].filter(([, segs]) => segs.some((s) => s.sourceId === eventId && s.kind === 'activity')).map(([id]) => id)
  const goingBefore = attending(before)
  const goingAfter = attending(after)
  const parts: string[] = []
  const added = goingAfter.filter((id) => !goingBefore.includes(id)).map(nameOf).filter(Boolean)
  const removed = goingBefore.filter((id) => !goingAfter.includes(id)).map(nameOf).filter(Boolean)
  if (added.length) parts.push(`${added.join(' & ')} ${added.length > 1 ? 'go' : 'goes'} too.`)
  if (removed.length) parts.push(`${removed.join(' & ')} ${removed.length > 1 ? "don't" : "doesn't"} go any more.`)

  const was = before.trips.find((t) => t.sourceId === eventId)
  const now = after.trips.find((t) => t.sourceId === eventId)
  if (was && !now) parts.push('No drive any more: it drops off the road.')
  else if (now) {
    const leaving = now.leaveAt ? `, leaving at ${clockTime(now.leaveAt)}` : ''
    if (was && was.driverId !== now.driverId) {
      if (!now.driverId) parts.push('Nobody is driving yet.')
      else parts.push(was.driverId ? `${nameOf(now.driverId)} drives instead of ${nameOf(was.driverId)}${leaving}.` : `${nameOf(now.driverId)} drives${leaving}.`)
    } else if (now.leaveAt && (!was?.leaveAt || was.leaveAt.getTime() !== now.leaveAt.getTime())) {
      const who = nameOf(now.driverId) ?? 'Whoever drives'
      parts.push(was?.leaveAt ? `${who} leaves at ${clockTime(now.leaveAt)} instead of ${clockTime(was.leaveAt)}.` : `${who} leaves at ${clockTime(now.leaveAt)}.`)
    }
  }
  return parts.length > 0 ? parts.join(' ') : null
}

/** The existing save paths to run, in order; empty when nothing changed. */
export function savePlanFor(event: EditableEvent, draft: EditDraft): SaveStep[] {
  const changes = draftChanges(event, draft)
  const has = (field: ChangeField) => changes.some((c) => c.field === field)
  const steps: SaveStep[] = []
  if (has('title') && draft.title.trim()) steps.push({ kind: 'title', title: draft.title.trim() })
  if (has('going')) {
    const was = draftFromEvent(event).going
    steps.push({ kind: 'people', add: draft.going.filter((id) => !was.includes(id)), remove: was.filter((id) => !draft.going.includes(id)) })
  }
  if (has('driver')) steps.push({ kind: 'driver', driverId: draft.driverId })
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
