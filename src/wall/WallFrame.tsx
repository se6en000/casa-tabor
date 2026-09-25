import { useHomeWeather } from '../hooks/useHomeWeather'
import { useMinuteClock } from './useMinuteClock'
import { useWallDay } from './useWallDay'
import WallView from './WallView'

/** The Wall with live data: the minute clock, today's and tomorrow's plans, and the home weather. */
export default function WallFrame() {
  const now = useMinuteClock()
  const { members, today, tomorrow } = useWallDay(now)
  const { data: currentWeather } = useHomeWeather()
  return <WallView now={now} members={members} today={today} tomorrow={tomorrow} currentWeather={currentWeather} />
}
