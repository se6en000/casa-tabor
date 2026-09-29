import { useCallback, useEffect, useState } from 'react'
import { buildDayPlan } from './engine/dayPlan'
import type { WallEvent } from './engine/types'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { deleteCalendarEvent } from '../lib/eventMutations'
import { supabase } from '../lib/supabase'
import { useHomeWeather } from '../hooks/useHomeWeather'
import { useWakeWord } from '../hooks/useWakeWord'
import type { FamilyMember } from '../types'
import WallAssistantBand from './WallAssistantBand'
import { useWallLed } from './useWallLed'
import { addChecklistItem, toggleChecklistItem, useEventChecklist } from './useWallChecklist'
import { useFamilyDay } from './useFamilyDay'
import { createEventByTouch } from './createEvent'
import WallView from './WallView'
import { useComingUp } from './useComingUp'
import { useTodos } from './useTodos'

/** The Wall with live data: the minute clock, today's and tomorrow's plans, and the home weather. */
export default function WallFrame() {
  const { now, members, today, tomorrow, week, allEvents, routines, dayOffs, tripStateFor, tripActions, checklist, queryClient } = useFamilyDay()
  const { data: currentWeather } = useHomeWeather()

  // The assistant band: the mic button or the wake word (heard on the Pi) opens it and starts listening.
  const [bandOpen, setBandOpen] = useState(false)
  const [listenNonce, setListenNonce] = useState(0)
  const [pointAt, setPointAt] = useState<string | null>(null)
  const [openRequest, setOpenRequest] = useState<{ id?: string; project?: string; todo?: boolean; nonce: number } | null>(null)
  const ask = useCallback(() => {
    setBandOpen(true)
    setListenNonce((n) => n + 1)
  }, [])
  const closeBand = useCallback(() => setBandOpen(false), [])
  const { onBandLed, onOutcome } = useWallLed(bandOpen, now)
  // The assistant's card is told from the same engine the wall runs; its draft is previewed on the Score.
  const [assistantDraft, setAssistantDraft] = useState<WallEvent | null>(null)
  const planDay = useCallback(
    (date: Date, events: WallEvent[]) => buildDayPlan({ date, members, routines, events, dayOffs, tripState: tripStateFor?.(date) }),
    [members, routines, dayOffs, tripStateFor],
  )
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
      members={members}
      planDay={planDay}
      onDraft={setAssistantDraft}
      onLed={onBandLed}
      onOutcome={onOutcome}
      onOpenEvent={(id) => {
        setBandOpen(false)
        setOpenRequest({ id, nonce: Date.now() })
      }}
      onOpenPlace={(open) => {
        setBandOpen(false)
        if (open.kind === 'event') setOpenRequest({ id: open.id, nonce: Date.now() })
        else if (open.kind === 'project') setOpenRequest({ project: open.id, nonce: Date.now() })
        else if (open.kind === 'todo') setOpenRequest({ todo: true, nonce: Date.now() })
      }}
    />
  ) : null
  const createEvent = (args: Record<string, unknown>) => createEventByTouch(queryClient, args, 'wall')

  const comingUp = useComingUp()
  const todos = useTodos()
  return <WallView now={now} members={members} today={today} tomorrow={tomorrow} currentWeather={currentWeather} checklist={checklist} allEvents={allEvents} routines={routines} dayOffs={dayOffs} onAsk={ask} overlay={band} pointAt={bandOpen ? pointAt : null} assistantDraft={bandOpen ? assistantDraft : null} openRequest={openRequest} tripStateFor={tripStateFor} tripActions={tripActions} week={week} deleteEvent={(event) => deleteCalendarEvent(supabase, queryClient, event.id, event as unknown as EventWithDetails)} toggleChecklist={(item) => void toggleChecklistItem(queryClient, item.id, !item.checked)} addChecklist={(eventId, label) => addChecklistItem(queryClient, eventId, label)} useEventItems={useEventChecklist} createEvent={createEvent} comingUp={comingUp.data ? { ...comingUp.data, act: comingUp.act, start: comingUp.start } : null} todos={todos.data ? { list: todos.data, act: todos.act } : null} />
}
