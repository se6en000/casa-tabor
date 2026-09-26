import { formatWallClock } from './clock.ts'
import type { DayPlan, LaneSegment, PlaceStatus, Trip, WallMember } from './engine/types'
import { selectLaneMembers } from './lanes.ts'
import { TIMELINE_WIDTH, isOnTimeline, xForTime } from './timeline.ts'

// Turns a DayPlan into what the Score draws: one lane per person, blocks placed
// on the 7 AM–9 PM timeline, driver initials on school bars, and the
// "everyone home by" marker. Pure, so it's tested without rendering.

export type ScoreBlockKind = 'place' | 'activity' | 'drive' | 'drive_unassigned'

export interface ScoreBlock {
  key: string
  kind: ScoreBlockKind
  sourceId: string
  x: number
  width: number
  /** Shown inside a place bar, or above any other block; null when it would collide. */
  label: string | null
  /** How wide a label above the block may run before the next one starts (truncated past it); null = no limit. */
  labelMaxWidth: number | null
  /** Whose color: the lane's person, or the driver for a driving leg. */
  pigmentIndex: number
  placeStatus: PlaceStatus
}

/** A driver's initial on a school bar: drop-off at the start, pickup at the end. */
export interface ScoreMonogram {
  key: string
  x: number
  initial: string
  /** null when nobody is assigned to drive. */
  pigmentIndex: number | null
}

export interface ScoreNote {
  key: string
  x: number
  text: string
}

export interface ScoreLane {
  member: WallMember
  pigmentIndex: number
  status: string
  blocks: ScoreBlock[]
  monograms: ScoreMonogram[]
  notes: ScoreNote[]
}

export interface Score {
  lanes: ScoreLane[]
  /**
   * The brass line when the last person is home. `flip`: late in the day there's no room to
   * the right, so the words read to the left of the line. `laneIndex`: the lowest lane where
   * the words cover no block (the bottom lane unless something is there).
   */
  everyoneHomeBy: { x: number; label: string; flip: boolean; laneIndex: number } | null
  /** All-day items (a birthday, "no school"): context for the day, drawn as one row under the hours, not in time. */
  allDay: Array<{ sourceId: string; title: string; people: Array<{ id: string; initial: string; pigmentIndex: number | null }> }>
}

const MIN_BLOCK_WIDTH = 8
// A label above a block gets the room up to the next label; with less than this it's dropped.
const MIN_LABEL_WIDTH = 72
const LABEL_GAP = 16
// Room a pickup note ("Giselle · 3:30") needs to the right of the pickup initial.
const NOTE_WIDTH = 170
// Room "Everyone home by 9:00" needs beside its line.
const HOME_LABEL_WIDTH = 320

const clockTime = (d: Date) => formatWallClock(d).time
const overlapsTimeline = (start: Date, end: Date) =>
  isOnTimeline(start) || isOnTimeline(end) || xForTime(start) < xForTime(end)

function span(start: Date, end: Date): { x: number; width: number } | null {
  if (!overlapsTimeline(start, end)) return null
  const x = xForTime(start)
  const width = xForTime(end) - x
  if (width <= 0 && !isOnTimeline(start)) return null
  return { x, width: Math.max(width, MIN_BLOCK_WIDTH) }
}

/** Colors follow the person (family order), not the row, so lanes appearing never recolor anyone. */
export function pigmentIndexes(members: WallMember[]): Map<string, number> {
  const ordered = [...members].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name))
  return new Map(ordered.map((m, i) => [m.id, i]))
}

