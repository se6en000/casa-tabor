import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { saveEventTransportationOverride } from '../lib/eventPlanOverrides'
import { supabase } from '../lib/supabase'
import { withDriver } from './editing'
import type { Trip } from './engine/types'
import { packingEventIds } from './packing'
import { dayState, withDeparted, withDismissed, withHandOff, withoutDeparted } from './tripState'
import { useMinuteClock } from './useMinuteClock'
import { useWallChecklist } from './useWallChecklist'
import { useWallDay } from './useWallDay'
import { useWallTripState } from './useWallTripState'

/**
 * The family's day as the Wall and the phone both see it: the minute clock, the day
 * plans for the week, the week's prep, and the trip actions ("Leaving now", "Hand off",
 * a decision's "keep it"), which save the same way from either surface.
 */
export function useFamilyDay() {
  const now = useMinuteClock()
  const trips = useWallTripState()
  const day = useWallDay(now, trips.state)
  const { members, today, tomorrow, week, allEvents } = day
  const queryClient = useQueryClient()
  const tripStateFor = useCallback((date: Date) => dayState(trips.state, date), [trips.state])
  const tripActions = useMemo(() => {
    const date0 = today?.date ?? now
    return {
      // The minute-aligned time, so the trip reads as on the road at once.
      leaving: (ids: string[]) => void trips.save(withDeparted(trips.state, date0, ids, now)),
      undoLeaving: (ids: string[]) => void trips.save(withoutDeparted(trips.state, date0, ids)),
      handOff: async (trip: Trip, driverId: string, date: Date = date0) => {
        // School runs have no event of their own: that day's hand-off is kept with the day state.
        if (trip.source === 'routine') return trips.save(withHandOff(trips.state, date, trip.id, driverId))
        const event = allEvents.find((e) => e.id === trip.sourceId) as unknown as EventWithDetails | undefined
        if (!event) throw new Error('That event is no longer on the calendar.')
        const name = members.find((m) => m.id === driverId)?.name ?? ''
        const plan = withDriver(event as never, event.plan_override?.transportation_plan, driverId, name)
        await saveEventTransportationOverride({ supabase, queryClient, event, transportationPlan: plan, waits: event.plan_override?.waits, modeOverride: event.plan_override?.mode_override })
      },
      dismiss: (date: Date, key: string) => trips.save(withDismissed(trips.state, date, key)),
    }
  }, [today?.date, now, trips, allEvents, members, queryClient])
  // Prep for the whole week: the week strip counts it, and any day can be opened.
  const eventIds = useMemo(() => (week.length ? week : [today, tomorrow]).flatMap((plan) => (plan ? packingEventIds(plan) : [])), [week, today, tomorrow])
  const checklist = useWallChecklist(eventIds)
  return { now, ...day, tripStateFor, tripActions, checklist, queryClient }
}
