import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildDayPlan } from '../wall/engine/dayPlan'
import type { WallEvent } from '../wall/engine/types'
import { useProfileSession } from '../contexts/useProfileSession'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { deleteCalendarEvent, invalidateAllCalendarQueries } from '../lib/eventMutations'
import { supabase } from '../lib/supabase'
import { saveDraft } from '../wall/saveDraft'
import { draftChanges, previewEvent } from '../wall/editing'
import { holdWhileSaving, PLACE_PENDING, type withChanged } from '../lib/optimisticEvent'
import { createEventByTouch } from '../wall/createEvent'
import { useFamilyDay } from '../wall/useFamilyDay'
import { useMonthEvents } from '../hooks/useCalendarEvents'
import { setChoreDone, useChoreDone } from '../wall/useChoreDone'
import { useTodoProject, useTodoProjectsAhead, useTodos } from '../wall/useTodos'
import { addChecklistItem, toggleChecklistItem, useEventChecklist } from '../wall/useWallChecklist'
import { saveEventNotes } from '../wall/saveNotes'
import { useHowWasIt } from '../wall/useHowWasIt'
import PhoneView from './PhoneView'
import PhoneAssistant from './PhoneAssistant'
import type { FamilyMember } from '../types'
import { useContactDirectory } from '../hooks/useSavedContacts'
import { useSavedPlaces, useSavePlace } from '../hooks/useSavedPlaces'
import { DEFAULT_HOUSEHOLD_COORDINATES } from '../utils/geoDistance'
import { guessKind } from '../wall/placeSuggest'
import type { PlaceSearchResult } from '../wall/places'
import { scanDocumentFiles, type ScannedItem } from '../utils/documentScanner'
import { similarEvent } from './scan'
import { decisionsFor } from '../wall/decisions'
import { casaTopic } from '../wall/casaTalk'
import { useCasaTalk } from '../wall/useCasaTalk'
import { usePhoneGroceries } from './usePhoneGroceries'
import { useQuery } from '@tanstack/react-query'
import type { PastPlace } from './drafts'
import { primePermissionsOnLaunch } from './permissionsPrime'
import { holidayDecisions } from '../wall/holidays'

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

/** The last few months' events that had a place, newest first: "Happy Tails, like last time" on the form (step 5). */
async function fetchPastPlaces(): Promise<PastPlace[]> {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase.from('events').select('title, location_name, address, start_time')
    .is('deleted_at', null).not('location_name', 'is', null).gte('start_time', since).lte('start_time', new Date().toISOString())
    .order('start_time', { ascending: false }).limit(400)
  if (error) throw error
  return (data ?? []) as PastPlace[]
}

/** Any day (canvas 30b): the month's events while the month is open (the sheet is only mounted then). */
function usePhoneMonth(month: Date): WallEvent[] {
  const { data } = useMonthEvents(month)
  return (data ?? []) as unknown as WallEvent[]
}

