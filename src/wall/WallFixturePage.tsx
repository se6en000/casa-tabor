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
import WallEmailReview from './WallEmailReview'
import { emailScene, fixtureEmailAct } from './assistantFixture'
import { useFixtureFonts } from './fixtureFonts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { buildDayPlan } from './engine/dayPlan'
import { buildTrips, type TravelSettings } from './engine/travel'
import type { WallChore } from './engine/chores'
import type { WallEvent, WallMember } from './engine/types'
import WallView from './WallView'
import type { ComingUpItem, GiftIdea } from './comingUp'
import type { TodoProjectDetail } from './todos'
import { numbered, PAINT, pstep, summary, useFixtureTodos } from './todoFixture'
import { WallSpeechContext } from './speechContext'
import { SEASONS } from '../../supabase/functions/_shared/coming-up.mjs'
import { withDriver } from './editing'
import { dayState, withDeparted, withDismissed, withHandOff, withoutDeparted, type WallTripState } from './tripState'
import { members as baseMembers, routines as schoolRoutines, events } from '../../tests/fixtures/wall-day-2026-09-25.mjs'
import { driveEvents, tripEvents } from '../../tests/fixtures/wall-trip-2026-10-07.mjs'
import type { CasaTalkState } from './casaTalk'
import WallQuickAsk from './WallQuickAsk'
import { toImages } from './toImages'
import type { TypedImage } from './typeLine'
import type { FamilyRoutine } from '../lib/familyRoutines'
import { FIXTURE_DAY_OFFS, WORK_ROUTINES, seedKnown } from './routineFixture'

// School, and the parents' work hours (canvas 16a).
const routines = [...(schoolRoutines as unknown as FamilyRoutine[]), ...WORK_ROUTINES]

