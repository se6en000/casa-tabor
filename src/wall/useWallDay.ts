import { useMemo } from 'react'
import { useRollingEvents, useTodayEvents, useTomorrowEvents, useWeekAroundEvents } from '../hooks/useCalendarEvents'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useMemberAvailability } from '../hooks/useMemberAvailability'
import { deserializeRoutinesFromAvailabilityRules, type FamilyRoutine } from '../lib/familyRoutines'
import { buildDayPlan, type DayOff } from './engine/dayPlan'
import { buildTrips, type TravelSettings } from './engine/travel'
import { useWallTravel } from './useWallTravel'
import { useTravelEvents } from './useTravelEvents'
import { useChores } from './useChores'
import type { WallChore } from './engine/chores'
import type { TravelTrip } from './engine/travel'
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
  /** The week around a far day on show (dayFocus.ts), or null. */
  aroundEvents: WallEvent[] | null
  routines: FamilyRoutine[]
  dayOffs: DayOff[]
  /** Save a trip sheet's choice (canvas 19d). */
  saveTravel: (key: string, change: TravelSettings) => Promise<void>
  /** Every trip we know of, up to four months out (its coverage is planned from the day it lands). */
  travel: TravelTrip[]
  /** Household chores (never synced to Google). */
  chores: WallChore[]
}

/**
 * Today's and tomorrow's plans from the app's shared caches: family members,
 * routines and days off (member availability), and slices of the rolling event
 * cache. Rebuilt when the data changes or the date rolls over, not every minute.
 * `audience` is who's looking (the wall, or one person's phone): only what they may see
 * goes into the plans (audience.ts).
 */
export function useWallDay(now: Date, tripState: WallTripState = {}, audience: Audience = { kind: 'wall' }, keep: KeepFrom = {}, around: Date | null = null): WallDay {
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
  // A far day's week (dayFocus.ts), seen the same way as the rest.
  const { data: aroundRaw } = useWeekAroundEvents(around)
  const aroundEvents = useMemo(() => (around && aroundRaw ? shown(aroundRaw as unknown as WallEvent[]) : null), [around, aroundRaw, shown])
  const todayShown = useMemo(() => (todayEvents ? shown(todayEvents as unknown as WallEvent[]) : null), [todayEvents, shown])
  const tomorrowShown = useMemo(() => (tomorrowEvents ? shown(tomorrowEvents as unknown as WallEvent[]) : null), [tomorrowEvents, shown])

  const routines = useMemo(
    () => routinesFor(audience, members.flatMap((m) => deserializeRoutinesFromAvailabilityRules(m.id, rules)), members),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- audienceKey stands for audience
    [members, rules, audienceKey],
  )
  // Trips away, from every event we hold (a day needs the flight out or home on another day).
  const travelSettings = useWallTravel()
  const chores = useChores()
  const farTravel = useTravelEvents(now)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- audienceKey stands for audience
  const farShown = useMemo(() => shown(farTravel), [farTravel, shown])
  const travel = useMemo(() => {
    const byId = new Map<string, WallEvent>()
    // The far lookup first: the cache's fuller rows (enrichment, plans) win for the same event.
    for (const list of [farShown, allEvents, todayShown ?? [], tomorrowShown ?? []]) for (const e of list) byId.set(e.id, e)
    return buildTrips([...byId.values()], members, {}, travelSettings.settings)
  }, [farShown, allEvents, todayShown, tomorrowShown, members, travelSettings.settings])
  // Wait for routines too, so school runs don't pop in after the rest of the day.
  const ready = Boolean(familyMembers) && !availabilityLoading

  const today = useMemo(() => {
    if (!ready || !todayShown) return null
    const date = new Date(dayKey)
    return buildDayPlan({ date, members, routines, events: todayShown, dayOffs: exceptions, tripState: dayState(tripState, date), travel, chores })
  }, [ready, dayKey, members, routines, exceptions, todayShown, tripState, travel, chores])

  const tomorrow = useMemo(() => {
    if (!ready || !tomorrowShown) return null
    const date = new Date(dayKey)
    date.setDate(date.getDate() + 1)
    return buildDayPlan({ date, members, routines, events: tomorrowShown, dayOffs: exceptions, tripState: dayState(tripState, date), travel, chores })
  }, [ready, dayKey, members, routines, exceptions, tomorrowShown, tripState, travel, chores])

  const week = useMemo(() => {
    if (!ready || !today || !tomorrow) return []
    const later = [2, 3, 4, 5, 6].map((offset) => {
      const date = new Date(dayKey)
      date.setDate(date.getDate() + offset)
      return buildDayPlan({ date, members, routines, events: allEvents, dayOffs: exceptions, tripState: dayState(tripState, date), travel, chores })
    })
    return [today, tomorrow, ...later]
  }, [ready, today, tomorrow, dayKey, members, routines, allEvents, exceptions, tripState, travel, chores])

  return { members, today, tomorrow, week, allEvents, aroundEvents, routines, dayOffs: exceptions as DayOff[], saveTravel: travelSettings.save, travel, chores }
}
