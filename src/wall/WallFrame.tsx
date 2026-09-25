import { useMemo } from 'react'
import { useHomeWeather } from '../hooks/useHomeWeather'
import { packingEventIds } from './packing'
import { useWallChecklist } from './useWallChecklist'
import { useMinuteClock } from './useMinuteClock'
import { useWallDay } from './useWallDay'
import WallView from './WallView'

/** The Wall with live data: the minute clock, today's and tomorrow's plans, and the home weather. */
export default function WallFrame() {
  const now = useMinuteClock()
  const { members, today, tomorrow } = useWallDay(now)
  const { data: currentWeather } = useHomeWeather()
  const eventIds = useMemo(() => [today, tomorrow].flatMap((plan) => (plan ? packingEventIds(plan) : [])), [today, tomorrow])
  const checklist = useWallChecklist(eventIds)
  return <WallView now={now} members={members} today={today} tomorrow={tomorrow} currentWeather={currentWeather} checklist={checklist} />
}
