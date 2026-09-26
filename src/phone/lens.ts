import type { DayPlan, Trip, WallEvent, WallMember } from '../wall/engine/types'
import { clockTime, placeName } from '../wall/header.ts'
import { packingGroups, type WallChecklistItem } from '../wall/packing.ts'
import { celebrationHonorees } from '../wall/surprise.ts'
import { isRepeating } from '../wall/editing.ts'

// The phone's "Me" screen (board 05a): one person's lens on the same day plan the
// wall draws. Pure, so it's tested without rendering or a database.

export interface PhoneMove {
  tripIds: string[]
  /** Where to: "Palm Beach Public". */
  title: string
  /** "7:25" — shown as "Leave by 7:25" (Jake's note on 05a). */
  leaveBy: string | null
  /** "Drop off Emme & Owen". */
  summary: string
  travelerIds: string[]
  departed: boolean
}

export interface MeView {
  next: PhoneMove | null
  /** My other moves today, after the next one. */
  moves: PhoneMove[]
  /** Trips someone else has covered ("Kelly · 7:42 · Drop off Liv"). */
  covered: Array<{ driver: string; when: string; what: string }>
  /** Prep kept from someone (a celebration's gift and card), never on the wall or their phone. */
  hidden: Array<{ from: string; label: string; eventId: string; itemId: string }>
  /** My own reminders: on my phone, never on the wall. */
  justYours: Array<{ id: string; title: string; at: Date }>
}

const upcoming = (trip: Trip, now: Date) => (trip.homeAt ?? trip.arriveAt).getTime() > now.getTime()

function move(trip: Trip): PhoneMove {
  return {
    tripIds: [trip.id],
    title: placeName(trip),
    leaveBy: trip.leaveAt ? clockTime(trip.leaveAt) : null,
    summary: trip.onward ? `${trip.title}, then on to ${trip.onward.place}` : trip.title,
    travelerIds: trip.travelerIds,
    departed: Boolean(trip.departedAt),
  }
}

