// Visual-test only (VITE_VISUAL_TEST_MODE): the Wall drawn from the fixed test
// fixture at the moment given by ?at=, for the screenshot guard (P2.6).
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { buildDayPlan } from './engine/dayPlan'
import type { WallEvent, WallMember } from './engine/types'
import WallView from './WallView'
import { dayState, withDeparted, withHandOff, withoutDeparted, type WallTripState } from './tripState'
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
  const now = new Date(new URLSearchParams(window.location.search).get('at') ?? '2026-09-25T07:12:00')
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  const next = new Date(day)
  next.setDate(next.getDate() + 1)
  // Trip decisions live in memory here (the real wall saves them to settings).
  const [tripState, setTripState] = useState<WallTripState>({})
  const plan = (date: Date) =>
    buildDayPlan({ date, members: members as WallMember[], routines: routines as unknown as FamilyRoutine[], events: events as unknown as WallEvent[], tripState: dayState(tripState, date) })
  const tripActions = {
    leaving: (ids: string[]) => setTripState((s) => withDeparted(s, day, ids, now)),
    undoLeaving: (ids: string[]) => setTripState((s) => withoutDeparted(s, day, ids)),
    handOff: async (trip: { id: string }, driverId: string) => setTripState((s) => withHandOff(s, day, trip.id, driverId)),
  }
  return (
    <QueryClientProvider client={queryClient}>
    <MemoryRouter>
    <Routes>
    <Route path="/calendar" element={<div data-testid="fixture-calendar">Calendar page</div>} />
    <Route path="*" element={
    <div data-testid="wall-fixture" className="h-[1080px] w-[1920px]">
      <WallView now={now} members={members as WallMember[]} today={plan(day)} tomorrow={plan(next)} currentWeather={WEATHER} checklist={CHECKLIST} allEvents={events as unknown as WallEvent[]} routines={routines as unknown as FamilyRoutine[]} tripStateFor={(date) => dayState(tripState, date)} tripActions={tripActions} />
    </div>
    } />
    </Routes>
    </MemoryRouter>
    </QueryClientProvider>
  )
}
