import { useMemo } from 'react'
import { useRollingEvents, useTodayEvents, useTomorrowEvents } from '../hooks/useCalendarEvents'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useMemberAvailability } from '../hooks/useMemberAvailability'
import { deserializeRoutineFromAvailabilityRules, type FamilyRoutine } from '../lib/familyRoutines'
import { buildDayPlan, type DayOff } from './engine/dayPlan'
import { dayState, type WallTripState } from './tripState'
import type { DayPlan, WallEvent, WallMember } from './engine/types'
import { eventsFor, routinesFor, type Audience, type KeepFrom } from './audience'

export interface WallDay {
  members: WallMember[]
  /** null while loading. */
  today: DayPlan | null
  /** For the evening posture. */
  tomorrow: DayPlan | null
  /** Today and the next six days (decisions and the week strip); empty while loading. */
  week: DayPlan[]
  /** The rolling event cache (the event sheet and its previews rebuild days from it). */
  allEvents: WallEvent[]
  routines: FamilyRoutine[]
  dayOffs: DayOff[]
}

/**
 * Today's and tomorrow's plans from the app's shared caches: family members,
 * routines and days off (member availability), and slices of the rolling event
 * cache. Rebuilt when the data changes or the date rolls over, not every minute.
 * `audience` is who's looking (the wall, or one person's phone): only what they may see
 * goes into the plans (audience.ts).
 */
export function useWallDay(now: Date, tripState: WallTripState = {}, audience: Audience = { kind: 'wall' }, keep: KeepFrom = {}): WallDay {
  const audienceKey = audience.kind === 'wall' ? 'wall' : audience.memberId
  const dayKey = now.toDateString()
  const { data: familyMembers } = useFamilyMembers()
  const members = useMemo(() => (familyMembers ?? []) as unknown as WallMember[], [familyMembers])
  const memberIds = useMemo(() => members.map((m) => m.id), [members])
  const { rules, exceptions, isLoading: availabilityLoading } = useMemberAvailability(memberIds)
  const { data: todayEvents } = useTodayEvents(now)
  const { data: tomorrowEvents } = useTomorrowEvents(now)
  const { data: rollingEvents } = useRollingEvents(now)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- audienceKey stands for audience
  const shown = useMemo(() => (list: WallEvent[]) => eventsFor(audience, list, members, keep), [audienceKey, members, keep])
  const allEvents = useMemo(() => shown((rollingEvents ?? []) as unknown as WallEvent[]), [rollingEvents, shown])
  const todayShown = useMemo(() => (todayEvents ? shown(todayEvents as unknown as WallEvent[]) : null), [todayEvents, shown])
  const tomorrowShown = useMemo(() => (tomorrowEvents ? shown(tomorrowEvents as unknown as WallEvent[]) : null), [tomorrowEvents, shown])

  const routines = useMemo(
    () => routinesFor(audience, members.map((m) => deserializeRoutineFromAvailabilityRules(m.id, rules)).filter((r): r is FamilyRoutine => Boolean(r)), members),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- audienceKey stands for audience
    [members, rules, audienceKey],
  )
  // Wait for routines too, so school runs don't pop in after the rest of the day.
  const ready = Boolean(familyMembers) && !availabilityLoading

  const today = useMemo(() => {
    if (!ready || !todayShown) return null
    const date = new Date(dayKey)
    return buildDayPlan({ date, members, routines, events: todayShown, dayOffs: exceptions, tripState: dayState(tripState, date) })
  }, [ready, dayKey, members, routines, exceptions, todayShown, tripState])

  const tomorrow = useMemo(() => {
    if (!ready || !tomorrowShown) return null
    const date = new Date(dayKey)
    date.setDate(date.getDate() + 1)
    return buildDayPlan({ date, members, routines, events: tomorrowShown, dayOffs: exceptions, tripState: dayState(tripState, date) })
  }, [ready, dayKey, members, routines, exceptions, tomorrowShown, tripState])

  const week = useMemo(() => {
    if (!ready || !today || !tomorrow) return []
    const later = [2, 3, 4, 5, 6].map((offset) => {
      const date = new Date(dayKey)
      date.setDate(date.getDate() + offset)
      return buildDayPlan({ date, members, routines, events: allEvents, dayOffs: exceptions, tripState: dayState(tripState, date) })
    })
    return [today, tomorrow, ...later]
  }, [ready, today, tomorrow, dayKey, members, routines, allEvents, exceptions, tripState])

  return { members, today, tomorrow, week, allEvents, routines, dayOffs: exceptions as DayOff[] }
}
