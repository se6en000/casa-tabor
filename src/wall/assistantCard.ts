import type { DayPlan, LaneSegment, WallEvent, WallMember } from './engine/types'
import { clashLines, coverLines } from './clashes.ts'
import { reconcileTransportationLegTimes, rescheduledDepartureIso } from '../lib/eventMutations.ts'
import { NEW_EVENT_ID, withDriver, type EditableEvent } from './editing.ts'
import { driverChoices } from './people.ts'

// The assistant's card (design section 06, approved 2026-09-26): what an add or a change
// will do, told from the wall's own engine — where it lands in the person's day, when to
// leave, who's free to drive, what it clashes with — and what the latest turn just
// changed. Pure: the caller plans the day (`planDay`), so this is tested without the app.

export interface CardAction {
  tool: string
  args: Record<string, unknown>
}

export interface CardContext {
  events: WallEvent[]
  members: WallMember[]
  /** The wall's engine for one day, with these events. */
  planDay: (date: Date, events: WallEvent[]) => DayPlan | null
  /** Drive time to an add's place, once looked up (`route-eta`); null when unknown. */
  driveMinutes?: number | null
}

export interface AssistantCard {
  kind: 'add' | 'change'
  /** The event as it would be saved, for the Score's preview behind the band. */
  event: WallEvent
  eventId: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  /** "Tue, Sep 29 · 4:00 – 5:00 PM" */
  when: string
  /** A change that moves the time: what it was ("12:00 – 1:00 PM"). */
  before: string | null
  place: string | null
  /** The place's address when Casa found it before the yes; null when not known. */
  address: string | null
  /** Casa isn't sure which place (Jake, Oct 2: "Go for which one"): up to three to pick from on the card. */
  placeChoices: Array<{ name: string; address: string }>
  peopleIds: string[]
  /** What the latest turn changed on the card: "3:30 → 4:00", "place added", "Liv added". */
  justChanged: string[]
  /** The first person's day with the draft in it, for the lane preview. */
  lane: { memberId: string; segments: LaneSegment[] } | null
  /** "3:36", or null when the drive isn't known. */
  leaveBy: string | null
  /** "Bak Middle School" when it chains on from a pickup instead of leaving home. */
  leavesFrom: string | null
  /** Who can drive it, with the one chosen; null when there's no drive. */
  drivers: Array<{ memberId: string; name: string; note: string; chosen: boolean }> | null
  /** "Clashes with School (Liv)", or "Nothing else then for Emme and Owen". */
  touches: string[]
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const names = (v: unknown) => (Array.isArray(v) ? v.map((n) => String(n).trim()).filter(Boolean) : [])

function clock(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`
}
const meridiem = (d: Date) => (d.getHours() < 12 ? 'AM' : 'PM')

/** "4:00 – 5:00 PM", "11:30 AM – 1:00 PM". */
export function timeRange(start: Date, end: Date): string {
  return `${clock(start)}${meridiem(start) === meridiem(end) ? '' : ` ${meridiem(start)}`} – ${clock(end)} ${meridiem(end)}`
}

const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const idOf = (members: WallMember[], name: string) => members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null
const memberIds = (e: WallEvent) => (e.members ?? []).filter((m) => m.role !== 'driver').map((m) => m.family_member_id ?? m.family_member?.id).filter((id): id is string => Boolean(id))

/** The event the action would save, in the wall's own shape. */
function draftEvent(action: CardAction, ctx: CardContext): { event: EditableEvent; target: WallEvent | null } | null {
  const a = action.args
  if (action.tool === 'create_event') {
    const start = str(a.start)
    const end = str(a.end)
    if (!start || !end) return null
    const place = str(a.location) || null
    const people = names(a.members).map((n) => idOf(ctx.members, n)).filter((id): id is string => Boolean(id))
    return {
      target: null,
      event: {
        id: NEW_EVENT_ID,
        title: str(a.title) || 'New item',
        event_type: str(a.event_type) || 'event',
        all_day: a.all_day === true,
        start_time: start,
        end_time: end,
        location_name: place,
        address: str(a.address) || place,
        members: people.map((id, i) => ({ family_member_id: id, role: i === 0 ? 'primary' : 'attendee' })),
        // Leave-by by the app's rule (drive + buffer), as the edit sheet and a saved event have it.
        ...(place && ctx.driveMinutes != null ? { enrichment: { drive_time_mins: ctx.driveMinutes, departure_time: a.all_day === true ? null : rescheduledDepartureIso(new Date(start), ctx.driveMinutes) } } : {}),
      } as EditableEvent,
    }
  }
  if (action.tool === 'update_event') {
    const target = ctx.events.find((e) => e.id === a.id)
    if (!target) return null
    const next: EditableEvent = { ...(target as EditableEvent) }
    if (str(a.title)) next.title = str(a.title)
    if (str(a.start)) next.start_time = str(a.start)
    if (str(a.end)) next.end_time = str(a.end)
    if (str(a.location)) {
      next.location_name = str(a.location)
      next.address = str(a.location)
    }
    const add = names(a.members_add).map((n) => idOf(ctx.members, n)).filter((id): id is string => Boolean(id))
    const remove = new Set(names(a.members_remove).map((n) => idOf(ctx.members, n)))
    next.members = [
      ...(target.members ?? []).filter((m) => !remove.has(m.family_member_id ?? m.family_member?.id ?? null)),
      ...add.filter((id) => !memberIds(target).includes(id)).map((id) => ({ family_member_id: id, role: 'attendee' })),
    ]
    // The drive follows the change, by the same rules as saving (editing.ts `previewEvent`).
    let plan = target.plan_override?.transportation_plan as Parameters<typeof reconcileTransportationLegTimes>[0] | null | undefined
    const driver = str(a.driver_name)
    if (driver) plan = withDriver(target as EditableEvent, plan as never, idOf(ctx.members, driver), driver) as never
    const start = new Date(next.start_time)
    const timeMoved = start.getTime() !== new Date(target.start_time).getTime() || new Date(next.end_time).getTime() !== new Date(target.end_time).getTime()
    const placeMoved = Boolean(str(a.location)) && str(a.location) !== (target.location_name ?? '')
    if (timeMoved && !next.all_day && plan?.legs) plan = reconcileTransportationLegTimes(plan, start, new Date(next.end_time))
    if (plan !== target.plan_override?.transportation_plan) next.plan_override = { ...(target.plan_override ?? {}), transportation_plan: plan } as WallEvent['plan_override']
    if (timeMoved || placeMoved) {
      const drive = placeMoved ? ctx.driveMinutes ?? null : target.enrichment?.drive_time_mins ?? null
      next.enrichment = { ...(target.enrichment ?? { departure_time: null }), drive_time_mins: drive, departure_time: next.all_day ? null : rescheduledDepartureIso(start, drive) }
    }
    return { event: next, target }
  }
  return null
}

/** What the latest turn changed, against the card it replaced. */
function whatChanged(previous: CardAction | null, action: CardAction, members: WallMember[]): string[] {
  if (!previous || previous.tool !== action.tool || (previous.args.id ?? null) !== (action.args.id ?? null)) return []
  const p = previous.args
  const a = action.args
  const out: string[] = []
  const ps = str(p.start) ? new Date(str(p.start)) : null
  const as = str(a.start) ? new Date(str(a.start)) : null
  if (ps && as && ps.getTime() !== as.getTime()) {
    const sameDay = ps.toDateString() === as.toDateString()
    out.push(sameDay ? `${clock(ps)} → ${clock(as)}` : `${dayLabel(ps)} ${clock(ps)} → ${dayLabel(as)} ${clock(as)}`)
  }
  if (str(a.location) && str(a.location) !== str(p.location)) out.push(str(p.location) ? 'new place' : 'place added')
  const before = new Set([...names(p.members), ...names(p.members_add)].map((n) => n.toLowerCase()))
  for (const n of [...names(a.members), ...names(a.members_add)]) {
    if (!before.has(n.toLowerCase())) out.push(`${members.find((m) => m.name.toLowerCase() === n.toLowerCase())?.name ?? n} added`)
  }
  if (str(a.title) && str(p.title) && str(a.title) !== str(p.title)) out.push('renamed')
  if (str(a.driver_name) && str(a.driver_name) !== str(p.driver_name)) out.push(`${str(a.driver_name)} drives`)
  return out
}

export function assistantCard(action: CardAction | null, previous: CardAction | null, ctx: CardContext): AssistantCard | null {
  if (!action) return null
  const built = draftEvent(action, ctx)
  if (!built) return null
  const { event, target } = built
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null
  const allDay = event.all_day === true
  const day = new Date(start)
  day.setHours(0, 0, 0, 0)

  // The day as the wall would plan it with this saved: the target replaced, the add added.
  const others = ctx.events.filter((e) => e.id !== event.id)
  const plan = ctx.planDay(day, [...others, event])
  const people = memberIds(event)
  const trip = plan?.trips.find((t) => t.source === 'event' && t.sourceId === event.id) ?? null

  const lanePerson = people[0] ?? null
  const lane = plan && lanePerson ? { memberId: lanePerson, segments: plan.lanes.get(lanePerson) ?? [] } : null

  // What else is going on for these people while it happens.
  // A routine isn't a clash; someone else having them then is a question to settle (Oct 7).
  const clashes = allDay ? [] : [...clashLines(plan, people, start, end, ctx.members, event.id), ...coverLines(plan, people, start, end, ctx.members)]
  const nameList = people.map((id) => ctx.members.find((m) => m.id === id)?.name).filter(Boolean) as string[]
  const touches = clashes.length > 0
    ? clashes
    : nameList.length > 0 && !allDay
      ? [`Nothing else then for ${nameList.length > 1 ? `${nameList.slice(0, -1).join(', ')} and ${nameList.at(-1)}` : nameList[0]}`]
      : []

  const chainedFrom = trip?.chainedFrom ? plan?.trips.find((t) => t.id === trip.chainedFrom) : null
  const chosen = str(action.args.driver_name).toLowerCase()
  const drivers = plan && trip
    ? driverChoices(plan, ctx.members, trip, event.id).map((c) => ({ ...c, chosen: chosen ? c.name.toLowerCase() === chosen : c.memberId === trip.driverId }))
    : null

  const movedTime = target != null && (new Date(target.start_time).getTime() !== start.getTime() || new Date(target.end_time).getTime() !== end.getTime())
  return {
    kind: action.tool === 'create_event' ? 'add' : 'change',
    event,
    eventId: event.id,
    title: event.title,
    start,
    end,
    allDay,
    when: `${dayLabel(start)} · ${allDay ? 'all day' : timeRange(start, end)}`,
    before: movedTime && target
      ? `${new Date(target.start_time).toDateString() === start.toDateString() ? '' : `${dayLabel(new Date(target.start_time))} · `}${timeRange(new Date(target.start_time), new Date(target.end_time))}`
      : null,
    place: (event.location_name || event.address || '').trim() || null,
    address: action.tool === 'create_event' ? str(action.args.address) || null : null,
    placeChoices: Array.isArray(action.args.place_choices)
      ? (action.args.place_choices as Array<Record<string, unknown>>).map((c) => ({ name: str(c?.name), address: str(c?.address) })).filter((c) => c.name && c.address)
      : [],
    peopleIds: people,
    justChanged: whatChanged(previous, action, ctx.members),
    lane,
    leaveBy: trip?.leaveAt ? clock(trip.leaveAt) : null,
    leavesFrom: chainedFrom ? chainedFrom.destination.name || null : null,
    drivers,
    touches,
  }
}

/** The previous card this one replaced: the latest earlier action of the same kind and target. */
export function replacedAction<T extends { toolAction?: { tool: string; args: Record<string, unknown>; status?: string } | null }>(messages: T[], current: T | null): CardAction | null {
  if (!current?.toolAction) return null
  const i = messages.lastIndexOf(current)
  for (let j = i - 1; j >= 0; j--) {
    const t = messages[j].toolAction
    if (t && t.tool === current.toolAction.tool && (t.args.id ?? null) === (current.toolAction.args.id ?? null)) return { tool: t.tool, args: t.args }
  }
  return null
}


export interface LaneView {
  /** The window, in hours of the day. */
  from: number
  to: number
  ticks: number[]
  /** Positions in percent of the lane's width. */
  blocks: Array<{ kind: LaneSegment['kind']; label: string; left: number; width: number; draft: boolean }>
  label: string
  labelLeft: number
  /** Near the end of the day the name goes before the draft instead (right edge, in percent). */
  labelBefore: boolean
}

/** "Softball" from "Softball: Huskies @ RPB Cascade". */
function shortName(title: string): string {
  const head = title.split(/[:·(—]/)[0].trim()
  return head.split(' ').slice(0, 3).join(' ')
}

/** Where the draft lands in the person's day, laid out for the card's lane preview (board 06a). */
export function laneView(card: AssistantCard): LaneView | null {
  if (!card.lane || card.allDay) return null
  const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60
  const segments = card.lane.segments.filter((s) => s.end > s.start)
  const labelAt = new Date(Math.max(card.end.getTime(), ...segments.filter((s) => s.sourceId === card.eventId).map((s) => s.end.getTime())))
  const hours = [...segments.flatMap((s) => [s.start, s.end]), card.start, card.end].map(hourOf)
  const from = Math.max(0, Math.min(8, Math.floor(Math.min(...hours))))
  // 8 AM – 6 PM at least, widened to take in the day, with room after the draft for its name.
  const to = Math.min(24, Math.max(18, Math.ceil(Math.max(...hours)), Math.ceil(hourOf(labelAt)) + 3))
  const at = (d: Date) => ((hourOf(d) - from) / (to - from)) * 100
  const span = (a: Date, b: Date) => ((b.getTime() - a.getTime()) / 3_600_000 / (to - from)) * 100
  const blocks = [
    ...segments.filter((s) => s.sourceId !== card.eventId).map((s) => ({ kind: s.kind, label: s.kind === 'drive' ? '' : s.label, left: at(s.start), width: span(s.start, s.end), draft: false })),
    ...segments.filter((s) => s.sourceId === card.eventId && s.kind === 'drive').map((s) => ({ kind: s.kind, label: '', left: at(s.start), width: span(s.start, s.end), draft: true })),
    { kind: 'activity' as const, label: card.title, left: at(card.start), width: span(card.start, card.end), draft: true },
  ]
  const labelBefore = hourOf(labelAt) > to - 2.5
  return {
    from,
    to,
    ticks: Array.from({ length: Math.floor((to - from) / 2) + 1 }, (_, i) => from + i * 2),
    blocks,
    label: `${clock(card.start)} ${shortName(card.title)}`,
    labelLeft: labelBefore ? at(card.start) : at(labelAt),
    labelBefore,
  }
}
