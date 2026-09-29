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
import type { ComingUpItem, GiftIdea } from './comingUp'
import { applyProjectEdit, type TodoAction, type TodoItem, type TodoList, type TodoProjectDetail } from './todos'
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

// Coming up (board 07a), shaped like the live list on 2026-09-27, dated from the fixture day.
const COMING_UP: Array<Omit<ComingUpItem, 'date' | 'pokeOn' | 'daysAway'> & { inDays: number; pokeIn: number }> = [
  { key: 'cu-ac', kind: 'appointment', title: 'EDS Air Conditioning appointment', nextStep: 'Make sure it works with work', inDays: 3, pokeIn: -4, late: true },
  { key: 'cu-columbus', kind: 'no_school', title: 'Columbus Day', nextStep: 'No school? Who’s with the kids', inDays: 15, pokeIn: 0, late: false },
  { key: 'cu-dentist', kind: 'appointment', title: 'Dentist (Dr. Ledakis)', nextStep: 'Make sure it works with work', inDays: 12, pokeIn: 5, late: false },
  { key: 'cu-forms', kind: 'deadline', title: 'Liv’s athletics forms due', nextStep: 'Get it done', inDays: 15, pokeIn: 6, late: false },
  { key: 'cu-carl', kind: 'birthday', title: 'Carl’s birthday', nextStep: 'Pick a gift', inDays: 68, pokeIn: 8, late: false, ideas: ['A fly-fishing reel'] },
  { key: 'cu-thanks', kind: 'hosting', title: 'Thanksgiving', nextStep: 'Hosting or going?', inDays: 60, pokeIn: 30, late: false },
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
const IDEAS: GiftIdea[] = [{ for_name: 'Carl', idea: 'A fly-fishing reel' }, { for_name: 'Jebb', idea: 'A soccer-team sweatshirt and T-shirt' }]

// To do (board 09b), shaped like Jake's sorted list on 2026-09-28.
const todoItem = (id: string, title: string, extra: Partial<TodoItem>): TodoItem => ({ id, title, shape: 'quick', minutes: null, costCents: null, nextStep: null, needs: [], due: null, overdue: false, snoozedUntil: null, snoozeCount: 0, projectId: null, suggestion: null, ...extra })
const TODOS: TodoList = {
  nextUp: [
    todoItem('td-gfi', 'Replace the outside GFI outlet', { shape: 'fix', minutes: 30, costCents: 2000, nextStep: 'Turn off the power to the outside outlet at the breaker', needs: ['Safety', 'Buy'] }),
    todoItem('td-vet', 'Bring Gilbert to the vet', { minutes: 15, nextStep: 'Call the vet to book a visit', needs: ['Call'], due: '2026-08-24', overdue: true }),
    todoItem('td-tire', 'Replace tire sensor', { shape: 'fix', minutes: 15, costCents: 5000, nextStep: 'Call a tire shop for a quote', needs: ['Call', 'Needs a pro'] }),
    todoItem('td-anthony', 'Call Anthony about house insurance alternatives', { minutes: 15, nextStep: 'Call Anthony', needs: ['Call'] }),
  ],
  groups: {
    quick: [
      todoItem('td-windshield', 'Look up replacing the Tesla windshield and an insurance rebate', { minutes: 20, needs: ['Look-up'] }),
      todoItem('td-pool', 'Look for a cable to fix the pool', { minutes: 15, needs: ['Look-up', 'Buy'] }),
    ],
    fix: [
      todoItem('td-heater', 'Troubleshoot the water heater E05 error', { shape: 'fix', minutes: 30, nextStep: 'Look up E05 for this model', needs: ['Hot water'] }),
      todoItem('td-arlo', 'Install the Arlo camera with solar', { shape: 'fix', minutes: 60, needs: ['Daylight'] }),
    ],
    nudge: [
      todoItem('td-trash', 'Trash out to the street', { shape: 'nudge', minutes: 5, due: '2026-09-25', dueAt: new Date(2026, 8, 25, 20, 0).toISOString() }),
      todoItem('td-tub', 'Run the washing machine tub clean', { shape: 'nudge', minutes: 30 }),
    ],
    dated: [],
    unsorted: [],
  },
  projects: [{ id: 'pr-paint', title: 'Paint the house', done: 1, total: 5, next: 'Get 3 painter quotes', nextEventId: 'td-paint', aimDate: '2026-11-26' }],
  suggestions: [
    { id: 'td-cupcakes', title: 'Pick up Owen’s birthday cupcakes', kind: 'done', reason: 'Owen’s birthday was in July', with: null, withTitle: null },
    { id: 'td-heater2', title: 'Troubleshoot the water heater E05 error', kind: 'merge', reason: 'Same thing', with: 'td-heater', withTitle: 'Troubleshoot the water heater E05 error' },
    { id: 'td-towels', title: 'Paper towels', kind: 'shopping', reason: 'A grocery', with: null, withTitle: null },
  ],
}

const PAINT: TodoProjectDetail = {
  project: { id: 'pr-paint', title: 'Paint the house', aim_date: '2026-11-26', status: 'active' },
  steps: [
    { id: 'st1', position: 1, title: 'Fix the wall cracks', minutes: 240, cost_cents: 5000, done_at: '2026-09-24T12:00:00Z', reminder_event_id: null },
    { id: 'st2', position: 2, title: 'Get 3 painter quotes', minutes: 60, cost_cents: null, done_at: null, reminder_event_id: 'td-paint' },
    { id: 'st3', position: 3, title: 'Pick colours — buy 3 sample pots', minutes: 60, cost_cents: 4000, done_at: null, reminder_event_id: null },
    { id: 'st4', position: 4, title: 'Choose the painter and book dates', minutes: 30, cost_cents: null, done_at: null, reminder_event_id: null },
    { id: 'st5', position: 5, title: 'Move patio furniture, cover plants', minutes: 60, cost_cents: null, done_at: null, reminder_event_id: null },
  ],
}

export default function WallFixturePage() {
  const fontsReady = useFixtureFonts()
  const now = new Date(new URLSearchParams(window.location.search).get('at') ?? '2026-09-25T07:12:00')
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  const next = new Date(day)
  next.setDate(next.getDate() + 1)
  // Trip decisions live in memory here (the real wall saves them to settings).
  const [tripState, setTripState] = useState<WallTripState>({})
  // `?nobody=1` (board 08a): Jake's portfolio review with nobody on it, as on 2026-09-28.
  const [evs, setEvs] = useState(() => [
    ...(events as unknown as WallEvent[]),
    ...(new URLSearchParams(window.location.search).get('nobody') ? [{
      id: 'portfolio', title: 'Portfolio trigger review', start_time: new Date(2026, 8, 25, 9, 0).toISOString(), end_time: new Date(2026, 8, 25, 9, 30).toISOString(),
      all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [],
    } as unknown as WallEvent] : []),
  ])
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
  const ymd = (offset: number) => { const d = new Date(day); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const [comingUpItems, setComingUpItems] = useState<ComingUpItem[]>(() => (new URLSearchParams(window.location.search).get('comingUp') === 'live' ? COMING_UP_LIVE : COMING_UP).map(({ inDays, pokeIn, ...rest }) => ({ ...rest, date: ymd(inDays), pokeOn: ymd(pokeIn), daysAway: inDays })))
  const [todoList, setTodoList] = useState<TodoList>(TODOS)
  const [projects, setProjects] = useState<Record<string, TodoProjectDetail>>({ 'pr-paint': PAINT })
  const todos = {
    list: todoList,
    useProject: (id: string | null) => ({ data: id ? projects[id] ?? null : null }),
    act: async (r: TodoAction) => {
      if (r.action === 'project_edit') return setProjects((all) => ({ ...all, [r.id]: applyProjectEdit(all[r.id], r.op, r.args) }))
      if (r.action === 'update') {
        const change = (i: TodoItem) => (i.id === r.id ? { ...i, ...(r.patch.title ? { title: r.patch.title } : {}), ...('due' in r.patch ? { due: r.patch.due ?? null } : {}) } : i)
        return setTodoList((l) => ({ ...l, nextUp: l.nextUp.map(change), groups: Object.fromEntries(Object.entries(l.groups).map(([k, v]) => [k, v.map(change)])) as TodoList['groups'] }))
      }
      return setTodoList((l) => ({
      ...l,
      nextUp: l.nextUp.filter((i) => i.id !== r.id),
      groups: r.action === 'snooze' ? l.groups : (Object.fromEntries(Object.entries(l.groups).map(([k, v]) => [k, v.filter((i) => i.id !== r.id)])) as TodoList['groups']),
      suggestions: l.suggestions.filter((sg) => sg.id !== r.id),
      }))
    },
  }
  const comingUp = { items: comingUpItems, ideas: IDEAS, today: ymd(0), act: async (key: string) => setComingUpItems((list) => list.filter((i) => i.key !== key)) }
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
        } as unknown as WallEvent])} toggleChecklist={(item) => setChecklist((list) => list.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)))} comingUp={comingUp} todos={todos} />
    </div>
    } />
    </Routes>
    </MemoryRouter>
    </QueryClientProvider>
  )
}
