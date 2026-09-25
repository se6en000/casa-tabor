import { useMemo } from 'react'
import { useRollingEvents, useTodayEvents, useTomorrowEvents } from '../hooks/useCalendarEvents'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useMemberAvailability } from '../hooks/useMemberAvailability'
import { deserializeRoutineFromAvailabilityRules, type FamilyRoutine } from '../lib/familyRoutines'
import { buildDayPlan, type DayOff } from './engine/dayPlan'
import type { DayPlan, WallEvent, WallMember } from './engine/types'

export interface WallDay {
  members: WallMember[]
  /** null while loading. */
  today: DayPlan | null
  /** For the evening posture. */
  tomorrow: DayPlan | null
  /** The rolling event cache (the event sheet and its previews rebuild days from it). */
  allEvents: WallEvent[]
  routines: FamilyRoutine[]
  dayOffs: DayOff[]
}

/**
 * Today's and tomorrow's plans from the app's shared caches: family members,
 * routines and days off (member availability), and slices of the rolling event
 * cache. Rebuilt when the data changes or the date rolls over, not every minute.
 */
export function useWallDay(now: Date): WallDay {
  const dayKey = now.toDateString()
  const { data: familyMembers } = useFamilyMembers()
  const members = useMemo(() => (familyMembers ?? []) as unknown as WallMember[], [familyMembers])
  const memberIds = useMemo(() => members.map((m) => m.id), [members])
  const { rules, exceptions, isLoading: availabilityLoading } = useMemberAvailability(memberIds)
  const { data: todayEvents } = useTodayEvents(now)
  const { data: tomorrowEvents } = useTomorrowEvents(now)
  const { data: rollingEvents } = useRollingEvents(now)
  const allEvents = useMemo(() => (rollingEvents ?? []) as unknown as WallEvent[], [rollingEvents])

  const routines = useMemo(
    () => members.map((m) => deserializeRoutineFromAvailabilityRules(m.id, rules)).filter((r): r is FamilyRoutine => Boolean(r)),
    [members, rules],
  )
  // Wait for routines too, so school runs don't pop in after the rest of the day.
  const ready = Boolean(familyMembers) && !availabilityLoading

  const today = useMemo(() => {
    if (!ready || !todayEvents) return null
    return buildDayPlan({ date: new Date(dayKey), members, routines, events: todayEvents as unknown as WallEvent[], dayOffs: exceptions })
  }, [ready, dayKey, members, routines, exceptions, todayEvents])

  const tomorrow = useMemo(() => {
    if (!ready || !tomorrowEvents) return null
    const date = new Date(dayKey)
    date.setDate(date.getDate() + 1)
    return buildDayPlan({ date, members, routines, events: tomorrowEvents as unknown as WallEvent[], dayOffs: exceptions })
  }, [ready, dayKey, members, routines, exceptions, tomorrowEvents])

  return { members, today, tomorrow, allEvents, routines, dayOffs: exceptions as DayOff[] }
}
