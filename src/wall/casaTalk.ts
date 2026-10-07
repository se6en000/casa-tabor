import type { DayPlan, Trip, WallMember } from './engine/types'
import type { DecisionAction } from './decisions'
import type { DatedDecision } from './WallDecisions'
import { clockTime, placeName } from './header.ts'

// "Casa wants to talk to you" (canvas row 21; Jake, 2026-10-01, approved): when something needs a person and nobody
// has answered it, the mic glows and Casa says it in two sentences, with the answers as buttons. Only what a person
// must decide (a run with no one on it, a driver with something else on), only within the next day, one at a time.

/** How far ahead Casa speaks up. */
export const TALK_HORIZON_MS = 24 * 3_600_000

export type TalkAnswer = { label: string; action: DecisionAction | { type: 'snooze' } }

export interface CasaTopic {
  key: string
  decision: DatedDecision
  at: Date
  /** Who it's for (the traveller whose run it is, or the driver with a clash); null = whoever's there. */
  forId: string | null
  forName: string | null
  /** "Jake, about tomorrow morning" */
  eyebrow: string
  /** "You're in Dallas tomorrow, and nobody's taking Emme and Owen to Palm Beach Public at 7:35." */
  said: string
  /** "Giselle's free then." */
  ask: string | null
  /** Why it's speaking up now. */
  why: string[]
  answers: TalkAnswer[]
}

