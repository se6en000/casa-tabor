import { useMemo, type ReactNode } from 'react'
import { formatWallClock, formatWallDate } from './clock'
import { selectNextMove } from './engine/nextMove'
import { describeNextMove, weatherLine } from './header'
import NextMovePanel, { type NextMoveActions } from './NextMovePanel'
import { buildScore } from './score'
import type { DayPlan, WallMember } from './engine/types'
import { DecisionCount } from './WallDecisions'
import { MenuButton, MicButton } from './WallMenu'
import WallScore, { type ScoreInteraction } from './WallScore'
import WallTomorrowNote, { type TomorrowNote } from './WallTomorrowNote'

export interface WallLaunchProps {
  now: Date
  members: WallMember[]
  /** null while today's data is loading. */
  plan: DayPlan | null
  currentWeather?: { temp: number; condition: string } | null
  onOpenMenu?: () => void
  onAsk?: () => void
  interaction?: ScoreInteraction
  moveActions?: NextMoveActions
  decisionCount?: number
  onOpenDecisions?: () => void
  /** The week strip, drawn under the Score. */
  week?: ReactNode
  /** Tomorrow speaking up in the afternoon. */
  tomorrow?: TomorrowNote | null
}

/** The launch posture (board 02a): clock, Next Move, and the full Score. */
export default function WallLaunch({ now, members, plan, currentWeather, onOpenMenu, onAsk, interaction, moveActions, decisionCount = 0, onOpenDecisions, week, tomorrow = null }: WallLaunchProps) {
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
            <MenuButton onOpen={onOpenMenu ?? (() => {})} />
            {onAsk && <MicButton onAsk={onAsk} small className="ml-[4px]" />}
            <span className="text-wall-label font-semibold tracking-[0.25em] text-wall-brass-ink">MAISON TABOR</span>
            {onOpenDecisions && <DecisionCount count={decisionCount} onOpen={onOpenDecisions} className="ml-[6px]" />}
          </div>
          <div className="mt-[2px] flex items-baseline gap-[10px]">
            <span className="font-display text-wall-clock font-medium lining-nums">{clock.time}</span>
            <span className="text-wall-heading font-semibold text-wall-ink-2">{clock.meridiem}</span>
          </div>
          <div className="font-display text-wall-date font-semibold">{formatWallDate(now)}</div>
          {weather && <div className="truncate text-wall-detail text-wall-ink-2">{weather}</div>}
        </div>

        <div className="w-px shrink-0 bg-wall-rule" />

        <NextMovePanel view={nextMove} pigmentIndex={driverPigment} actions={moveActions} />
      </header>

      {tomorrow && <WallTomorrowNote note={tomorrow} />}
      <WallScore score={score} now={now} interaction={interaction} />
      {week}
    </div>
  )
}
