import { useHomeWeather } from '../hooks/useHomeWeather'
import { useMinuteClock } from './useMinuteClock'
import { useWallDay } from './useWallDay'
import WallView from './WallView'

/** The Wall with live data: the minute clock, today's plan, and the home weather. */
export default function WallFrame() {
  const now = useMinuteClock()
  const { members, plan } = useWallDay(now)
  const { data: currentWeather } = useHomeWeather()
  return <WallView now={now} members={members} plan={plan} currentWeather={currentWeather} />
}
