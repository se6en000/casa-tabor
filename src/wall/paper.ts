import { clockTime, placeName } from './header.ts'
import type { DayPlan, Trip, WallMember } from './engine/types'
import type { Posture } from './posture'

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
/** What the server writes. */
export interface PaperWords { headline: string; deck: string; sky: string }

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
export function paperShows(input: { posture: Posture; now: Date; dismissedOn: string | null; previewing: boolean }): boolean {
  if (input.previewing) return true
  return input.posture === 'calm' && input.now.getHours() < PAPER_UNTIL_HOUR && input.dismissedOn !== localDate(input.now)
}

export const paperDate = localDate
