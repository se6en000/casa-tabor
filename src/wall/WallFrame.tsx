import { useCallback, useEffect, useState } from 'react'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { deleteCalendarEvent, invalidateAllCalendarQueries } from '../lib/eventMutations'
import { getAssistantDeviceId } from '../lib/assistantTelemetry'
import { readActionResult, responseBody } from './assistantActions'
import { supabase } from '../lib/supabase'
import { useHomeWeather } from '../hooks/useHomeWeather'
import { useWakeWord } from '../hooks/useWakeWord'
import type { FamilyMember } from '../types'
import WallAssistantBand from './WallAssistantBand'
import { toggleChecklistItem } from './useWallChecklist'
import { useFamilyDay } from './useFamilyDay'
import WallView from './WallView'

/** The Wall with live data: the minute clock, today's and tomorrow's plans, and the home weather. */
export default function WallFrame() {
  const { now, members, today, tomorrow, week, allEvents, routines, dayOffs, tripStateFor, tripActions, checklist, queryClient } = useFamilyDay()
  const { data: currentWeather } = useHomeWeather()

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
