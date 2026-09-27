// Visual-test only (VITE_VISUAL_TEST_MODE): the Wall drawn from the fixed test
// fixture at the moment given by ?at=, for the screenshot guard (P2.6).
import { useCallback, useMemo, useState } from 'react'
import { isLedNight, wallLedMode } from './led'
import type { BandState } from './assistant'
import { ProfileSessionContext } from '../contexts/useProfileSession'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import type { FamilyMember } from '../types'
import { fixtureTurn, useFixtureSpeech } from './assistantFixture'
import WallAssistantBand from './WallAssistantBand'
import { useFixtureFonts } from './fixtureFonts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { buildDayPlan } from './engine/dayPlan'
import type { WallEvent, WallMember } from './engine/types'
import WallView from './WallView'
import { withDriver } from './editing'
import { dayState, withDeparted, withDismissed, withHandOff, withoutDeparted, type WallTripState } from './tripState'
import { members, routines, events } from '../../tests/fixtures/wall-day-2026-09-25.mjs'
import type { FamilyRoutine } from '../lib/familyRoutines'

const WEATHER = { temp: 84, condition: 'Partly cloudy' }
// No network in the fixture: saved places load empty and nothing is ever saved.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
const CHECKLIST = [
  { id: 'c1', event_id: 'softball', label: 'Glove', checked: true, sort_order: 1 },
  { id: 'c2', event_id: 'softball', label: 'Water bottle', checked: false, sort_order: 2 },
  { id: 'c3', event_id: 'softball', label: 'Cleats', checked: false, sort_order: 3 },
  { id: 'c4', event_id: 'baseball', label: 'Glove', checked: false, sort_order: 1 },
  { id: 'c5', event_id: 'baseball', label: 'Cleats', checked: false, sort_order: 2 },
  { id: 'c6', event_id: 'birthday', label: 'Birthday card', checked: false, sort_order: 1 },
]

export default function WallFixturePage() {
  const fontsReady = useFixtureFonts()
  const now = new Date(new URLSearchParams(window.location.search).get('at') ?? '2026-09-25T07:12:00')
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  const next = new Date(day)
  next.setDate(next.getDate() + 1)
  // Trip decisions live in memory here (the real wall saves them to settings).
  const [tripState, setTripState] = useState<WallTripState>({})
  const [evs, setEvs] = useState(events as unknown as WallEvent[])
  const [checklist, setChecklist] = useState(CHECKLIST)
  const plan = (date: Date) =>
    buildDayPlan({ date, members: members as WallMember[], routines: routines as unknown as FamilyRoutine[], events: evs, tripState: dayState(tripState, date) })
  const tripActions = {
    leaving: (ids: string[]) => setTripState((s) => withDeparted(s, day, ids, now)),
    undoLeaving: (ids: string[]) => setTripState((s) => withoutDeparted(s, day, ids)),
    handOff: async (trip: { id: string; source: string; sourceId: string }, driverId: string, date: Date = day) => {
      if (trip.source === 'routine') return setTripState((s) => withHandOff(s, date, trip.id, driverId))
      // Events: the driver goes on the trip plan, as the real save does.
      const name = members.find((m) => m.id === driverId)?.name ?? ''
      setEvs((list) => list.map((e) => (e.id === trip.sourceId
        ? { ...e, plan_override: { ...(e.plan_override ?? {}), transportation_plan: withDriver(e, e.plan_override?.transportation_plan as never, driverId, name) as never } }
        : e)))
    },
    dismiss: async (date: Date, key: string) => setTripState((s) => withDismissed(s, date, key)),
  }
  // The assistant band with a canned conversation (design section 06): `?band=add|change|which|answer`.
  const ledLog = ((window as unknown as { __led?: { mode: string; outcomes: string[] } }).__led ??= { mode: 'off', outcomes: [] })
  const recordLed = useCallback((b: { state: BandState; micOpen: boolean }) => {
    ledLog.mode = wallLedMode({ bandOpen: true, bandState: b.state, micOpen: b.micOpen, night: isLedNight(now), glowEnabled: true })
  }, [ledLog, now])
  const recordOutcome = useCallback((kind: 'confirm' | 'cancel') => { ledLog.outcomes.push(kind) }, [ledLog])
  const scene = new URLSearchParams(window.location.search).get('band')
  const useTurn = useMemo(() => (scene ? fixtureTurn(scene) : null), [scene])
  const [bandOpen, setBandOpen] = useState(true)
  const [assistantDraft, setAssistantDraft] = useState<WallEvent | null>(null)
  const [pointAt, setPointAt] = useState<string | null>(null)
  const band = useTurn && bandOpen ? (
    <ProfileSessionContext.Provider value={{ profile: null, unlock: async () => {}, signOut: () => {} }}>
      <WallAssistantBand
        listenNonce={0}
        events={evs as unknown as EventWithDetails[]}
        family={members as unknown as FamilyMember[]}
        onClose={() => setBandOpen(false)}
        onPointAt={setPointAt}
        onOpenEvent={() => setBandOpen(false)}
        members={members as WallMember[]}
        planDay={(date, list) => buildDayPlan({ date, members: members as WallMember[], routines: routines as unknown as FamilyRoutine[], events: list, tripState: dayState(tripState, date) })}
        onDraft={setAssistantDraft}
        useTurn={useTurn}
        useSpeech={useFixtureSpeech}
        // The LED strip, as the wall would drive it (P3.14): recorded for the tests.
        onLed={recordLed}
        onOutcome={recordOutcome}
        lookupDrive={async () => 24}
      />
    </ProfileSessionContext.Provider>
  ) : null
  const week = [0, 1, 2, 3, 4, 5, 6].map((i) => { const d = new Date(day); d.setDate(d.getDate() + i); return plan(d) })
  // Nothing until every font weight is in, so screenshots never catch a fallback face.
  if (!fontsReady) return null
  return (
    <QueryClientProvider client={queryClient}>
    <MemoryRouter>
    <Routes>
    <Route path="/calendar" element={<div data-testid="fixture-calendar">Calendar page</div>} />
    <Route path="*" element={
    <div data-testid="wall-fixture" className="h-[1080px] w-[1920px]">
      <WallView now={now} members={members as WallMember[]} today={plan(day)} tomorrow={plan(next)} currentWeather={WEATHER} checklist={checklist} allEvents={evs} routines={routines as unknown as FamilyRoutine[]} tripStateFor={(date) => dayState(tripState, date)} tripActions={tripActions} week={week} onAsk={() => {}} overlay={band} pointAt={band ? pointAt : null} assistantDraft={band ? assistantDraft : null} deleteEvent={async (event) => setEvs((list) => list.filter((e) => e.id !== event.id))}
        createEvent={async (args) => setEvs((list) => [...list, {
          id: `added-${list.length}`, title: String(args.title), event_type: String(args.event_type), all_day: false,
          start_time: String(args.start), end_time: String(args.end),
          location_name: (args.location as string) ?? null, address: (args.location as string) ?? null,
          members: (args.members as string[]).map((name) => ({ family_member_id: (members as WallMember[]).find((m) => m.name === name)?.id ?? name, role: 'attendee' })),
        } as unknown as WallEvent])} toggleChecklist={(item) => setChecklist((list) => list.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)))} />
    </div>
    } />
    </Routes>
    </MemoryRouter>
    </QueryClientProvider>
  )
}
