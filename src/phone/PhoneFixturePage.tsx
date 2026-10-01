// Visual-test only (VITE_VISUAL_TEST_MODE): the phone drawn from the Wall's fixed test
// fixture at ?at=, as ?viewer= (a member id), for the Playwright guard at 390x844.
import { useMemo, useState } from 'react'
import { ProfileSessionContext } from '../contexts/useProfileSession'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import type { FamilyRoutine } from '../lib/familyRoutines'
import type { FamilyMember } from '../types'
import { fixtureEmail, fixtureEmailSettings, fixtureTurn } from '../wall/assistantFixture'
import PhoneAssistant from './PhoneAssistant'
import { useFixtureFonts } from '../wall/fixtureFonts'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { buildDayPlan } from '../wall/engine/dayPlan'
import type { WallEvent, WallMember } from '../wall/engine/types'
import { dayState, withDeparted, withHandOff, withoutDeparted, type WallTripState } from '../wall/tripState'
import { members, routines as schoolRoutines, events } from '../../tests/fixtures/wall-day-2026-09-25.mjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FIXTURE_DAY_OFFS, WORK_ROUTINES, seedKnown } from '../wall/routineFixture'

const routines = [...(schoolRoutines as unknown as FamilyRoutine[]), ...WORK_ROUTINES]
import PhoneView from './PhoneView'
import PhoneAssistantView from './PhoneAssistantView'
import type { PhoneLine } from './assistant'
import { previewEvent, withDriver } from '../wall/editing'
import { eventsFor, routinesFor, withKeptFrom, type KeepFrom } from '../wall/audience'
import type { ComingUpItem } from '../wall/comingUp'
import { useFixtureTodos } from '../wall/todoFixture'

const CHECKLIST = [
  { id: 'c1', event_id: 'softball', label: 'Glove', checked: true, sort_order: 1 },
  { id: 'c2', event_id: 'softball', label: 'Water bottle', checked: false, sort_order: 2 },
  { id: 'c6', event_id: 'birthday', label: 'Birthday card', checked: false, sort_order: 1 },
]

const PLACES = [{ id: 'p-ferrin', name: 'Ferrin Park', address: '11921 Okeechobee Blvd', city: 'Royal Palm Beach', state: 'FL', zip: '33411' }]
const CONTACTS = [
  { id: 'c1', name: 'Coach Mike', aliases: ['Mike Alvarez'], relationship: "Liv's softball coach", phone: '(561) 555-0101', email: null, address: null, primary_place_id: 'p-ferrin', confirmed: true, occurrence_count: 12, dismissed_at: null },
  { id: 'c2', name: 'Layla Brooks', aliases: [], relationship: "Liv's friend", phone: null, email: null, address: '700 S Rosemary Ave, West Palm Beach, FL', primary_place_id: null, confirmed: true, occurrence_count: 3, dismissed_at: null },
  { id: 'c3', name: 'Meredith', aliases: [], relationship: 'violin teacher', phone: '561-555-0199', email: null, address: null, primary_place_id: null, confirmed: false, occurrence_count: 20, dismissed_at: null },
]

// What the scanner "reads" from any photo in the fixture: a school flyer, two dates.
const SCANNED = {
  summary: 'Palm Beach Public — fall flyer',
  items: [
    { id: 's1', type: 'event' as const, title: 'Palm Beach Public PTO Fall Festival', date: '2026-09-27', start_time_local: '11:00', end_time_local: '15:00', start_time: '', end_time: '', all_day: false, location_name: 'School field', address: '239 Cocoanut Row, Palm Beach, FL', notes: null, selectedMemberIds: ['emme', 'owen'], confidence: 0.92, selected: true },
    { id: 's2', type: 'event' as const, title: 'Picture Day', date: '2026-09-29', start_time_local: null, end_time_local: null, start_time: '', end_time: '', all_day: true, location_name: null, address: null, notes: null, selectedMemberIds: [], confidence: 0.8, selected: true },
  ],
}

