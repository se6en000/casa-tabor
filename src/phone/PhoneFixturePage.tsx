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
            />
          </div>
        } />
      </Routes>
    </MemoryRouter>
  )
}
