import type { DayPlan, WallMember } from './engine/types'
import { eveningFocus, selectPosture } from './posture'
import WallCalm from './WallCalm'
import WallEvening from './WallEvening'
import WallLaunch from './WallLaunch'

export interface WallViewProps {
  now: Date
  members: WallMember[]
  /** null while loading. */
  today: DayPlan | null
  tomorrow: DayPlan | null
  currentWeather?: { temp: number; condition: string } | null
}

/** The whole Wall, drawn from data only (no fetching), so it can be rendered from fixtures. */
export default function WallView({ now, members, today, tomorrow, currentWeather }: WallViewProps) {
  const posture = selectPosture(today, now)
  if (posture === 'evening') {
    const focus = eveningFocus(now)
    return <WallEvening now={now} members={members} plan={focus.day === 'today' ? today : tomorrow} label={focus.label} focusDay={focus.day} />
  }
  if (posture === 'calm') return <WallCalm now={now} members={members} plan={today} currentWeather={currentWeather} />
  return <WallLaunch now={now} members={members} plan={today} currentWeather={currentWeather} />
}
