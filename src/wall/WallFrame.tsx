import { useCallback, useEffect, useState } from 'react'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { deleteCalendarEvent } from '../lib/eventMutations'
import { supabase } from '../lib/supabase'
import { useHomeWeather } from '../hooks/useHomeWeather'
import { useWakeWord } from '../hooks/useWakeWord'
import type { FamilyMember } from '../types'
import WallAssistantBand from './WallAssistantBand'
import { toggleChecklistItem } from './useWallChecklist'
import { useFamilyDay } from './useFamilyDay'
import { createEventByTouch } from './createEvent'
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
  const createEvent = (args: Record<string, unknown>) => createEventByTouch(queryClient, args, 'wall')

  return <WallView now={now} members={members} today={today} tomorrow={tomorrow} currentWeather={currentWeather} checklist={checklist} allEvents={allEvents} routines={routines} dayOffs={dayOffs} onAsk={ask} overlay={band} pointAt={bandOpen ? pointAt : null} openRequest={openRequest} tripStateFor={tripStateFor} tripActions={tripActions} week={week} deleteEvent={(event) => deleteCalendarEvent(supabase, queryClient, event.id, event as unknown as EventWithDetails)} toggleChecklist={(item) => void toggleChecklistItem(queryClient, item.id, !item.checked)} createEvent={createEvent} />
}