export function meView(input: { viewerId: string; plan: DayPlan | null; members: WallMember[]; events: WallEvent[]; checklist: WallChecklistItem[]; now: Date }): MeView {
  const { viewerId, plan, members, events, checklist, now } = input
  if (!plan) return { next: null, moves: [], covered: [], hidden: [], justYours: [] }
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Someone'
  const byLeave = (a: Trip, b: Trip) => (a.leaveAt ?? a.arriveAt).getTime() - (b.leaveAt ?? b.arriveAt).getTime()

  const mine = plan.trips.filter((t) => t.driverId === viewerId && upcoming(t, now)).sort(byLeave).map(move)
  const covered = plan.trips
    .filter((t) => t.driverId && t.driverId !== viewerId && upcoming(t, now))
    .sort(byLeave)
    .map((t) => ({ driver: nameOf(t.driverId), when: clockTime(t.leaveAt ?? t.arriveAt), what: t.title }))

  // A celebration's prep, for everyone but the person being celebrated.
  const titleOf = new Map(events.map((e) => [e.id, e.title]))
  const hidden = packingGroups(plan, checklist).groups.flatMap((g) => {
    const honorees = celebrationHonorees(titleOf.get(g.eventId) ?? '', members)
    if (honorees.length === 0 || honorees.includes(viewerId)) return []
    const from = honorees.map(nameOf).join(' & ')
    return g.items.filter((i) => !i.checked).map((i) => ({ from, label: i.label, eventId: g.eventId, itemId: i.id }))
  })

  const dayStart = new Date(plan.date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  const justYours = events
    .filter((e) => (e as WallEvent & { event_type?: string | null }).event_type === 'reminder')
    .filter((e) => (e.members ?? []).some((m) => (m.family_member_id ?? m.family_member?.id) === viewerId && m.role === 'primary'))
    .map((e) => ({ id: e.id, title: e.title, at: new Date(e.start_time) }))
    .filter((r) => r.at >= dayStart && r.at < dayEnd)
    .sort((a, b) => a.at.getTime() - b.at.getTime())

  return { next: mine[0] ?? null, moves: mine.slice(1), covered, hidden, justYours }
}

export interface FamilyItem {
  id: string
  /** "12:30" */
  time: string
  at: Date
  title: string
  /** "Ferrin Park Field 1 · Jake drives", "until 3:30", "At home". */
  sub: string
  /** Who is in it, in lane order. */
  people: string[]
}

/**
 * Board 05b: the day as one list — each calendar item once (school as one quiet line,
 * not its runs), when it starts, where, who drives, and who is in it. `filterId` keeps
 * only what that person is in.
 */
export function familyItems(plan: DayPlan | null, members: WallMember[], filterId: string | null): FamilyItem[] {
  if (!plan) return []
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? null
  const order = (ids: string[]) => members.map((m) => m.id).filter((id) => ids.includes(id))
  const tripFor = new Map(plan.trips.filter((t) => t.source === 'event').map((t) => [t.sourceId, t]))
  const items = new Map<string, FamilyItem>()
  for (const [memberId, segments] of plan.lanes) {
    for (const s of segments) {
      if (s.kind === 'drive') continue
      // Children at the same place for the same hours (two school routines) are one line.
      const key = s.kind === 'at_place' ? `place|${s.label}|${s.start.getTime()}|${s.end.getTime()}` : s.sourceId
      const existing = items.get(key)
      if (existing) {
        if (!existing.people.includes(memberId)) existing.people = order([...existing.people, memberId])
        continue
      }
      const trip = tripFor.get(s.sourceId)
      const sub = s.kind === 'at_place'
        ? `until ${clockTime(s.end)}`
        : trip
          ? `${placeName(trip)} · ${trip.driverId ? `${nameOf(trip.driverId)} drives` : 'needs a driver'}`
          : s.placeStatus === 'home' ? 'At home' : ''
      items.set(key, { id: s.sourceId, time: clockTime(s.start), at: s.start, title: s.label, sub, people: [memberId] })
    }
  }
  // An outing nobody is listed for yet still shows (it needs someone).
  for (const trip of tripFor.values()) {
    if (items.has(trip.sourceId)) continue
    items.set(trip.sourceId, {
      id: trip.sourceId, time: clockTime(trip.arriveAt), at: trip.arriveAt, title: trip.title,
      sub: `${placeName(trip)} · ${trip.driverId ? `${nameOf(trip.driverId)} drives` : 'needs a driver'}`,
      people: order([...trip.travelerIds, ...(trip.driverId ? [trip.driverId] : [])]),
    })
  }
  // All-day items head the day; one for nobody in particular is for everyone.
  const allDay: FamilyItem[] = plan.allDay.map((a) => ({
    id: a.sourceId, time: 'All day', at: plan.date, title: a.title, sub: '', people: order(a.memberIds),
  }))
  const timed = [...items.values()].sort((a, b) => a.at.getTime() - b.at.getTime() || a.title.localeCompare(b.title))
  const mine = (i: FamilyItem) => !filterId || i.people.includes(filterId)
  return [...allDay.filter((i) => mine(i) || i.people.length === 0), ...timed.filter(mine)]
}

export interface EventView {
  event: WallEvent | null
  /** "SAT · 12:30 – 2:30 PM", "SAT · ALL DAY", a reminder: "SAT · 7:00 PM". */
  when: string
  place: { name: string; address: string | null; driveMinutes: number | null }
  /** Who's going (not a driver-only member), in lane order. */
  going: string[]
  trip: Trip | null
  /** Its get & pack list; empty for the person it celebrates (surprise-safe). */
  prep: WallChecklistItem[]
  repeating: boolean
}

/** Board 05d: one event as the phone shows it to this viewer. */
export function eventView(input: { eventId: string; plan: DayPlan | null; events: WallEvent[]; members: WallMember[]; viewerId: string; checklist: WallChecklistItem[] }): EventView {
  const { eventId, plan, events, members, viewerId, checklist } = input
  const event = events.find((e) => e.id === eventId) ?? null
  const empty: EventView = { event: null, when: '', place: { name: '', address: null, driveMinutes: null }, going: [], trip: null, prep: [], repeating: false }
  if (!event) return empty
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const day = start.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const meridiem = (d: Date) => (d.getHours() < 12 ? 'AM' : 'PM')
  const reminder = (event as WallEvent & { event_type?: string | null }).event_type === 'reminder'
  const when = event.all_day
    ? `${day} · ALL DAY`
    : reminder
      ? `${day} · ${clockTime(start)} ${meridiem(start)}`
      : `${day} · ${clockTime(start)}${meridiem(start) === meridiem(end) ? '' : ` ${meridiem(start)}`} – ${clockTime(end)} ${meridiem(end)}`
  const trip = plan?.trips.find((t) => t.source === 'event' && t.sourceId === eventId) ?? null
  const raw = (event.location_name || event.address || '').trim()
  const going = members
    .map((m) => m.id)
    .filter((id) => (event.members ?? []).some((m) => (m.family_member_id ?? m.family_member?.id) === id && m.role !== 'driver'))
  const honorees = celebrationHonorees(event.title, members)
  const prep = honorees.includes(viewerId)
    ? []
    : checklist.filter((i) => i.event_id === eventId).sort((a, b) => a.sort_order - b.sort_order)
  return {
    event,
    when,
    place: { name: raw.split(',')[0].trim(), address: event.address ?? null, driveMinutes: trip?.driveMinutes ?? null },
    going,
    trip,
    prep,
    repeating: isRepeating(event),
  }
}