/** What's been asked to wait, and what's already reached the phones. Kept in settings, so every screen agrees. */
export interface CasaTalkState {
  snoozed?: Record<string, string>
  pushed?: Record<string, string>
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const daysBetween = (a: Date, b: Date) => Math.round((dayStart(b).getTime() - dayStart(a).getTime()) / 86_400_000)
const joinNames = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

function dayWord(at: Date, now: Date): string {
  const days = daysBetween(now, at)
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : `on ${at.toLocaleDateString('en-US', { weekday: 'long' })}`
}

function partOfDay(at: Date): string {
  const h = at.getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

function eyebrowFor(at: Date, now: Date, forName: string | null): string {
  const days = daysBetween(now, at)
  const when = days === 0 ? `this ${partOfDay(at)}` : days === 1 ? `tomorrow ${partOfDay(at)}` : at.toLocaleDateString('en-US', { weekday: 'long' })
  return `${forName ? `${forName}, about` : 'About'} ${when}`.toUpperCase()
}

/** "taking Emme and Owen to Palm Beach Public" */
function theRun(trip: Trip, nameOf: (id: string) => string): string {
  const who = joinNames(trip.travelerIds.filter((id) => id !== trip.driverId).map(nameOf))
  if (trip.kind === 'dropoff') return `taking ${who} to ${placeName(trip)}`
  if (trip.kind === 'pickup') return `picking up ${who} at ${placeName(trip)}`
  return `driving ${who} to ${trip.title.split(':')[0].trim()}`
}

function untilWords(at: Date, now: Date): string {
  const minutes = Math.max(1, Math.round((at.getTime() - now.getTime()) / 60_000))
  if (minutes < 60) return `${minutes} minutes`
  const hours = Math.floor(minutes / 60)
  return hours === 1 ? 'an hour' : `${hours} hours`
}

/** The one thing Casa raises now, or null. Soonest first; a "Not now" waits until its time. */
export function casaTopic(
  decisions: DatedDecision[],
  planOn: (date: Date) => DayPlan | null,
  members: WallMember[],
  now: Date,
  state: CasaTalkState = {},
): CasaTopic | null {
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Someone'
  const ready = decisions
    .filter((d) => d.at > now && (
      ((d.kind === 'no_driver' || d.kind === 'driver_busy') && d.at.getTime() - now.getTime() <= TALK_HORIZON_MS)
      // A school holiday is asked days ahead, so there's time to sort out who has the kids (holidays.ts).
      || d.kind === 'holiday_off' || d.kind === 'holiday_cover'))
    .filter((d) => !(state.snoozed?.[d.key] && new Date(state.snoozed[d.key]) > now))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
  for (const decision of ready) {
    if (decision.kind === 'holiday_off' || decision.kind === 'holiday_cover') {
      return {
        key: decision.key,
        decision,
        at: decision.at,
        forId: null,
        forName: null,
        eyebrow: eyebrowFor(decision.at, now, null),
        said: decision.text,
        ask: null,
        why: [decision.kind === 'holiday_off' ? 'It’s a school day for them otherwise.' : 'Nobody’s named for them that day yet.'],
        answers: [...decision.answers, { label: 'Not now', action: { type: 'snooze' } }],
      }
    }
    const trip = planOn(decision.date)?.trips.find((t) => t.id === decision.tripIds[0])
    if (!trip) continue
    const when = dayWord(decision.at, now)
    const time = clockTime(trip.arriveAt)
    const free = decision.answers.filter((a): a is { label: string; action: Extract<DecisionAction, { type: 'drive' }> } => a.action.type === 'drive')
    if (decision.kind === 'no_driver') {
      const away = trip.usualDriverAway
      const forId = away?.memberId ?? null
      const forName = forId ? nameOf(forId) : null
      const said = away
        ? `You’re in ${away.city} ${when}, and nobody’s ${theRun(trip, nameOf)} at ${time}.`
        : `Nobody’s ${theRun(trip, nameOf)} at ${time} ${when}.`
      const names = free.map((a) => nameOf(a.action.driverId))
      return {
        key: decision.key,
        decision,
        at: decision.at,
        forId,
        forName,
        eyebrow: eyebrowFor(decision.at, now, forName),
        said,
        ask: names.length === 1 ? `${names[0]}’s free then.` : names.length > 1 ? `${joinNames(names)} are free then.` : null,
        why: [`It’s ${untilWords(decision.at, now)} away, and nobody has it.`],
        answers: [
          ...free.map((a) => ({ label: `${nameOf(a.action.driverId)} will`, action: a.action })),
          { label: free.length ? 'Someone else' : 'Choose someone', action: { type: 'pick', tripIds: decision.tripIds } },
          { label: forId ? 'I’ll handle it' : 'We’ve got it', action: { type: 'dismiss' } },
          { label: 'Not now', action: { type: 'snooze' } },
        ],
      }
    }
    // A driver with something else on at the same time: said to them.
    const forId = trip.driverId
    const forName = forId ? nameOf(forId) : null
    const handOff = decision.answers.find((a) => a.action.type === 'drive' || a.action.type === 'pick')
    const other = handOff?.action.type === 'drive' ? nameOf(handOff.action.driverId) : null
    return {
      key: decision.key,
      decision,
      at: decision.at,
      forId,
      forName,
      eyebrow: eyebrowFor(decision.at, now, forName),
      said: decision.text,
      ask: other ? `${other}’s free then.` : null,
      why: [`It’s ${untilWords(decision.at, now)} away.`],
      answers: [
        ...(handOff ? [{ label: other ? `${other} will` : 'Choose someone', action: handOff.action }] : []),
        { label: forName ? `${forName} will manage` : 'It’s fine', action: { type: 'dismiss' } },
        { label: 'Not now', action: { type: 'snooze' } },
      ],
    }
  }
  return null
}

/** "Not now": back the evening before for a morning run, else in two hours, and never later than an hour before it. */
export function snoozeUntil(at: Date, now: Date): Date {
  const evening = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0)
  const pick = daysBetween(now, at) >= 1 && now < evening ? evening : new Date(now.getTime() + 2 * 3_600_000)
  const latest = new Date(at.getTime() - 3_600_000)
  return new Date(Math.max(now.getTime() + 30 * 60_000, Math.min(pick.getTime(), latest.getTime())))
}

/** The phones hear about it once, and never at night (9 PM to 7 AM). */
export function pushNow(topic: CasaTopic, state: CasaTalkState, now: Date): boolean {
  const h = now.getHours()
  return !state.pushed?.[topic.key] && h >= 7 && h < 21
}

export function pushMessage(topic: CasaTopic): { title: string; body: string; tag: string; url: string } {
  return {
    title: topic.forName ? `Something for you, ${topic.forName}` : 'Something for you',
    body: topic.said,
    tag: `casa-talk:${topic.key}`,
    url: '/phone',
  }
}
