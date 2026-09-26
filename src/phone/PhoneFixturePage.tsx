// Visual-test only (VITE_VISUAL_TEST_MODE): the phone drawn from the Wall's fixed test
// fixture at ?at=, as ?viewer= (a member id), for the Playwright guard at 390x844.
import { useState } from 'react'
import { useFixtureFonts } from '../wall/fixtureFonts'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { buildDayPlan } from '../wall/engine/dayPlan'
import type { WallEvent, WallMember } from '../wall/engine/types'
import { dayState, withDeparted, withHandOff, withoutDeparted, type WallTripState } from '../wall/tripState'
import { members, routines, events } from '../../tests/fixtures/wall-day-2026-09-25.mjs'
import PhoneView from './PhoneView'
import { previewEvent, withDriver } from '../wall/editing'

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
    { id: 's1', type: 'event' as const, title: 'PTO Fall Festival', date: '2026-09-27', start_time_local: '11:00', end_time_local: '15:00', start_time: '', end_time: '', all_day: false, location_name: 'Palm Beach Public', address: null, notes: null, selectedMemberIds: ['emme', 'owen'], confidence: 0.92, selected: true },
    { id: 's2', type: 'event' as const, title: 'Picture Day', date: '2026-09-29', start_time_local: null, end_time_local: null, start_time: '', end_time: '', all_day: true, location_name: null, address: null, notes: null, selectedMemberIds: [], confidence: 0.8, selected: true },
  ],
}

export default function PhoneFixturePage() {
  const fontsReady = useFixtureFonts()
  const params = new URLSearchParams(window.location.search)
  const now = new Date(params.get('at') ?? '2026-09-25T07:12:00')
  const viewerId = params.get('viewer') ?? 'jake-id'
  const [tripState, setTripState] = useState<WallTripState>({})
  const [checklist, setChecklist] = useState(CHECKLIST)
  const [evs, setEvs] = useState(events as unknown as WallEvent[])
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + i)
    return buildDayPlan({ date, members: members as WallMember[], routines: routines as never, events: evs, tripState: dayState(tripState, date) })
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
              now={now}
              viewerId={viewerId}
              members={members as WallMember[]}
              week={week}
              events={evs}
              checklist={checklist}
              scan={async () => SCANNED}
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
              saveEvent={async (event, draft) => setEvs((list) => list.map((e) => (e.id === event.id ? previewEvent(event, draft) : e)))}
              deleteEvent={async (event) => setEvs((list) => list.filter((e) => e.id !== event.id))}
              createEvent={async (args) => setEvs((list) => [...list, {
                id: `added-${list.length}`, title: String(args.title), event_type: String(args.event_type), all_day: Boolean(args.all_day),
                start_time: String(args.start), end_time: String(args.end),
                location_name: (args.location as string) ?? null, address: (args.location as string) ?? null,
                members: (args.members as string[]).map((name) => ({ family_member_id: (members as WallMember[]).find((m) => m.name === name)?.id ?? name, role: 'attendee' })),
              } as unknown as WallEvent])}
            />
          </div>
        } />
      </Routes>
    </MemoryRouter>
  )
}
