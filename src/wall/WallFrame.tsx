import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { deleteCalendarEvent, invalidateAllCalendarQueries } from '../lib/eventMutations'
import { getAssistantDeviceId } from '../lib/assistantTelemetry'
import { readActionResult, responseBody } from './assistantActions'
import { saveEventTransportationOverride } from '../lib/eventPlanOverrides'
import { supabase } from '../lib/supabase'
import { withDriver } from './editing'
import type { Trip } from './engine/types'
import { dayState, withDeparted, withDismissed, withHandOff, withoutDeparted } from './tripState'
import { useWallTripState } from './useWallTripState'
import { useHomeWeather } from '../hooks/useHomeWeather'
import { useWakeWord } from '../hooks/useWakeWord'
import type { FamilyMember } from '../types'
import WallAssistantBand from './WallAssistantBand'
import { packingEventIds } from './packing'
import { toggleChecklistItem, useWallChecklist } from './useWallChecklist'
import { useMinuteClock } from './useMinuteClock'
import { useWallDay } from './useWallDay'
import WallView from './WallView'

/** The Wall with live data: the minute clock, today's and tomorrow's plans, and the home weather. */
export default function WallFrame() {
  const now = useMinuteClock()
  const trips = useWallTripState()
  const { members, today, tomorrow, week, allEvents, routines, dayOffs } = useWallDay(now, trips.state)
  const queryClient = useQueryClient()
  const tripStateFor = useCallback((date: Date) => dayState(trips.state, date), [trips.state])
  const tripActions = useMemo(() => {
    const day = today?.date ?? now
    return {
      // The wall's own (minute-aligned) time, so the trip reads as on the road at once.
      leaving: (ids: string[]) => void trips.save(withDeparted(trips.state, day, ids, now)),
      undoLeaving: (ids: string[]) => void trips.save(withoutDeparted(trips.state, day, ids)),
      handOff: async (trip: Trip, driverId: string, date: Date = day) => {
        // School runs have no event of their own: that day's hand-off is kept with the wall's day state.
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
  const { data: currentWeather } = useHomeWeather()
  // Prep for the whole week: the week strip counts it, and any day can be opened.
  const eventIds = useMemo(() => (week.length ? week : [today, tomorrow]).flatMap((plan) => (plan ? packingEventIds(plan) : [])), [week, today, tomorrow])
  const checklist = useWallChecklist(eventIds)

  // The assistant band: the mic button or the wake word (heard on the Pi) opens it and starts listening.
  const [bandOpen, setBandOpen] = useState(false)
  const [listenNonce, setListenNonce] = useState(0)
  const [pointAt, setPointAt] = useState<string | null>(null)
  const [openRequest, setOpenRequest] = useState<{ id: string; nonce: number } | null>(null)
  const ask = useCallback(() => {
    setBandOpen(true)
    setListenNonce((n) => n + 1)
  }, [])
  const closeBand = useCallback(() => setBandOpen(false), [])
  useWakeWord(bandOpen, false, true)
  useEffect(() => {
    document.addEventListener('open-ai-chat', ask)
    return () => document.removeEventListener('open-ai-chat', ask)
  }, [ask])
  const band = bandOpen ? (
    <WallAssistantBand
      listenNonce={listenNonce}
      events={allEvents as unknown as EventWithDetails[]}
      family={members as unknown as FamilyMember[]}
      onClose={closeBand}
      onPointAt={setPointAt}
      onOpenEvent={(id) => {
        setBandOpen(false)
        setOpenRequest({ id, nonce: Date.now() })
      }}
    />
  ) : null
  // Adding by touch: the same create call voice uses (people, place, drive time and Google
  // sync all happen there). The time was chosen on purpose, so a clash doesn't block it.
  const createEvent = async (args: Record<string, unknown>) => {
    const actionId = crypto.randomUUID()
    const requestArgs = { ...args, allow_calendar_conflicts: true }
    const { data, error } = await supabase.functions.invoke('execute-ai-action', {
      body: {
        tool: 'create_event',
        args: requestArgs,
        action_id: actionId,
        correlation_id: `wall-add:${actionId}`,
        lane: 'touch',
        device_id: getAssistantDeviceId(),
        client_trace_source: 'wall-add-sheet',
        confirmed_by_user: true,
      },
    })
    const result = readActionResult(await responseBody(data, error), requestArgs)
    if (result.kind !== 'done') throw new Error(result.kind === 'error' ? result.message : 'That clashes with something already on the calendar.')
    invalidateAllCalendarQueries(queryClient, result.eventId ?? '')
  }

  return <WallView now={now} members={members} today={today} tomorrow={tomorrow} currentWeather={currentWeather} checklist={checklist} allEvents={allEvents} routines={routines} dayOffs={dayOffs} onAsk={ask} overlay={band} pointAt={bandOpen ? pointAt : null} openRequest={openRequest} tripStateFor={tripStateFor} tripActions={tripActions} week={week} deleteEvent={(event) => deleteCalendarEvent(supabase, queryClient, event.id, event as unknown as EventWithDetails)} toggleChecklist={(item) => void toggleChecklistItem(queryClient, item.id, !item.checked)} createEvent={createEvent} />
}
