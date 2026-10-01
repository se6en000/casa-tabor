import { useMemo, type ReactNode } from 'react'
import { formatWallClock, formatWallDate } from './clock'
import { selectNextMove } from './engine/nextMove'
import { describeNextMove, weatherLine } from './header'
import NextMovePanel, { type NextMoveActions } from './NextMovePanel'
import { buildScore } from './score'
import type { DayPlan, WallMember } from './engine/types'
import { DecisionCount, EmailCount } from './WallDecisions'
import { AddButton, MenuButton, MicButton } from './WallMenu'
import WallScore, { HideRoutinesPill, type ScoreInteraction } from './WallScore'
import WallTomorrowNote, { type TomorrowNote } from './WallTomorrowNote'

export interface WallLaunchProps {
  now: Date
  members: WallMember[]
  /** null while today's data is loading. */
  plan: DayPlan | null
  currentWeather?: { temp: number; condition: string } | null
  onOpenMenu?: () => void
  onAsk?: () => void
  /** The + beside the mic: adding by touch. */
  onAdd?: () => void
  interaction?: ScoreInteraction
  moveActions?: NextMoveActions
  decisionCount?: number
  onOpenDecisions?: () => void
  /** What came in by email and waits (canvas 14d), and opening its review. */
  emailCount?: number
  onOpenEmail?: () => void
  /** The week strip, drawn under the Score. */
  week?: ReactNode
  /** Tomorrow speaking up in the afternoon. */
  tomorrow?: TomorrowNote | null
}

/** The launch posture (board 02a): clock, Next Move, and the full Score. */
export default function WallLaunch({ now, members, plan, currentWeather, onOpenMenu, onAsk, onAdd, interaction, moveActions, decisionCount = 0, onOpenDecisions, emailCount = 0, onOpenEmail, week, tomorrow = null }: WallLaunchProps) {
  const hideRoutines = interaction?.routines?.hidden === true
  const score = useMemo(() => (plan ? buildScore(plan, members, now, { hideRoutines }) : null), [plan, members, now, hideRoutines])
  const clock = formatWallClock(now)
  const nextMove = useMemo(() => (plan ? describeNextMove(selectNextMove(plan, now), members, now) : null), [plan, members, now])
  const driverPigment = score?.lanes.find((lane) => lane.member.id === nextMove?.driverId)?.pigmentIndex ?? null
  const weather = weatherLine(currentWeather, plan, now)

  return (
    <div className="flex h-full w-full flex-col gap-[28px] bg-wall-ground p-[44px] font-body text-wall-ink">
      <header className="flex h-[220px] shrink-0 items-stretch gap-[48px]">
        <div className="flex w-[520px] shrink-0 flex-col gap-[6px]">
          <div className="flex items-center gap-[10px]">
            <MenuButton onOpen={onOpenMenu ?? (() => {})} />
            {onAsk && <MicButton onAsk={onAsk} small className="ml-[4px]" />}
            {onAdd && <AddButton onAdd={onAdd} />}
            {/* The row fits the name or the email count, not both beside TO DECIDE: the count ran into the ring (2026-09-30). */}
            {!(onOpenEmail && emailCount > 0) && <span className="whitespace-nowrap text-wall-label font-semibold tracking-[0.18em] text-wall-brass-ink">MAISON TABOR</span>}
            {onOpenDecisions && <DecisionCount count={decisionCount} onOpen={onOpenDecisions} className="ml-[6px]" />}
            {onOpenEmail && <EmailCount count={emailCount} onOpen={onOpenEmail} />}
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

      {tomorrow && interaction?.routines ? (
        // The TOMORROW note takes the room above the hours, so the Hide tap ends its row.
        <div className="flex shrink-0 items-center gap-[16px]">
          <div className="min-w-0 flex-1"><WallTomorrowNote note={tomorrow} /></div>
          <HideRoutinesPill hidden={interaction.routines.hidden} onToggle={interaction.routines.onToggle} />
        </div>
      ) : tomorrow && <WallTomorrowNote note={tomorrow} />}
      <WallScore score={score} now={now} interaction={tomorrow && interaction?.routines ? { ...interaction, routines: { ...interaction.routines, elsewhere: true } } : interaction} />
      {week}
    </div>
  )
}
