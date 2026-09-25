import { useMemo } from 'react'
import { useTodayEvents } from '../hooks/useCalendarEvents'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useMemberAvailability } from '../hooks/useMemberAvailability'
import { deserializeRoutineFromAvailabilityRules, type FamilyRoutine } from '../lib/familyRoutines'
import { buildDayPlan } from './engine/dayPlan'
import type { DayPlan, WallEvent, WallMember } from './engine/types'

export interface WallDay {
  members: WallMember[]
  plan: DayPlan | null
}

/**
 * Today's plan from the app's shared caches: family members, routines and days
 * off (member availability), and today's slice of the rolling event cache.
 * Rebuilt when the data changes or the date rolls over, not every minute.
 */
export function useWallDay(now: Date): WallDay {
  const dayKey = now.toDateString()
  const { data: familyMembers } = useFamilyMembers()
  const members = useMemo(() => (familyMembers ?? []) as unknown as WallMember[], [familyMembers])
  const memberIds = useMemo(() => members.map((m) => m.id), [members])
  const { rules, exceptions, isLoading: availabilityLoading } = useMemberAvailability(memberIds)
  const { data: events } = useTodayEvents(now)

  const plan = useMemo(() => {
    // Wait for routines too, so school runs don't pop in after the rest of the day.
    if (!familyMembers || !events || availabilityLoading) return null
    const routines = members
      .map((m) => deserializeRoutineFromAvailabilityRules(m.id, rules))
      .filter((r): r is FamilyRoutine => Boolean(r))
    return buildDayPlan({
      date: new Date(dayKey),
      members,
      routines,
      events: events as unknown as WallEvent[],
      dayOffs: exceptions,
    })
  }, [dayKey, familyMembers, members, rules, exceptions, events, availabilityLoading])

  return { members, plan }
}
