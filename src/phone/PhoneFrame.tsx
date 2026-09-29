import { useCallback } from 'react'
import { buildDayPlan } from '../wall/engine/dayPlan'
import type { WallEvent } from '../wall/engine/types'
import { useProfileSession } from '../contexts/useProfileSession'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { deleteCalendarEvent } from '../lib/eventMutations'
import { supabase } from '../lib/supabase'
import { saveDraft } from '../wall/saveDraft'
import { createEventByTouch } from '../wall/createEvent'
import { useFamilyDay } from '../wall/useFamilyDay'
import { useComingUp } from '../wall/useComingUp'
import { useTodoProject, useTodos } from '../wall/useTodos'
import { addChecklistItem, toggleChecklistItem, useEventChecklist } from '../wall/useWallChecklist'
import PhoneView from './PhoneView'
import PhoneAssistant from './PhoneAssistant'
import type { FamilyMember } from '../types'
import { useSavedContacts } from '../hooks/useSavedContacts'
import { useSavedPlaces } from '../hooks/useSavedPlaces'
import { scanDocumentFiles, type ScannedItem } from '../utils/documentScanner'
import { similarEvent } from './scan'

/** The phone with live data: the same family day as the Wall, seen by whoever unlocked this phone. */
/** What's already on the calendar on the scanned days: one read for the whole span, matched in the app. */
async function findSimilar(items: ScannedItem[]) {
  const dates = items.map((i) => i.date).filter(Boolean).sort()
  if (dates.length === 0) return {}
  const from = new Date(`${dates[0]}T00:00:00`)
  const to = new Date(`${dates[dates.length - 1]}T00:00:00`)
  to.setDate(to.getDate() + 1)
  const { data, error } = await supabase.from('events').select('id, title, start_time')
    .is('deleted_at', null).neq('status', 'cancelled').neq('record_kind', 'series_template')
    .gte('start_time', from.toISOString()).lt('start_time', to.toISOString()).limit(300)
  if (error) throw error
  const out: Record<string, { id: string; title: string; start_time: string }> = {}
  for (const item of items) {
    const match = similarEvent(item, data ?? [])
    if (match) out[item.id] = match
  }
  return out
}

export default function PhoneFrame() {
  const { profile } = useProfileSession()
  const { now, members, week, allEvents, routines, dayOffs, tripStateFor, tripActions, checklist, queryClient, keep, setKeptFrom } = useFamilyDay({ kind: 'member', memberId: profile?.memberId ?? '' })
  // The assistant's card is told from the same engine as the wall's (board 06e).
  const planDay = useCallback(
    (date: Date, events: WallEvent[]) => buildDayPlan({ date, members, routines, events, dayOffs, tripState: tripStateFor?.(date) }),
    [members, routines, dayOffs, tripStateFor],
  )
  const { data: contacts = [] } = useSavedContacts()
  const { data: places = [] } = useSavedPlaces()
  const comingUp = useComingUp({ surface: 'phone' })
  // To do is Jake's Reminders list (P3.22 step 7): on his phone only.
  const isJake = members.find((m) => m.id === profile?.memberId)?.name === 'Jake'
  const todos = useTodos({ enabled: isJake, surface: 'phone' })
  return (
    <PhoneView
      now={now}
      viewerId={profile?.memberId ?? ''}
      members={members}
      week={week}
      events={allEvents}
      checklist={checklist}
      tripActions={tripActions}
      onToggleItem={(item) => void toggleChecklistItem(queryClient, item.id, !item.checked)}
      onAddItem={(eventId, label) => addChecklistItem(queryClient, eventId, label)}
      useEventItems={useEventChecklist}
      saveEvent={(event, draft) => saveDraft({ event, draft, members, queryClient })}
      deleteEvent={(event) => deleteCalendarEvent(supabase, queryClient, event.id, event as unknown as EventWithDetails)}
      createEvent={(args) => createEventByTouch(queryClient, args, 'phone')}
      findSimilar={findSimilar}
      scan={(files) => scanDocumentFiles(files, members.map((m) => ({ id: m.id, name: m.name, full_name: m.full_name ?? null })))}
      assistant={({ onClose, onOpenEvent }) => <PhoneAssistant events={allEvents as unknown as EventWithDetails[]} family={members as unknown as FamilyMember[]} members={members} planDay={planDay} onClose={onClose} onOpenEvent={onOpenEvent} />}
      keepFrom={keep}
      setKeptFrom={setKeptFrom}
      contacts={contacts}
      places={places}
      comingUp={comingUp.data ? { items: comingUp.data.items, today: comingUp.data.today, act: comingUp.act, start: comingUp.start } : null}
      todos={isJake && todos.data ? { list: todos.data, act: todos.act, useProject: useTodoProject } : null}
    />
  )
}
