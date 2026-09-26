// Visual-test only (VITE_VISUAL_TEST_MODE): the phone drawn from the Wall's fixed test
// fixture at ?at=, as ?viewer= (a member id), for the Playwright guard at 390x844.
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { buildDayPlan } from '../wall/engine/dayPlan'
import type { WallEvent, WallMember } from '../wall/engine/types'
import { dayState, withDeparted, withHandOff, withoutDeparted, type WallTripState } from '../wall/tripState'
import { members, routines, events } from '../../tests/fixtures/wall-day-2026-09-25.mjs'
import PhoneView from './PhoneView'

const CHECKLIST = [
  { id: 'c1', event_id: 'softball', label: 'Glove', checked: true, sort_order: 1 },
  { id: 'c2', event_id: 'softball', label: 'Water bottle', checked: false, sort_order: 2 },
  { id: 'c6', event_id: 'birthday', label: 'Birthday card', checked: false, sort_order: 1 },
]

export default function PhoneFixturePage() {
  const params = new URLSearchParams(window.location.search)
  const now = new Date(params.get('at') ?? '2026-09-25T07:12:00')
  const viewerId = params.get('viewer') ?? 'jake-id'
  const [tripState, setTripState] = useState<WallTripState>({})
  const [checklist, setChecklist] = useState(CHECKLIST)
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + i)
    return buildDayPlan({ date, members: members as WallMember[], routines: routines as never, events: events as unknown as WallEvent[], tripState: dayState(tripState, date) })
  })
  const day = week[0].date
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
              events={events as unknown as WallEvent[]}
              checklist={checklist}
              tripActions={{
                leaving: (ids) => setTripState((s) => withDeparted(s, day, ids, now)),
                undoLeaving: (ids) => setTripState((s) => withoutDeparted(s, day, ids)),
                handOff: async (trip, driverId) => setTripState((s) => withHandOff(s, day, trip.id, driverId)),
              }}
              onToggleItem={(item) => setChecklist((list) => list.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)))}
            />
          </div>
        } />
      </Routes>
    </MemoryRouter>
  )
}