// Owen's field-trip flyer (P3.24): the trip, and what to wear and bring as its packing.
const SCANNED_TRIP = {
  summary: 'Owen’s field trip: Peter and the Wolf',
  items: [
    { id: 't1', type: 'event' as const, title: 'Field Trip: Peter and the Wolf', date: '2026-10-01', start_time_local: '09:30', end_time_local: '12:00', start_time: '', end_time: '', all_day: false, location_name: 'Glazer Hall', address: null, notes: 'By bus from school, back for lunch. Questions: Kim Kerry (561) 329-1269', selectedMemberIds: ['owen'], confidence: 0.92, selected: true },
    { id: 't2', type: 'prep' as const, for_title: 'Field Trip: Peter and the Wolf', title: 'Neon pink Kindergarten by the Sea shirt', date: '2026-10-01', start_time_local: null, end_time_local: null, start_time: '', end_time: '', all_day: true, location_name: null, address: null, notes: null, selectedMemberIds: [], confidence: 0.9, selected: true },
    { id: 't3', type: 'prep' as const, for_title: 'Field Trip: Peter and the Wolf', title: 'Packed lunch', date: '2026-10-01', start_time_local: null, end_time_local: null, start_time: '', end_time: '', all_day: true, location_name: null, address: null, notes: null, selectedMemberIds: [], confidence: 0.9, selected: true },
  ],
}

// Say it, scripted: a question gets an answer; "add …" gets a draft that waits for a yes.
function FixtureAssistant({ onClose, onAdd }: { onClose: () => void; onAdd: () => void }) {
  const [lines, setLines] = useState<PhoneLine[]>([])
  const [pending, setPending] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const say = (role: PhoneLine['role'], text: string) => setLines((l) => [...l, { id: `l${l.length}`, role, text }])
  return (
    <PhoneAssistantView
      lines={lines}
      thinking={false}
      pending={pending}
      working={false}
      note={note}
      onSend={(q) => {
        say('user', q)
        setNote(null)
        if (/^add/i.test(q)) {
          say('assistant', 'Here’s the draft. Tap Yes and it goes on the calendar.')
          setPending('Add “Jaida watching the kids” · Sat, Sep 26 · 12 – 3 PM')
        } else say('assistant', 'Kelly drives Liv to Ferrin Park Field 1. Leave by 9:08 for the 9:40 game.')
      }}
      onConfirm={() => { onAdd(); setPending(null); setNote('Done.') }}
      onCancel={() => { setPending(null); setNote('Okay, nothing changed.') }}
      onReport={async (report) => { (window as unknown as { __phoneReports: unknown[] }).__phoneReports = [...((window as unknown as { __phoneReports?: unknown[] }).__phoneReports ?? []), { ...report, lines }] }}
      onClose={onClose}
    />
  )
}

// Coming up (board 07b), dated from the fixture day (Sep 25): Kelly's birthday carries an idea for her.
const COMING_UP: ComingUpItem[] = [
  { key: 'cu-ac', kind: 'appointment', title: 'EDS Air Conditioning appointment', nextStep: 'Make sure it works with work', date: '2026-09-28', pokeOn: '2026-09-21', daysAway: 3, late: true },
  { key: 'cu-columbus', kind: 'no_school', title: 'Columbus Day', nextStep: 'No school? Who’s with the kids', date: '2026-10-12', pokeOn: '2026-09-28', daysAway: 17, late: false },
  { key: 'cu-kelly', kind: 'birthday', title: 'Kelly’s birthday', nextStep: 'Pick a gift', date: '2026-11-20', pokeOn: '2026-09-29', daysAway: 56, late: false, ideas: ['That ceramic class in Delray'], ideasFor: ['kelly'] },
  { key: 'cu-thanks', kind: 'hosting', title: 'Thanksgiving Day', nextStep: 'Hosting or going?', date: '2026-11-26', pokeOn: '2026-10-27', daysAway: 62, late: false },
]