function laneStatus(memberId: string, segments: LaneSegment[], trips: Trip[], now: Date, nameOf: (id: string | null) => string | null): string {
  const t = now.getTime()
  const current = segments.filter((s) => s.start.getTime() <= t && t < s.end.getTime())
  const drive = current.find((s) => s.kind === 'drive')
  if (drive) {
    const trip = trips.find((x) => x.id === drive.tripId)
    if (drive.driverId === memberId && trip?.homeAt) return `Driving · back by ${clockTime(trip.homeAt)}`
    const place = segments.find((s) => s.kind === 'at_place' && s.sourceId === drive.sourceId)
    const where = place?.label ?? trip?.destination.name.split(',')[0]
    if (drive.driverId !== memberId && where && trip?.kind !== 'pickup') return `Riding to ${where}`
    return 'On the road'
  }
  // Where someone is: the place, like school ("Bak Middle School · until 3:30").
  const out = current.find((s) => s.kind === 'activity' && s.placeStatus === 'away')
  if (out) {
    const place = trips.find((t) => t.sourceId === out.sourceId)?.destination.name.split(',')[0].trim()
    return `${place || out.label} · until ${clockTime(out.end)}`
  }
  const here = current.find((s) => s.kind === 'at_place')
  if (here) return `${here.label} · until ${clockTime(here.end)}`
  const doing = current.find((s) => s.kind === 'activity')
  if (doing) return `${doing.placeStatus === 'home' ? 'Home · ' : ''}${doing.label} · until ${clockTime(doing.end)}`

  const nextLeave = trips
    .filter((trip) => trip.leaveAt && trip.leaveAt.getTime() > t && (trip.driverId === memberId || trip.travelerIds.includes(memberId)))
    .sort((a, b) => a.leaveAt!.getTime() - b.leaveAt!.getTime())[0]
  if (!nextLeave?.leaveAt) {
    // Collected and driven home today (per the plan), and/or something still to come.
    const homeAt = trips
      .filter((trip) => trip.kind === 'pickup' && trip.travelerIds.includes(memberId) && trip.homeAt && trip.homeAt.getTime() <= t)
      .map((trip) => trip.homeAt!)
      .sort((a, b) => b.getTime() - a.getTime())[0]
    const later = segments.find((s) => s.kind === 'activity' && s.start.getTime() > t)
    const upNext = later ? `${later.label} · ${clockTime(later.start)}` : null
    if (homeAt) return upNext ? `Home · ${upNext}` : `Home since ${clockTime(homeAt)}`
    return upNext ?? ''
  }
  const leaves = `Leaves at ${clockTime(nextLeave.leaveAt)}`
  if (!nextLeave.driverId) return `Needs a driver · leaves ${clockTime(nextLeave.leaveAt)}`
  // A pickup's travelers are waiting somewhere else, not leaving home.
  if (nextLeave.driverId === memberId) return leaves
  return nextLeave.kind === 'pickup' ? '' : `${leaves} with ${nameOf(nextLeave.driverId)}`
  return ''
}