const WEATHER = { temp: 84, condition: 'Partly cloudy' }
// No network in the fixture: saved places load empty and nothing is ever saved.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
seedKnown(queryClient)
// `?places=1` (canvas row 23): one saved place, as the picker would load it (queries are off in the fixture).
if (new URLSearchParams(window.location.search).get('places')) {
  queryClient.setQueryData(['saved_places'], [
    { id: 'p1', name: 'Royal Palm Beach Commons Park', aliases: [], address: '11600 Poinciana Blvd', city: 'Royal Palm Beach', state: 'FL', zip: '33411', lat: 26.7, lng: -80.2, category: 'sports', notes: null, phone: null, google_place_id: null, confirmed: true, source: 'manual', occurrence_count: 4, last_seen_at: null, dismissed_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
  ])
}
const CHECKLIST = [
  { id: 'c1', event_id: 'softball', label: 'Glove', checked: true, sort_order: 1 },
  { id: 'c2', event_id: 'softball', label: 'Water bottle', checked: false, sort_order: 2 },
  { id: 'c3', event_id: 'softball', label: 'Cleats', checked: false, sort_order: 3 },
  { id: 'c4', event_id: 'baseball', label: 'Glove', checked: false, sort_order: 1 },
  { id: 'c5', event_id: 'baseball', label: 'Cleats', checked: false, sort_order: 2 },
  { id: 'c6', event_id: 'birthday', label: 'Birthday card', checked: false, sort_order: 1 },
]

// Coming up (board 07a), shaped like the live list on 2026-09-27, dated from the fixture day.
const COMING_UP: Array<Omit<ComingUpItem, 'date' | 'pokeOn' | 'daysAway'> & { inDays: number; pokeIn: number }> = [
  { key: 'cu-ac', kind: 'appointment', title: 'EDS Air Conditioning appointment', nextStep: 'Make sure it works with work', inDays: 3, pokeIn: -4, late: true },
  { key: 'cu-columbus', kind: 'no_school', title: 'Columbus Day', nextStep: 'No school? Who’s with the kids', inDays: 15, pokeIn: 0, late: false },
  { key: 'cu-dentist', kind: 'appointment', title: 'Dentist (Dr. Ledakis)', nextStep: 'Make sure it works with work', inDays: 12, pokeIn: 5, late: false },
  { key: 'cu-forms', kind: 'deadline', title: 'Liv’s athletics forms due', nextStep: 'Get it done', inDays: 15, pokeIn: 6, late: false },
  { key: 'cu-carl', kind: 'birthday', title: 'Carl’s birthday', nextStep: 'Pick a gift', inDays: 68, pokeIn: 8, late: false, ideas: ['A fly-fishing reel'] },
  { key: 'cu-thanks', kind: 'hosting', title: 'Thanksgiving', nextStep: 'Hosting or going?', inDays: 60, pokeIn: 30, late: false },
]
// `?comingUp=projects` (P3.23, canvas 10e): a project's dated step on the list, with Open project.
const COMING_UP_PROJECTS: typeof COMING_UP = [
  { key: 'step:st-choose', kind: 'project_step', title: 'Choose the painter and book dates', nextStep: 'Paint the house', inDays: 15, pokeIn: 8, late: false, projectId: 'pr-paint' },
  { key: 'season:christmas_lights:2026', kind: 'season', title: 'Christmas lights', nextStep: 'Lights up before Thanksgiving', inDays: 61, pokeIn: 41, late: false, startable: true, plan: { steps: 7, minutes: 685, first: 'Storage unit run: the lights and wreaths' } },
  ...COMING_UP,
]
// The live list on the kiosk the night of 2026-09-27 (nine items; the fifth once ran under the week strip).
const COMING_UP_LIVE: typeof COMING_UP = [
  { key: 'cu-ac', kind: 'appointment', title: 'EDS Air Conditioning Appointment', nextStep: 'Make sure it works with work', inDays: 3, pokeIn: -4, late: true },
  { key: 'cu-columbus', kind: 'no_school', title: 'Celebrate Columbus Day Holiday', nextStep: 'No school? Who’s with the kids', inDays: 17, pokeIn: 3, late: false },
  { key: 'cu-dentist', kind: 'appointment', title: 'Dentist (Dr. Ledakis)', nextStep: 'Make sure it works with work', inDays: 14, pokeIn: 7, late: false },
  { key: 'cu-cats', kind: 'outing', title: 'Cats & Dogs Exhibition Preview', nextStep: 'Tickets, and who’s going', inDays: 15, pokeIn: 7, late: false },
  { key: 'cu-forms', kind: 'deadline', title: 'Liv BAK Athletics Aktivate System Due', nextStep: 'Get it done', inDays: 17, pokeIn: 10, late: false },
  { key: 'cu-tryouts', kind: 'tryout', title: 'BAK Softball Tryouts', nextStep: 'Check what’s needed and who drives', inDays: 24, pokeIn: 10, late: false },
  { key: 'cu-carl', kind: 'birthday', title: 'Carl’s birthday', nextStep: 'Pick a gift', inDays: 70, pokeIn: 10, late: false, ideas: ['A fly-fishing reel'] },
  { key: 'cu-thanks', kind: 'hosting', title: 'Thanksgiving Day', nextStep: 'Hosting or going?', inDays: 62, pokeIn: 32, late: false },
  { key: 'cu-veterans', kind: 'no_school', title: 'Veterans Day', nextStep: 'No school? Who’s with the kids', inDays: 47, pokeIn: 33, late: false },
]
const IDEAS: GiftIdea[] = [{ id: 'gi-carl', for_name: 'Carl', idea: 'A fly-fishing reel' }, { id: 'gi-jebb', for_name: 'Jebb', idea: 'A soccer-team sweatshirt and T-shirt' }]

// To do (board 09b), shaped like Jake's sorted list on 2026-09-28.
const STEP_EVENT = new URLSearchParams(window.location.search).get('stepEvent') === '1'
// `?trip=1` (canvas 19): Jake's Dallas trip, Oct 7–8, his flights as the work email brought them in; he takes an hour
// at the airport and an Uber (his page's travel settings).
const TRIP = new URLSearchParams(window.location.search).get('trip') === '1'
// `?chores=1`: the household chores as Jake listed them on Oct 1 (chores.ts).
const CHORE_LIST = new URLSearchParams(window.location.search).get('chores') === '1'
  ? [
    { id: 'trash', title: 'Trash to the street', member_id: 'jake-id', for_member_id: null, days_of_week: [1, 4], time_local: '20:00:00', minutes: 10, enabled: true, every_weeks: 1, starts_on: '2026-09-01' },
    { id: 'yard', title: 'Landscaping to the street', member_id: 'jake-id', for_member_id: null, days_of_week: [2], time_local: '20:00:00', minutes: 10, enabled: true, every_weeks: 1, starts_on: '2026-09-01' },
    { id: 'meds', title: 'Give Liv her meds', member_id: null, for_member_id: 'liv', days_of_week: [1, 2, 3, 4, 5], time_local: '19:00:00', minutes: 10, enabled: true, every_weeks: 1, starts_on: '2026-09-01' },
  ]
  : []
// `?drive=1`: a work trip by car, Oct 13–15 (Orlando).
const DRIVE = new URLSearchParams(window.location.search).get('drive') === '1'
const members = TRIP
  ? baseMembers.map((m) => (m.id === 'jake-id' ? { ...m, travel_prefs: { airport_minutes: 60, way: 'uber' } } : m))
  : baseMembers

// The screenshots show Casa's keyboard, as on the kiosk; `?keyboard=device` shows a desktop's.
Object.assign(window, { __casaKeyboard: new URLSearchParams(window.location.search).get('keyboard') ?? 'screen' })

export default function WallFixturePage() {
  const fontsReady = useFixtureFonts()
  const now = new Date(new URLSearchParams(window.location.search).get('at') ?? '2026-09-25T07:12:00')
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  const next = new Date(day)
  next.setDate(next.getDate() + 1)
  // Trip decisions live in memory here (the real wall saves them to settings).
  const [tripState, setTripState] = useState<WallTripState>({})
  // The trip sheets' choices (canvas 19d), in memory here (the real wall keeps them in settings).
  const [travelSettings, setTravelSettings] = useState<Record<string, TravelSettings>>({})
  // Chores (canvas 20), saved in memory here.
  const [CHORES, setChores] = useState<WallChore[]>(CHORE_LIST as WallChore[])
  // `?nobody=1` (board 08a): Jake's portfolio review with nobody on it, as on 2026-09-28.
  const [evs, setEvs] = useState(() => [
    ...(events as unknown as WallEvent[]),
    ...(TRIP ? (tripEvents as unknown as WallEvent[]) : []),
    ...(DRIVE ? (driveEvents as unknown as WallEvent[]) : []),
    ...(new URLSearchParams(window.location.search).get('nobody') ? [{
      id: 'portfolio', title: 'Portfolio trigger review', start_time: new Date(2026, 8, 25, 9, 0).toISOString(), end_time: new Date(2026, 8, 25, 9, 30).toISOString(),
      all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [],
    } as unknown as WallEvent] : []),
    // `?far=1` (any day): the week around Sat, Oct 17 — weeks past the usual strip.
    ...(new URLSearchParams(window.location.search).get('far') ? [
      { id: 'far-dentist', title: 'Owen dentist', start_time: new Date(2026, 9, 15, 15, 30).toISOString(), end_time: new Date(2026, 9, 15, 16, 30).toISOString(), all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [{ family_member_id: 'owen', role: 'primary' }] },
      { id: 'far-build', title: 'Emme’s build night', start_time: new Date(2026, 9, 17, 18, 0).toISOString(), end_time: new Date(2026, 9, 17, 20, 0).toISOString(), all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [{ family_member_id: 'emme', role: 'primary' }] },
      { id: 'far-market', title: 'Green Market', start_time: new Date(2026, 9, 18, 9, 0).toISOString(), end_time: new Date(2026, 9, 18, 11, 0).toISOString(), all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [{ family_member_id: 'kelly', role: 'primary' }] },
    ] as unknown as WallEvent[] : []),
    // `?stepEvent=1` (P3.23): a project step's all-day calendar event today.
    ...(STEP_EVENT ? [{
      id: 'ev-colours', title: 'Paint the house: Pick colours: 3 sample pots', start_time: '2026-09-25T00:00:00Z', end_time: '2026-09-25T23:59:59Z',
      all_day: true, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [],
    } as unknown as WallEvent] : []),
  ])
  const [checklist, setChecklist] = useState(CHECKLIST)
  // `?talk=1` (canvas row 21): "Casa wants to talk to you", its state in memory; what reaches the phones is recorded.
  const [talkState, setTalkState] = useState<CasaTalkState>({})
  const casaTalk = new URLSearchParams(window.location.search).get('talk') === '1' ? {
    state: talkState,
    ready: true,
    save: async (change: CasaTalkState) => setTalkState((was) => ({ snoozed: { ...was.snoozed, ...change.snoozed }, pushed: { ...was.pushed, ...change.pushed } })),
    push: async (message: { title: string; body: string }) => { (window as unknown as { __casaPushed?: unknown[] }).__casaPushed = [...((window as unknown as { __casaPushed?: unknown[] }).__casaPushed ?? []), message] },
  } : null
  const plan = (date: Date) =>
    buildDayPlan({ date, members: members as WallMember[], routines, events: evs, tripState: dayState(tripState, date), travelSettings, chores: CHORES })
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
  // `?quick=1&keyboard=device` (canvas 22c): Casa closed; typing or pasting anywhere opens it.
  const quickOn = new URLSearchParams(window.location.search).get('quick') === '1'
  const useTurn = useMemo(() => (scene ? fixtureTurn(scene) : quickOn ? fixtureTurn('empty') : null), [scene, quickOn])
  const [bandOpen, setBandOpen] = useState(Boolean(scene))
  const [opening, setOpening] = useState<{ text: string; nonce: number } | null>(null)
  const [staged, setStaged] = useState<{ text: string; images: TypedImage[]; nonce: number } | null>(null)
  const [talking, setTalking] = useState(false)
  const [assistantDraft, setAssistantDraft] = useState<WallEvent | null>(null)
  const [pointAt, setPointAt] = useState<string | null>(null)
  const [openRequest, setOpenRequest] = useState<{ day?: string; todo?: boolean; nonce: number } | null>(() => (new URLSearchParams(window.location.search).get('open') === 'todo' ? { todo: true, nonce: 1 } : null))
  // Casa reads the email (canvas rows 14–15): `?email=1|posted|ask|textoff`.
  const emailOn = new URLSearchParams(window.location.search).has('email')
  const emailData = useMemo(() => emailScene(), [])
  const [emailOpen, setEmailOpen] = useState(false)
  const review = emailOn && emailOpen ? <WallEmailReview data={emailData} act={fixtureEmailAct} onClose={() => setEmailOpen(false)} today="2026-09-25" computer={new URLSearchParams(window.location.search).get('keyboard') === 'device'} /> : null
  const band = useTurn && bandOpen ? (
    <ProfileSessionContext.Provider value={{ profile: null, unlock: async () => {}, signOut: () => {} }}>
      <WallAssistantBand
        listenNonce={0}
        events={evs as unknown as EventWithDetails[]}
        family={members as unknown as FamilyMember[]}
        onClose={() => setBandOpen(false)}
        onPointAt={setPointAt}
        onOpenEvent={() => setBandOpen(false)}
        onOpenPlace={() => setBandOpen(false)}
        onOpenDay={(date) => { setBandOpen(false); setOpenRequest({ day: date.toISOString(), nonce: Date.now() }) }}
        viaWake={new URLSearchParams(window.location.search).get('wake') === '1'}
        members={members as WallMember[]}
        planDay={(date, list) => buildDayPlan({ date, members: members as WallMember[], routines, events: list, tripState: dayState(tripState, date), travelSettings, chores: CHORES })}
        onDraft={setAssistantDraft}
        useTurn={useTurn}
        useSpeech={useFixtureSpeech}
        // The LED strip, as the wall would drive it (P3.14): recorded for the tests.
        onLed={recordLed}
        onOutcome={recordOutcome}
        onTalking={setTalking}
        lookupDrive={async () => 24}
        opening={opening}
        staged={staged}
      />
    </ProfileSessionContext.Provider>
  ) : null
  const ymd = (offset: number) => { const d = new Date(day); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const [comingUpItems, setComingUpItems] = useState<ComingUpItem[]>(() => ({ live: COMING_UP_LIVE, projects: COMING_UP_PROJECTS }[new URLSearchParams(window.location.search).get('comingUp') ?? ''] ?? COMING_UP).map(({ inDays, pokeIn, ...rest }) => ({ ...rest, date: ymd(inDays), pokeOn: ymd(pokeIn), daysAway: inDays })))
  const { todos, setProjects, setTodoList } = useFixtureTodos({ stepEvent: STEP_EVENT, twoInside: new URLSearchParams(window.location.search).get('twoInside') === '1', closedInside: new URLSearchParams(window.location.search).get('closedInside') === '1' })
  // A season started (canvas 11c): this year's project from the same starter plan the server uses.
  const start = async (key: string) => {
    const [, id, year] = key.split(':')
    const season = SEASONS.find((x) => x.id === id)
    if (!season?.template) return null
    const pid = `pr-${id}-${year}`
    const detail: TodoProjectDetail = {
      project: { ...PAINT.project, id: pid, title: season.title, aim_date: season.date(Number(year)), aim_firm: true, budget_cents: null, yearly: true, season_id: `${id}:${year}`, notes: null, created_at: now.toISOString(), people: [{ name: 'Me' }, { name: 'Kelly' }] },
      steps: numbered(season.template.map((t, i) => pstep(`${pid}-${i}`, t.grp, t.title, { minutes: t.minutes ?? null, repeat_minutes: t.repeat_minutes ?? null, repeat_count: t.repeat_count ?? null, repeat_unit: t.repeat_unit ?? null }))),
      parent: null,
      others: [],
    }
    setProjects((all) => ({ ...all, [pid]: detail }))
    setTodoList((l) => ({ ...l, projects: [...l.projects, summary(detail)] }))
    setComingUpItems((list) => list.map((i) => (i.key === key ? { ...i, startable: false, projectId: pid, nextStep: `A project · 0 of ${detail.steps.length}` } : i)))
    return pid
  }
  const [ideas, setIdeas] = useState(IDEAS)
  const comingUp = { items: comingUpItems, ideas, today: ymd(0), act: async (key: string) => setComingUpItems((list) => list.filter((i) => i.key !== key)), start,
    editIdea: async (id: string, idea: string | null) => setIdeas((list) => (idea == null ? list.filter((g) => g.id !== id) : list.map((g) => (g.id === id ? { ...g, idea } : g)))) }
  const week = [0, 1, 2, 3, 4, 5, 6].map((i) => { const d = new Date(day); d.setDate(d.getDate() + i); return plan(d) })
  // Nothing until every font weight is in, so screenshots never catch a fallback face.
  if (!fontsReady) return null
  return (
    <QueryClientProvider client={queryClient}>
    <MemoryRouter>
    <Routes>
    <Route path="/calendar" element={<div data-testid="fixture-calendar">Calendar page</div>} />
    <Route path="*" element={
    <WallSpeechContext.Provider value={useFixtureSpeech}>
    <div data-testid="wall-fixture" className="relative h-[1080px] w-[1920px]">
      <WallView now={now} members={members as WallMember[]} today={plan(day)} tomorrow={plan(next)} currentWeather={WEATHER} checklist={checklist} allEvents={evs} routines={routines} dayOffs={FIXTURE_DAY_OFFS} tripStateFor={(date) => dayState(tripState, date)} tripActions={tripActions} week={week} aroundEvents={evs} openRequest={openRequest} emailCount={emailOn ? emailData.count : 0} onOpenEmail={emailOn ? () => setEmailOpen(true) : undefined} onAsk={(say) => { (window as unknown as { __asked?: string | null }).__asked = typeof say === 'string' ? say : null }} overlay={review ?? band} busy={Boolean(review) || (Boolean(band) && talking)} pointAt={band ? pointAt : null} assistantDraft={band ? assistantDraft : null} deleteEvent={async (event) => setEvs((list) => list.filter((e) => e.id !== event.id))}
        createEvent={async (args) => setEvs((list) => [...list, {
          id: `added-${list.length}`, title: String(args.title), event_type: String(args.event_type), all_day: false,
          start_time: String(args.start), end_time: String(args.end),
          location_name: (args.location as string) ?? null, address: (args.location as string) ?? null,
          members: (args.members as string[]).map((name) => ({ family_member_id: (members as WallMember[]).find((m) => m.name === name)?.id ?? name, role: 'attendee' })),
        } as unknown as WallEvent])} travelTrips={buildTrips(evs, members as WallMember[], {}, travelSettings)} chores={CHORES} saveChore={async (chore) => setChores((list) => (chore.id ? list.map((c) => (c.id === chore.id ? chore : c)) : [...list, { ...chore, id: `new-${list.length}` }]))} deleteChore={async (id) => setChores((list) => list.filter((c) => c.id !== id))} saveTravel={async (key, change) => setTravelSettings((all) => ({ ...all, [key]: { ...(all[key] ?? {}), ...change } }))} toggleChecklist={(item) => setChecklist((list) => list.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)))} addChecklist={async (eventId, label) => setChecklist((list) => [...list, { id: `added-${list.length}`, event_id: eventId, label, checked: false, sort_order: 1 + Math.max(-1, ...list.filter((i) => i.event_id === eventId).map((i) => i.sort_order)) }])} comingUp={comingUp} todos={todos} casaTalk={casaTalk} />
      {quickOn && (
        <WallQuickAsk
          enabled={!bandOpen}
          onSend={(text) => { setOpening({ text, nonce: Date.now() }); setBandOpen(true) }}
          onPasteFiles={(files) => void toImages(files).then((images) => { setStaged({ text: '', images, nonce: Date.now() }); setBandOpen(true) })}
        />
      )}
    </div>
    </WallSpeechContext.Provider>
    } />
    </Routes>
    </MemoryRouter>
    </QueryClientProvider>
  )
}
