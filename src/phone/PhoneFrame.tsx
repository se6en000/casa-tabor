import { useCallback, useMemo, useState } from 'react'
import { buildDayPlan } from '../wall/engine/dayPlan'
import type { WallEvent } from '../wall/engine/types'
import { useProfileSession } from '../contexts/useProfileSession'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { deleteCalendarEvent } from '../lib/eventMutations'
import { supabase } from '../lib/supabase'
import { saveDraft } from '../wall/saveDraft'
import { createEventByTouch } from '../wall/createEvent'
import { useFamilyDay } from '../wall/useFamilyDay'
import { useMonthEvents } from '../hooks/useCalendarEvents'
import { setChoreDone, useChoreDone } from '../wall/useChoreDone'
import { useComingUp } from '../wall/useComingUp'
import { useTodoProject, useTodos } from '../wall/useTodos'
import { addChecklistItem, toggleChecklistItem, useEventChecklist } from '../wall/useWallChecklist'
import PhoneView from './PhoneView'
import PhoneAssistant from './PhoneAssistant'
import type { FamilyMember } from '../types'
import { useContactDirectory } from '../hooks/useSavedContacts'
import { useSavedPlaces } from '../hooks/useSavedPlaces'
import { scanDocumentFiles, type ScannedItem } from '../utils/documentScanner'
import { similarEvent } from './scan'
import { decisionsFor } from '../wall/decisions'
import { casaTopic } from '../wall/casaTalk'
import { useCasaTalk } from '../wall/useCasaTalk'

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

/** Any day (canvas 30b): the month's events while the month is open (the sheet is only mounted then). */
function usePhoneMonth(month: Date): WallEvent[] {
  const { data } = useMonthEvents(month)
  return (data ?? []) as unknown as WallEvent[]
}

export default function PhoneFrame() {
  const { profile } = useProfileSession()
  // A far day Casa opened on Me (dayFocus.ts): its week is loaded so it can be swiped through.
  const [aroundDay, setAroundDay] = useState<Date | null>(null)
  const onFocusDay = useCallback((date: Date | null) => setAroundDay((was) => (was?.toDateString() === date?.toDateString() ? was : date)), [])
  const { now, members, week, allEvents, aroundEvents, routines, dayOffs, tripStateFor, tripActions, checklist, queryClient, keep, setKeptFrom, chores } = useFamilyDay({ kind: 'member', memberId: profile?.memberId ?? '' }, aroundDay)
  const choreDone = useChoreDone(now)
  // The assistant's card is told from the same engine as the wall's (board 06e).
  const planDay = useCallback(
    (date: Date, events: WallEvent[]) => buildDayPlan({ date, members, routines, events, dayOffs, tripState: tripStateFor?.(date), chores }),
    [members, routines, dayOffs, tripStateFor, chores],
  )
  const { data: contacts = [] } = useContactDirectory()
  const { data: places = [] } = useSavedPlaces()
  const comingUp = useComingUp({ surface: 'phone' })
  // To do is Jake's Reminders list (P3.22 step 7): on his phone only.
  const isJake = members.find((m) => m.id === profile?.memberId)?.name === 'Jake'
  const todos = useTodos({ enabled: isJake, surface: 'phone' })
  // "Casa wants to talk to you" (canvas 21c): the same one thing as the wall's band, from this week's decisions.
  const talk = useCasaTalk()
  const topic = useMemo(() => casaTopic(
    week.flatMap((plan) => decisionsFor(plan, members, now, new Set(Object.keys(tripStateFor?.(plan.date).dismissed ?? {}))).map((d) => ({ ...d, date: plan.date }))),
    (date) => week.find((p) => p.date.toDateString() === date.toDateString()) ?? null,
    members,
    now,
    talk.state,
  ), [week, members, now, tripStateFor, talk.state])
  return (
    <PhoneView
      choreDone={choreDone}
      useMonthEvents={usePhoneMonth}
      onRefresh={() => queryClient.invalidateQueries()}
      tickChore={(id, date, done) => setChoreDone(queryClient, id, date, done)}
      now={now}
      viewerId={profile?.memberId ?? ''}
      members={members}
      routines={routines}
      dayOffs={dayOffs}
      week={week}
      events={allEvents}
      checklist={checklist}
      tripActions={tripActions}
      casaTalk={{ topic, snooze: (key, until) => talk.save({ snoozed: { [key]: until.toISOString() } }) }}
      onToggleItem={(item) => void toggleChecklistItem(queryClient, item.id, !item.checked)}
      onAddItem={(eventId, label) => addChecklistItem(queryClient, eventId, label)}
      useEventItems={useEventChecklist}
      saveEvent={(event, draft) => saveDraft({ event, draft, members, queryClient })}
      deleteEvent={(event) => deleteCalendarEvent(supabase, queryClient, event.id, event as unknown as EventWithDetails)}
      createEvent={(args) => createEventByTouch(queryClient, args, 'phone')}
      applyPlan={async (title, items) => {
        // Scan it's plan (P3.24): the same save as a plan from Ask Casa — Google, and Undo until tomorrow night.
        const { data, error } = await supabase.functions.invoke('execute-ai-action', { body: { tool: 'apply_plan', args: { title, items, surface: 'phone' }, lane: 'touch', client_trace_source: 'phone-scan', confirmed_by_user: true, correlation_id: `phone-scan:${Date.now().toString(36)}` } })
        if (error || (data as { success?: boolean } | null)?.success === false) throw new Error((data as { error?: string } | null)?.error ?? 'That didn’t save.')
        await queryClient.invalidateQueries({ queryKey: ['events'] })
      }}
      findSimilar={findSimilar}
      scan={(files) => scanDocumentFiles(files, members.map((m) => ({ id: m.id, name: m.name, full_name: m.full_name ?? null })))}
      assistant={({ onClose, onOpenEvent, onOpenPlace, onOpenDay, opening }) => <PhoneAssistant opening={opening} events={allEvents as unknown as EventWithDetails[]} family={members as unknown as FamilyMember[]} members={members} planDay={planDay} onClose={onClose} onOpenEvent={onOpenEvent} onOpenPlace={onOpenPlace} onOpenDay={onOpenDay} />}
      planDay={planDay}
      aroundEvents={aroundEvents}
      onFocusDay={onFocusDay}
      keepFrom={keep}
      setKeptFrom={setKeptFrom}
      contacts={contacts}
      places={places}
      comingUp={comingUp.data ? { items: comingUp.data.items, today: comingUp.data.today, act: comingUp.act, start: comingUp.start, ideas: comingUp.data.ideas, editIdea: comingUp.editIdea } : null}
      todos={isJake && todos.data ? { list: todos.data, act: todos.act, useProject: useTodoProject } : null}
    />
  )
}
