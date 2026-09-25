import { useMemo } from 'react'
import { formatWallClock, formatWallDate } from './clock'
import { selectNextMove } from './engine/nextMove'
import { describeNextMove, weatherLine } from './header'
import NextMovePanel from './NextMovePanel'
import { buildScore } from './score'
import type { DayPlan, WallMember } from './engine/types'
import WallScore from './WallScore'

export interface WallViewProps {
  now: Date
  members: WallMember[]
  /** null while today's data is loading. */
  plan: DayPlan | null
  currentWeather?: { temp: number; condition: string } | null
}

/** The whole Wall, drawn from data only (no fetching), so it can be rendered from fixtures. */
export default function WallView({ now, members, plan, currentWeather }: WallViewProps) {
  const score = useMemo(() => (plan ? buildScore(plan, members, now) : null), [plan, members, now])
  const clock = formatWallClock(now)
  const nextMove = useMemo(() => (plan ? describeNextMove(selectNextMove(plan, now), members, now) : null), [plan, members, now])
  const driverPigment = score?.lanes.find((lane) => lane.member.id === nextMove?.driverId)?.pigmentIndex ?? null
  const weather = weatherLine(currentWeather, plan, now)

  return (
    <div className="flex h-full w-full flex-col gap-[28px] bg-wall-ground p-[44px] font-body text-wall-ink">
      <header className="flex h-[220px] shrink-0 items-stretch gap-[48px]">
        <div className="flex w-[520px] shrink-0 flex-col gap-[6px]">
          <div className="flex items-center gap-[12px]">
            <span
              aria-hidden="true"
              className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-wall-brass font-display text-wall-detail font-bold text-wall-brass-ink"
            >
              MT
            </span>
            <span className="text-wall-label font-semibold tracking-[0.25em] text-wall-brass-ink">MAISON TABOR</span>
          </div>
          <div className="mt-[2px] flex items-baseline gap-[10px]">
            <span className="font-display text-wall-clock font-medium lining-nums">{clock.time}</span>
            <span className="text-wall-heading font-semibold text-wall-ink-2">{clock.meridiem}</span>
          </div>
          <div className="font-display text-wall-date font-semibold">{formatWallDate(now)}</div>
          {weather && <div className="truncate text-wall-detail text-wall-ink-2">{weather}</div>}
        </div>

        <div className="w-px shrink-0 bg-wall-rule" />

        <NextMovePanel view={nextMove} pigmentIndex={driverPigment} />
      </header>

      <WallScore score={score} now={now} />
    </div>
  )
}