export default function PhoneFrame() {
  const { profile, signOut } = useProfileSession()
  // The mic and location asked for at launch, so the first talk to Casa isn't held up by iPhone's question (Oct 3).
  useEffect(() => primePermissionsOnLaunch(), [])
  // Something saved behind the screen that didn't take (an instant edit): said once, then gone.
  const [notice, setNotice] = useState<string | null>(null)
  // A far day Casa opened on Me (dayFocus.ts): its week is loaded so it can be swiped through.
  const [aroundDay, setAroundDay] = useState<Date | null>(null)
  const onFocusDay = useCallback((date: Date | null) => setAroundDay((was) => (was?.toDateString() === date?.toDateString() ? was : date)), [])
  const { now, members, week, allEvents, aroundEvents, routines, dayOffs, tripStateFor, tripActions, checklist, queryClient, keep, setKeptFrom, chores } = useFamilyDay({ kind: 'member', memberId: profile?.memberId ?? '' }, aroundDay)
  const howWasIt = useHowWasIt(now, profile?.memberId ?? null)
  const choreDone = useChoreDone(now)
  // The assistant's card is told from the same engine as the wall's (board 06e).
  const planDay = useCallback(
    (date: Date, events: WallEvent[]) => buildDayPlan({ date, members, routines, events, dayOffs, tripState: tripStateFor?.(date), chores }),
    [members, routines, dayOffs, tripStateFor, chores],
  )
  const { data: contacts = [] } = useContactDirectory()
  const groceries = usePhoneGroceries()
  const { data: pastPlaces = [] } = useQuery({ queryKey: ['phone-past-places'], queryFn: fetchPastPlaces, staleTime: 60 * 60_000 })
  const { data: places = [] } = useSavedPlaces()
  const savePlaceMutation = useSavePlace()
  // The event sheet's place search and Save to my places — the wall's own (WallEventSheet).
  const searchPlaces = useCallback(async (query: string): Promise<PlaceSearchResult[]> => {
    const { data } = await supabase.functions.invoke('place-search', { body: { query, lat: DEFAULT_HOUSEHOLD_COORDINATES.lat, lng: DEFAULT_HOUSEHOLD_COORDINATES.lng } })
    const found = (data as { places?: PlaceSearchResult[] } | null)?.places
    return Array.isArray(found) ? found : []
  }, [])
  const savePlace = useCallback(async (r: PlaceSearchResult) => {
    await savePlaceMutation.mutateAsync({ name: r.name, address: r.street || r.address, city: r.city ?? null, state: r.state ?? null, zip: r.zip ?? null, lat: r.lat, lng: r.lng, phone: r.phone ?? null, category: guessKind(r) })
  }, [savePlaceMutation])
  // To do is Jake's Reminders list (P3.22 step 7): on his phone only.
  const isJake = members.find((m) => m.id === profile?.memberId)?.name === 'Jake'
  const todos = useTodos({ enabled: isJake, surface: 'phone' })
  useTodoProjectsAhead(isJake ? (todos.data?.projects ?? []).map((p) => p.id) : [])
  // "Casa wants to talk to you" (canvas 21c): the same one thing as the wall's band, from this week's decisions.
  const talk = useCasaTalk()
  const topic = useMemo(() => casaTopic(
    [
      ...week.flatMap((plan) => decisionsFor(plan, members, now, new Set(Object.keys(tripStateFor?.(plan.date).dismissed ?? {}))).map((d) => ({ ...d, date: plan.date }))),
      // School holidays ahead: "are they off?", then "who has them?" (holidays.ts).
      ...holidayDecisions({ now, routines, dayOffs, members, dismissedOn: (date) => tripStateFor?.(date).dismissed }),
    ],
    (date) => week.find((p) => p.date.toDateString() === date.toDateString()) ?? null,
    members,
    now,
    talk.state,
  ), [week, members, now, tripStateFor, talk.state, routines, dayOffs])
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
      // A hand-off shows at once (the sheet doesn't wait); one that can't be saved says so.
      tripActions={{ ...tripActions, handOff: (trip, driverId, date) => tripActions.handOff(trip, driverId, date).then(() => undefined, () => setNotice(`Couldn’t hand off “${trip.title}”. Try it again.`)) }}
      casaTalk={{ topic, snooze: (key, until) => talk.save({ snoozed: { [key]: until.toISOString() } }) }}
      howWasIt={howWasIt}
      onToggleItem={(item) => void toggleChecklistItem(queryClient, item.id, !item.checked)}
      onAddItem={(eventId, label) => addChecklistItem(queryClient, eventId, label)}
      onSaveNotes={(event, notes) => saveEventNotes(queryClient, event, notes)}
      useEventItems={useEventChecklist}
      // An edit shows at once and the sheet closes; it saves behind (Jake, Oct 2: "experiential responsiveness"). A new
      // place reads "working out the drive…" until its drive is back; if the save fails, the edit undoes itself and says so.
      saveEvent={async (event, draft) => {
        const preview = previewEvent(event, draft)
        const placeMoved = draftChanges(event, draft).some((c) => c.field === 'place')
        const change = (e: Parameters<Parameters<typeof withChanged>[2]>[0]) => ({ ...e, ...preview, ...(placeMoved && draft.place.name ? { [PLACE_PENDING]: true } : {}) }) as typeof e
        void holdWhileSaving(queryClient, event.id, change, saveDraft({ event, draft, members, queryClient })).then(() => invalidateAllCalendarQueries(queryClient, event.id)).catch(() => {
          invalidateAllCalendarQueries(queryClient, event.id)
          setNotice(`That change to “${event.title}” didn’t save. Try it again.`)
        })
      }}
      searchPlaces={searchPlaces}
      savePlace={savePlace}
      notice={notice}
      onNoticeSeen={() => setNotice(null)}
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
      assistant={({ onClose, onOpenEvent, onOpenPlace, onOpenDay, onOpenGroceries, opening, onForm, onScan, glance }) => <PhoneAssistant glance={glance} onForm={onForm} onScan={onScan} onOpenGroceries={onOpenGroceries} opening={opening} events={allEvents as unknown as EventWithDetails[]} family={members as unknown as FamilyMember[]} members={members} planDay={planDay} onClose={onClose} onOpenEvent={onOpenEvent} onOpenPlace={onOpenPlace} onOpenDay={onOpenDay} />}
      planDay={planDay}
      aroundEvents={aroundEvents}
      onFocusDay={onFocusDay}
      keepFrom={keep}
      setKeptFrom={setKeptFrom}
      contacts={contacts}
      places={places}
      groceries={groceries}
      onSignOut={signOut}
      pastPlaces={pastPlaces}
      todos={isJake && todos.data ? { list: todos.data, act: todos.act, useProject: useTodoProject } : null}
    />
  )
}
