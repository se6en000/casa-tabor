import { formatWallClock } from './clock.ts'
import type { DayPlan, WallMember } from './engine/types'
import type { TravelTrip } from './engine/travel'
import type { ComingUpItem } from './comingUp'

// Covering a trip (design doc "Casa: Travel design"; Jake, 2026-10-01: "we should start planning coverage right away.
// that's the hardest part of traveling is aligning help"): every run the traveller usually drives while they're gone,
// on every day of the trip, and who has it — shown from the day the trip lands in Casa, not the evening before.

export interface CoverageRun {
  date: Date
  /** The run's id on that day (a hand-off is saved against it). */
  tripId: string
  title: string
  /** "7:35" */
  time: string
  /** Who has it now; null = no one yet. */
  driverId: string | null
  /** What a hand-off saves against. */
  source: 'event' | 'routine'
  sourceId: string
}

const dayStart = (d: Date) => {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  return s
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const weekday = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })

/** The runs the traveller usually drives inside the trip, day by day (`planDay` builds a day with the trip in it). */
export function tripCoverage(trip: TravelTrip, planDay: (date: Date) => DayPlan | null): CoverageRun[] {
  const first = trip.leaveHomeAt ?? trip.inbound?.departAt
  const last = trip.homeAt ?? first
  if (!first || !last) return []
  const runs: CoverageRun[] = []
  for (let d = dayStart(first); d <= dayStart(last); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const plan = planDay(new Date(d))
    for (const t of plan?.trips ?? []) {
      if (!t.usualDriverAway || !trip.memberIds.includes(t.usualDriverAway.memberId)) continue
      runs.push({ date: new Date(d), tripId: t.id, title: t.title, time: formatWallClock(t.arriveAt).time, driverId: t.driverId, source: t.source, sourceId: t.sourceId })
    }
    // Their chores that day (trash night, the debris): handed off like a run.
    for (const c of plan?.chores ?? []) {
      if (!c.usualAway || !trip.memberIds.includes(c.usualAway.memberId)) continue
      runs.push({ date: new Date(d), tripId: c.key, title: c.title, time: formatWallClock(c.at).time, driverId: c.doerId, source: 'routine', sourceId: c.key })
    }
  }
  return runs
}

/** "Jake away Wed–Thu": the trip in Coming up, with what still needs someone (or who covers it, once all do). */
export function coverageComingUp(trip: TravelTrip, runs: CoverageRun[], members: WallMember[], today: string): ComingUpItem {
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'Someone'
  const who = trip.memberIds.map(nameOf).join(' & ')
  const first = trip.leaveHomeAt ?? trip.inbound!.departAt
  const last = trip.homeAt ?? first
  const span = dayStart(first).getTime() === dayStart(last).getTime() ? weekday(first) : `${weekday(first)}–${weekday(last)}`
  const open = runs.filter((r) => !r.driverId)
  const at = (r: CoverageRun) => `${weekday(r.date)} ${r.time}`
  const verb = (title: string) => title.replace(/^Drop off /, 'drops off ').replace(/^Pick up /, 'picks up ')
  const nextStep = open.length === 1
    ? `${open[0].title} ${at(open[0])} needs someone`
    : open.length > 1
      ? `${open.length} runs need someone`
      : runs.length === 1
        ? `Covered: ${nameOf(runs[0].driverId)} ${verb(runs[0].title)} ${at(runs[0])}`
        : runs.length > 1 ? `All ${runs.length} runs covered` : 'Nothing of theirs to cover'
  const date = ymd(first)
  const daysAway = Math.round((dayStart(first).getTime() - dayStart(new Date(`${today}T12:00:00`)).getTime()) / 86_400_000)
  return {
    key: `trip:${trip.key}`,
    kind: 'trip',
    title: `${who} away ${span}`,
    date,
    daysAway,
    nextStep,
    // Something open: start now. All covered: it comes back the day before, as a reminder.
    pokeOn: open.length ? today : ymd(new Date(dayStart(first).getTime() - 86_400_000)),
    late: false,
    tripKey: trip.key,
  }
}
