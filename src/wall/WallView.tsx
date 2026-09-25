import { useEffect, useState } from 'react'
import type { DayPlan, WallMember } from './engine/types'
import type { WallChecklistItem } from './packing'
import { eveningFocus, selectPosture, type Posture } from './posture'
import { nextPreview, shownPosture, type PreviewState } from './preview'
import WallCalm from './WallCalm'
import WallEvening from './WallEvening'
import WallLaunch from './WallLaunch'
import WallMenu, { MenuButton } from './WallMenu'

export interface WallViewProps {
  now: Date
  members: WallMember[]
  /** null while loading. */
  today: DayPlan | null
  tomorrow: DayPlan | null
  currentWeather?: { temp: number; condition: string } | null
  /** Checklist items for the day's events ("Pack tonight"). */
  checklist?: WallChecklistItem[]
}

const POSTURE_NAMES: Record<Posture, string> = { launch: 'Full day', calm: 'Calm', evening: 'Evening' }

/**
 * The whole Wall, drawn from data only (no fetching), so it can be rendered from fixtures.
 * A tap anywhere previews the next face; it returns to the automatic one after 2 idle minutes.
 */
export default function WallView({ now, members, today, tomorrow, currentWeather, checklist = [] }: WallViewProps) {
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const auto = selectPosture(today, now)
  const shown = shownPosture(auto, preview, Date.now())

  // Drop the preview exactly when it lapses (the minute clock alone could keep it up to a minute longer).
  useEffect(() => {
    if (!preview) return
    const timer = window.setTimeout(() => setPreview(null), Math.max(0, preview.until - Date.now()))
    return () => window.clearTimeout(timer)
  }, [preview])

  const openMenu = () => setMenuOpen(true)
  let face
  if (shown.posture === 'evening') {
    const focus = eveningFocus(now)
    face = <WallEvening now={now} members={members} plan={focus.day === 'today' ? today : tomorrow} label={focus.label} focusDay={focus.day} checklist={checklist} />
  } else if (shown.posture === 'calm') {
    face = <WallCalm now={now} members={members} plan={today} currentWeather={currentWeather} />
  } else {
    face = <WallLaunch now={now} members={members} plan={today} currentWeather={currentWeather} onOpenMenu={openMenu} />
  }

  return (
    <div className="relative h-full w-full" onClick={() => setPreview((state) => nextPreview(auto, state, Date.now()))}>
      {face}
      {shown.posture !== 'launch' && <MenuButton onOpen={openMenu} className="absolute right-[44px] top-[44px]" />}
      {shown.preview && (
        <div className="pointer-events-none absolute left-1/2 top-[8px] -translate-x-1/2 whitespace-nowrap rounded-full bg-wall-ink px-[18px] py-[4px] text-wall-label font-semibold text-wall-on-pigment">
          Previewing {POSTURE_NAMES[shown.posture]} · tap for the next · back to {POSTURE_NAMES[auto]} on its own
        </div>
      )}
      {menuOpen && <WallMenu onClose={() => setMenuOpen(false)} />}
    </div>
  )
}