export function buildScore(plan: DayPlan, members: WallMember[], now: Date): Score {
  const pigments = pigmentIndexes(members)
  const pigmentFor = (id: string | null | undefined) => (id != null ? pigments.get(id) ?? null : null)
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? null

  const lanes: ScoreLane[] = selectLaneMembers(members, plan.activeMemberIds).map((member) => {
    const segments = plan.lanes.get(member.id) ?? []
    const own = pigmentFor(member.id) ?? 0
    const blocks: ScoreBlock[] = []
    const monograms: ScoreMonogram[] = []
    const notes: ScoreNote[] = []
    const placeSources = new Set(segments.filter((s) => s.kind === 'at_place').map((s) => s.sourceId))
    const activitySources = new Set(segments.filter((s) => s.kind === 'activity').map((s) => s.sourceId))
    const labelledTrips = new Set<string>()

    segments.forEach((segment, i) => {
      const at = span(segment.start, segment.end)
      if (!at) return
      const key = `${segment.kind}:${segment.sourceId}:${i}`

      if (segment.kind === 'at_place') {
        blocks.push({ key, kind: 'place', sourceId: segment.sourceId, ...at, label: segment.label, labelMaxWidth: null, pigmentIndex: own, placeStatus: segment.placeStatus })
        for (const kind of ['dropoff', 'pickup'] as const) {
          const edge = kind === 'dropoff' ? segment.start : segment.end
          const trip = plan.trips.find((x) => x.kind === kind && x.travelerIds.includes(member.id) && x.arriveAt.getTime() === edge.getTime())
          if (!trip || !isOnTimeline(edge)) continue
          const driver = nameOf(trip.driverId)
          monograms.push({ key: `${key}:${kind}`, x: xForTime(edge), initial: driver?.charAt(0) ?? '?', pigmentIndex: pigmentFor(trip.driverId) })
          if (kind === 'pickup') notes.push({ key: `${key}:note`, x: xForTime(edge), text: `${driver ?? 'No driver'} · ${clockTime(edge)}` })
        }
        return
      }

      if (segment.kind === 'activity') {
        blocks.push({ key, kind: 'activity', sourceId: segment.sourceId, ...at, label: segment.label, labelMaxWidth: null, pigmentIndex: own, placeStatus: segment.placeStatus })
        return
      }

      // Driving legs: drawn once, in the driver's lane and color.
      if (segment.driverId === member.id) {
        const firstLeg = segment.tripId != null && !labelledTrips.has(segment.tripId)
        if (segment.tripId) labelledTrips.add(segment.tripId)
        const label = firstLeg && !activitySources.has(segment.sourceId) ? segment.label : null
        blocks.push({ key, kind: 'drive', sourceId: segment.sourceId, ...at, label, labelMaxWidth: null, pigmentIndex: own, placeStatus: 'away' })
      } else if (segment.driverId == null && !placeSources.has(segment.sourceId)) {
        // Nobody is driving yet: show the road time as unassigned (school bars show "?" instead).
        blocks.push({ key, kind: 'drive_unassigned', sourceId: segment.sourceId, ...at, label: null, labelMaxWidth: null, pigmentIndex: own, placeStatus: 'away' })
      }
    })

    // Labels above blocks read left to right: each runs up to the next one (truncated
    // there), and a label starting too close to the previous one is dropped.
    let previous: ScoreBlock | null = null
    for (const block of [...blocks].sort((a, b) => a.x - b.x)) {
      if (block.kind === 'place' || !block.label) continue
      if (previous) {
        const room = block.x - previous.x - LABEL_GAP
        if (room < MIN_LABEL_WIDTH) {
          block.label = null
          continue
        }
        previous.labelMaxWidth = room
      }
      previous = block
    }

    // A pickup note is dropped when something else starts right after it; the initial still shows who.
    const clearNotes = notes.filter((note) => !blocks.some((b) => b.kind !== 'place' && b.x >= note.x - 8 && b.x < note.x + NOTE_WIDTH))

    return { member, pigmentIndex: own, status: laneStatus(member.id, segments, plan.trips, now, nameOf), blocks, monograms, notes: clearNotes }
  })

  // Everyone home by: the last known return, only when every trip's return is known.
  let everyoneHomeBy: Score['everyoneHomeBy'] = null
  if (plan.trips.length > 0 && plan.trips.every((trip) => trip.homeAt)) {
    const last = new Date(Math.max(...plan.trips.map((trip) => trip.homeAt!.getTime())))
    if (last > now && isOnTimeline(last)) {
      const x = xForTime(last)
      const flip = x > TIMELINE_WIDTH - HOME_LABEL_WIDTH
      const [from, to] = flip ? [x - HOME_LABEL_WIDTH, x] : [x, x + HOME_LABEL_WIDTH]
      const clear = (lane: ScoreLane) => lane.blocks.every((b) => b.x + b.width <= from || b.x >= to)
      let laneIndex = lanes.length - 1
      while (laneIndex > 0 && !clear(lanes[laneIndex])) laneIndex -= 1
      if (!clear(lanes[laneIndex])) laneIndex = lanes.length - 1
      everyoneHomeBy = { x, label: `Everyone home by ${clockTime(last)}`, flip, laneIndex }
    }
  }

  const order = members.map((m) => m.id)
  const allDay = plan.allDay.map((item) => ({
    sourceId: item.sourceId,
    title: item.title,
    people: [...new Set(item.memberIds)]
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))
      .map((id) => ({ id, initial: nameOf(id)?.charAt(0) ?? '?', pigmentIndex: pigmentFor(id) })),
  }))

  return { lanes, everyoneHomeBy, allDay }
}
