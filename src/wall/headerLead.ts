import { formatWallClock } from './clock.ts'
import { countdown } from './header.ts'
import { selectNextMove, type NextMove } from './engine/nextMove.ts'
import type { DayPlan, Trip, WallMember } from './engine/types.ts'

// Who leads today's header (canvas 29e/29f; Jake, 2026-10-01): what's at home as well as what needs moving.
//   - A one-off appointment (not a routine) beats a routine run when it starts within 45 minutes of the run, even if
//     the run comes first, and keeps the header until it's over ("regular events should keep the header till
//     completed").
//   - A routine run is FYI when it's covered by someone other than a parent (the sitter): "the thing I don't really
//     have to worry about". Assigned to Jake or Kelly, or to nobody, it counts like anything else.
//   - Otherwise whatever is sooner leads. THEN lists the next three after the lead, in time order.

/** A one-off this close after a routine run takes the header from it. */
export const CLOSE_MS = 45 * 60_000
/** A run that matters takes the header back from an appointment in progress this close to leaving. */
export const LEAVE_SOON_MS = 15 * 60_000

/** A timed item at home or with no place (the plumber, a video call): no drive, no leave-by. */
export interface HomeItem {
  id: string
  title: string
  start: Date
  end: Date
  memberIds: string[]
}

export type HeaderLead =
  | { kind: 'move'; move: NextMove }
  | { kind: 'home'; item: HomeItem; now: boolean }

export interface ThenItem {
  key: string
  kind: 'move' | 'home'
  at: Date
  whoId: string | null
  title: string
  /** A routine run the sitter covers: FYI. */
  routine: boolean
  /** It comes before what leads the header (passed over for it): its time in brass. */
  before: boolean
  /** The trip or calendar item, to open. */
  sourceId: string
}

const departure = (t: Trip) => t.leaveAt ?? t.arriveAt

/** A routine run someone other than a parent covers. */
export function isFyi(trip: Trip, members: WallMember[]): boolean {
  if (trip.source !== 'routine' || !trip.driverId) return false
  return members.find((m) => m.id === trip.driverId)?.role !== 'parent'
}

/** Today's one-off timed appointments at home or with no place, not yet over (reminders are NEXT UP's). */
export function homeItems(plan: DayPlan | null, now: Date): HomeItem[] {
  if (!plan) return []
  const trips = new Set(plan.trips.map((t) => t.sourceId))
  const byId = new Map<string, HomeItem>()
  for (const [memberId, segments] of plan.lanes) {
    for (const s of segments) {
      if (s.kind === 'drive' || s.fromRoutine || s.work || s.chore || s.reminder || s.travel || s.placeStatus === 'away' || trips.has(s.sourceId)) continue
      if (s.end <= now) continue
      const seen = byId.get(s.sourceId)
      if (seen) {
        if (!seen.memberIds.includes(memberId)) seen.memberIds.push(memberId)
        continue
      }
      byId.set(s.sourceId, { id: s.sourceId, title: s.label, start: s.start, end: s.end, memberIds: [memberId] })
    }
  }
  return [...byId.values()].sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** What leads the header now, or null when nothing is left today. */
export function selectHeaderLead(plan: DayPlan | null, members: WallMember[], now: Date): HeaderLead | null {
  if (!plan) return null
  const move = selectNextMove(plan, now)
  const home = homeItems(plan, now)
  const t = now.getTime()
  const matters = move ? move.trips.some((trip) => !isFyi(trip, members)) : false
  const moveAt = move ? (move.status === 'en_route' ? t : departure(move.trips[0]).getTime()) : Infinity

  // An appointment under way keeps the header until it's over — unless a run that matters leaves within 15 minutes.
  const current = home.find((h) => h.start.getTime() <= t)
  if (current && !(move && matters && moveAt - t <= LEAVE_SOON_MS)) return { kind: 'home', item: current, now: true }

  const next = home.find((h) => h.start.getTime() > t)
  if (!move) return next ? { kind: 'home', item: next, now: false } : null
  if (!next) return { kind: 'move', move }
  const nextAt = next.start.getTime()
  if (nextAt <= moveAt) return { kind: 'home', item: next, now: false }
  // The run is first: a one-off close after it takes the header, unless the run is one Jake or Kelly has to make.
  if (!matters && nextAt - moveAt <= CLOSE_MS) return { kind: 'home', item: next, now: false }
  return { kind: 'move', move }
}

/** The next three after the lead, runs and home items together, in time order. */
export function thenItems(plan: DayPlan | null, members: WallMember[], lead: HeaderLead | null, now: Date, count = 3): ThenItem[] {
  if (!plan) return []
  const t = now.getTime()
  const leadTrips = new Set(lead?.kind === 'move' ? lead.move.trips.map((trip) => trip.id) : [])
  const leadAt = lead?.kind === 'move' ? departure(lead.move.trips[0]).getTime() : lead ? lead.item.start.getTime() : Infinity
  const items: ThenItem[] = []
  for (const trip of plan.trips) {
    const at = departure(trip)
    if (at.getTime() <= t || leadTrips.has(trip.id)) continue
    items.push({ key: `move:${trip.id}`, kind: 'move', at, whoId: trip.driverId, title: trip.title.split(':')[0].trim(), routine: isFyi(trip, members), before: at.getTime() < leadAt, sourceId: trip.sourceId })
  }
  for (const h of homeItems(plan, now)) {
    if (h.start.getTime() <= t || (lead?.kind === 'home' && lead.item.id === h.id)) continue
    items.push({ key: `home:${h.id}`, kind: 'home', at: h.start, whoId: h.memberIds[0] ?? null, title: h.title, routine: false, before: h.start.getTime() < leadAt, sourceId: h.id })
  }
  return items.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, count)
}

/** The header's words for something at home: "AT HOME · 3:15" / "AT HOME · NOW · UNTIL 4:15", who, and the hour. */
export function describeHomeLead(item: HomeItem, now: boolean, members: WallMember[], at: Date) {
  const clock = (d: Date) => formatWallClock(d).time
  const names = item.memberIds.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean) as string[]
  const minutes = Math.round((item.end.getTime() - item.start.getTime()) / 60_000)
  const length = minutes >= 90 ? `about ${Math.round(minutes / 60)} hours` : minutes >= 50 ? 'about an hour' : `${minutes} min`
  const left = Math.max(0, Math.round(((now ? item.end : item.start).getTime() - at.getTime()) / 60_000))
  return {
    eyebrow: now ? `AT HOME · NOW · UNTIL ${clock(item.end)}` : `AT HOME · ${clock(item.start)}`,
    whoId: item.memberIds[0] ?? null,
    initial: names[0]?.charAt(0) ?? '?',
    title: item.title,
    detail: [names.join(' & ') || null, now ? `until ${clock(item.end)}` : `${clock(item.start)} to ${clock(item.end)}`, length].filter(Boolean).join(' · '),
    ring: { ...countdown(left), ...(now ? { unit: `${countdown(left).unit} LEFT` } : {}), fraction: now ? Math.min(1, left / Math.max(1, minutes)) : Math.min(1, left / 60) },
  }
}
