// Visual-test only (VITE_VISUAL_TEST_MODE): the Wall drawn from the fixed test
// fixture at the moment given by ?at=, for the screenshot guard (P2.6).
import { buildDayPlan } from './engine/dayPlan'
import type { WallEvent, WallMember } from './engine/types'
import WallView from './WallView'
import { members, routines, events } from '../../tests/fixtures/wall-day-2026-09-25.mjs'
import type { FamilyRoutine } from '../lib/familyRoutines'

const WEATHER = { temp: 84, condition: 'Partly cloudy' }

export default function WallFixturePage() {
  const now = new Date(new URLSearchParams(window.location.search).get('at') ?? '2026-09-25T07:12:00')
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  const next = new Date(day)
  next.setDate(next.getDate() + 1)
  const plan = (date: Date) =>
    buildDayPlan({ date, members: members as WallMember[], routines: routines as unknown as FamilyRoutine[], events: events as unknown as WallEvent[] })
  return (
    <div data-testid="wall-fixture" className="h-[1080px] w-[1920px]">
      <WallView now={now} members={members as WallMember[]} today={plan(day)} tomorrow={plan(next)} currentWeather={WEATHER} />
    </div>
  )
}
