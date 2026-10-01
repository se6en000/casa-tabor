import { useMemo, type ReactNode } from 'react'
import { formatWallClock, formatWallDate } from './clock'
import { selectNextMove } from './engine/nextMove'
import { describeNextMove, weatherLine } from './header'
import NextMovePanel, { type NextMoveActions } from './NextMovePanel'
import { buildScore } from './score'
import type { DayPlan, WallMember } from './engine/types'
import { AddButton, MenuButton, MicButton } from './WallMenu'
import WallScore, { HideRoutinesPill, type ScoreInteraction } from './WallScore'
import WallTomorrowNote, { type TomorrowNote } from './WallTomorrowNote'
import { DecisionCount, DecisionRow, EmailCount, type DatedDecision } from './WallDecisions'
import type { DecisionAction } from './decisions'
import type { PackingGroup, WallChecklistItem } from './packing'
import { GetAndPack } from './WallPrep'

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
  /**
   * Today's get & pack (row 18; Jake, 2026-10-01: "the home page/today should show the get and pack section so I can
   * check off … Owen's pink shirt before I leave for school"): the events still ahead and their lists, and today's
   * decisions. While any list is left, the lanes go compact and these sit under them, as on the evening face.
   */
  prep?: {
    packing: { groups: PackingGroup[]; packed: number; total: number }
    decisions: DatedDecision[]
    onAnswer?: (decision: DatedDecision, action: DecisionAction) => Promise<void>
    onToggleItem?: (item: WallChecklistItem) => void
    onOpenEvent?: (eventId: string) => void
    onSeeAll?: () => void
  } | null
}

/** The launch posture (board 02a): clock, Next Move, and the full Score. */
export default function WallLaunch({ now, members, plan, currentWeather, onOpenMenu, onAsk, onAdd, interaction, moveActions, decisionCount = 0, onOpenDecisions, emailCount = 0, onOpenEmail, week, tomorrow: tomorrowNote = null, prep = null }: WallLaunchProps) {
  const prepping = Boolean(prep && prep.packing.total > 0)
  // Today's list takes the room the TOMORROW note would use; tomorrow's own list is on the evening face.
  const tomorrow = prepping ? null : tomorrowNote
  const hideRoutines = interaction?.routines?.hidden === true
  const score = useMemo(() => (plan ? buildScore(plan, members, now, { hideRoutines }) : null), [plan, members, now, hideRoutines])
  const clock = formatWallClock(now)
  const nextMove = useMemo(() => (plan ? describeNextMove(selectNextMove(plan, now), members, now) : null), [plan, members, now])
  const driverPigment = score?.lanes.find((lane) => lane.member.id === nextMove?.driverId)?.pigmentIndex ?? null
  const weather = weatherLine(currentWeather, plan, now)

  return (
    // With a list to get ready, the evening face's layout (Jake: "why can't it have the same layout as the night /
    // tomorrow mode?"): a shorter header that keeps the Next Move, compact lanes, decisions and get & pack beneath,
    // and the week strip.
    <div className={`flex h-full w-full flex-col ${prepping ? 'gap-[22px]' : 'gap-[28px]'} bg-wall-ground p-[44px] font-body text-wall-ink`}>
      <header className={`flex ${prepping ? 'h-[184px]' : 'h-[220px]'} shrink-0 items-stretch gap-[48px]`}>
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
          <div className="truncate font-display text-wall-date font-semibold">
            {formatWallDate(now)}
            {prepping && weather && <span className="font-body text-wall-detail font-normal text-wall-ink-2"> · {weather}</span>}
          </div>
          {!prepping && weather && <div className="truncate text-wall-detail text-wall-ink-2">{weather}</div>}
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
      <WallScore score={score} now={now} compact={prepping} interaction={tomorrow && interaction?.routines ? { ...interaction, routines: { ...interaction.routines, elsewhere: true } } : interaction} />
      {prep && prepping && (
        <div className="flex min-h-0 flex-1 gap-[40px]">
          {prep.decisions.length > 0 && (
            <section aria-label="Needs a decision today" className="flex w-[520px] shrink-0 flex-col">
              <div className="mb-[8px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">NEEDS A DECISION · {prep.decisions.length}</div>
              {prep.decisions.slice(0, 1).map((d) => (prep.onAnswer
                ? <DecisionRow key={d.key} decision={d} now={now} onAnswer={prep.onAnswer} compact />
                : <div key={d.key} className="border-t border-wall-rule py-[12px] font-display text-wall-heading font-semibold">{d.text}</div>))}
              {prep.decisions.length > 1 && <div className="text-wall-detail text-wall-ink-2">and {prep.decisions.length - 1} more under “to decide”</div>}
            </section>
          )}
          <GetAndPack packing={prep.packing} lines={3} columns={prep.decisions.length > 0 ? 3 : 4} label="Get & pack today" onToggleItem={prep.onToggleItem} onOpenEvent={prep.onOpenEvent} onSeeAll={prep.onSeeAll} />
        </div>
      )}
      {week}
    </div>
  )
}