function PhoneFixturePageInner() {
  const fontsReady = useFixtureFonts()
  const params = new URLSearchParams(window.location.search)
  const now = new Date(params.get('at') ?? '2026-09-25T07:12:00')
  const viewerId = params.get('viewer') ?? 'jake-id'
  // To do on Jake's phone (P3.22 step 7): the same list and projects as the wall's fixture.
  const { todos } = useFixtureTodos({ stepEvent: params.get('stepEvent') === '1', closedInside: params.get('closedInside') === '1' })
  const ask = params.get('ask')
  const askTurn = useMemo(() => (ask ? fixtureTurn(ask) : null), [ask])
  const [tripState, setTripState] = useState<WallTripState>({})
  const [checklist, setChecklist] = useState(CHECKLIST)
  const [evs, setEvs] = useState(() => [
    ...(events as unknown as WallEvent[]),
    // `?far=1` (any day): Jake's week around Sat, Oct 17 — weeks past the usual strip.
    ...(params.get('far') ? [
      { id: 'far-build', title: 'Emme’s build night', start_time: new Date(2026, 9, 17, 18, 0).toISOString(), end_time: new Date(2026, 9, 17, 20, 0).toISOString(), all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [{ family_member_id: 'jake-id', role: 'primary' }, { family_member_id: 'emme', role: 'attendee' }] },
      { id: 'far-market', title: 'Green Market', start_time: new Date(2026, 9, 18, 9, 0).toISOString(), end_time: new Date(2026, 9, 18, 11, 0).toISOString(), all_day: false, event_type: 'event', status: 'confirmed', location_name: null, address: null, members: [{ family_member_id: 'jake-id', role: 'primary' }] },
    ] as unknown as WallEvent[] : []),
  ])
  const [keep, setKeep] = useState<KeepFrom>({})
  const [comingUp, setComingUp] = useState(COMING_UP)
  // Gift ideas (one for Kelly: never on her phone), each correctable by hand.
  const [ideas, setIdeas] = useState([{ id: 'gi-kelly', for_name: 'Kelly', for_member_id: 'kelly', idea: 'That ceramic class in Delray' }, { id: 'gi-carl', for_name: 'Carl', for_member_id: null, idea: 'A fly-fishing reel' }])
  // Only what this phone's person may see, as the live phone does (audience.ts).
  const audience = { kind: 'member' as const, memberId: viewerId }
  const shown = eventsFor(audience, evs, members as WallMember[], keep)
  const shownRoutines = routinesFor(audience, routines as unknown as Array<{ memberId: string }>, members as WallMember[])
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + i)
    return buildDayPlan({ date, members: members as WallMember[], routines: shownRoutines as never, events: shown, tripState: dayState(tripState, date) })
  })
  const day = week[0].date
  // Nothing until every font weight is in, so screenshots never catch a fallback face.
  if (!fontsReady) return null
  return (
    <MemoryRouter>
      <Routes>
        <Route path="*" element={
          <div data-testid="phone-fixture" className="h-[844px] w-[390px] overflow-hidden">
            <PhoneView
              useEmailSettingsHook={fixtureEmailSettings}
              now={now}
              viewerId={viewerId}
              members={members as WallMember[]}
              routines={shownRoutines as unknown as FamilyRoutine[]}
              dayOffs={FIXTURE_DAY_OFFS}
              week={week}
              events={shown}
              keepFrom={keep}
              comingUp={{ items: comingUp, today: '2026-09-25', act: async (key) => setComingUp((list) => list.filter((i) => i.key !== key)), ideas,
                editIdea: async (id, idea) => setIdeas((list) => (idea == null ? list.filter((g) => g.id !== id) : list.map((g) => (g.id === id ? { ...g, idea } : g)))) }}
              setKeptFrom={async (eventId, ids) => setKeep((k) => withKeptFrom(k, eventId, ids))}
              todos={viewerId === 'jake-id' ? todos : null}
              checklist={checklist}
              scan={async () => (params.get('scan') === 'trip' ? SCANNED_TRIP : SCANNED)}
              findSimilar={params.get('similar') === 'trip' ? async () => ({ t1: { id: 'school-trip', title: 'Field trip', start_time: new Date(2026, 9, 1, 0, 0).toISOString() } })
                : params.get('similar') ? async () => ({ s1: { id: 'pto', title: 'PTO Fall Festival', start_time: new Date(2026, 8, 27, 11, 0).toISOString() } }) : undefined}
              planDay={(date, list) => buildDayPlan({ date, members: members as WallMember[], routines: shownRoutines as never, events: list, tripState: dayState(tripState, date) })}
              aroundEvents={shown}
              assistant={({ onClose, onOpenEvent, onOpenDay, opening }) => askTurn ? (
                // A canned conversation through the real Ask Casa (design section 06): `?ask=add|change|which|answer`.
                <ProfileSessionContext.Provider value={{ profile: null, unlock: async () => {}, signOut: () => {} }}>
                  <PhoneAssistant
                    events={evs as unknown as EventWithDetails[]}
                    family={members as unknown as FamilyMember[]}
                    members={members as WallMember[]}
                    planDay={(date, list) => buildDayPlan({ date, members: members as WallMember[], routines: routines as unknown as FamilyRoutine[], events: list, tripState: dayState(tripState, date) })}
                    onClose={onClose}
                    onOpenEvent={onOpenEvent}
                    onOpenDay={onOpenDay}
                    useEmail={fixtureEmail as never}
                    useTurn={askTurn}
                    opening={opening}
                    lookupDrive={async () => 24}
                  />
                </ProfileSessionContext.Provider>
              ) : (
                <FixtureAssistant
                  onClose={onClose}
                  onAdd={() => setEvs((list) => [...list, {
                    id: 'jaida-sat', title: 'Jaida watching the kids', event_type: 'event', all_day: false,
                    start_time: new Date('2026-09-26T12:00:00').toISOString(), end_time: new Date('2026-09-26T15:00:00').toISOString(),
                    location_name: null, address: null, members: ['liv', 'emme', 'owen'].map((id) => ({ family_member_id: id, role: 'attendee' })),
                  } as unknown as WallEvent])}
                />
              )}
              contacts={CONTACTS as never}
              places={PLACES as never}
              tripActions={{
                leaving: (ids) => setTripState((s) => withDeparted(s, day, ids, now)),
                undoLeaving: (ids) => setTripState((s) => withoutDeparted(s, day, ids)),
                // Events: the driver goes on the trip plan, as the real save does; school runs: a day hand-off.
                handOff: async (trip, driverId, date = day) => {
                  if (trip.source === 'routine') return setTripState((s) => withHandOff(s, date, trip.id, driverId))
                  const name = (members as WallMember[]).find((m) => m.id === driverId)?.name ?? ''
                  setEvs((list) => list.map((e) => (e.id === trip.sourceId ? { ...e, plan_override: { ...(e.plan_override ?? {}), transportation_plan: withDriver(e as never, e.plan_override?.transportation_plan as never, driverId, name) } } as WallEvent : e)))
                },
              }}
              onToggleItem={(item) => setChecklist((list) => list.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)))}
              onAddItem={async (eventId, label) => setChecklist((list) => [...list, { id: `added-${list.length}`, event_id: eventId, label, checked: false, sort_order: 1 + Math.max(-1, ...list.filter((i) => i.event_id === eventId).map((i) => i.sort_order)) }])}
              saveEvent={async (event, draft) => setEvs((list) => list.map((e) => (e.id === event.id ? previewEvent(event, draft) : e)))}
              deleteEvent={async (event) => setEvs((list) => list.filter((e) => e.id !== event.id))}
              createEvent={async (args) => {
                const id = `added-${Date.now().toString(36)}-${String(args.title).length}`
                setEvs((list) => [...list, {
                  id, title: String(args.title), event_type: String(args.event_type), all_day: Boolean(args.all_day),
                  start_time: String(args.start), end_time: String(args.end),
                  location_name: (args.location as string) ?? null, address: (args.location as string) ?? null,
                  members: (args.members as string[]).map((name) => ({ family_member_id: (members as WallMember[]).find((m) => m.name === name)?.id ?? name, role: 'attendee' })),
                } as unknown as WallEvent])
                return id
              }}
              // Scan it's plan (P3.24): recorded for the tests on window.__scanPlan.
              applyPlan={async (title, items) => { (window as unknown as { __scanPlan?: unknown }).__scanPlan = { title, items } }}
            />
          </div>
        } />
      </Routes>
    </MemoryRouter>
  )
}

// No network in the fixture: what Casa knows is seeded (the casa-memory function's answer), saved places load empty.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
seedKnown(queryClient)

export default function PhoneFixturePage() {
  return (
    <QueryClientProvider client={queryClient}>
      <PhoneFixturePageInner />
    </QueryClientProvider>
  )
}
