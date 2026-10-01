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
import { DecisionCount, EmailCount, type DatedDecision } from './WallDecisions'
import type { DecisionAction } from './decisions'
import type { PackingGroup, WallChecklistItem } from './packing'
import { PrepRail } from './WallPrep'
import { CasaCalling } from './WallCasaTalk'
import type { CasaTopic } from './casaTalk'

export interface WallLaunchProps {
  now: Date
  members: WallMember[]
  /** null while today's data is loading. */
  plan: DayPlan | null
  currentWeather?: { temp: number; condition: string } | null
  onOpenMenu?: () => void
  onAsk?: () => void
  /** Casa has something to say (canvas 21a): the mic glows and the quiet line takes the name's place. */
  calling?: { topic: CasaTopic; onOpen: () => void } | null
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
export default function WallLaunch({ now, members, plan, currentWeather, onOpenMenu, onAsk, calling = null, onAdd, interaction, moveActions, decisionCount = 0, onOpenDecisions, emailCount = 0, onOpenEmail, week, tomorrow: tomorrowNote = null, prep = null }: WallLaunchProps) {
  const prepping = Boolean(prep && prep.packing.total > 0)
  // Today's list takes the room the TOMORROW note would use; tomorrow's own list is on the evening face.
  const tomorrow = prepping ? null : tomorrowNote
  const hideRoutines = interaction?.routines?.hidden === true
  const score = useMemo(() => (plan ? buildScore(plan, members, now, { hideRoutines }) : null), [plan, members, now, hideRoutines])
  const clock = formatWallClock(now)
  const nextMove = useMemo(() => (plan ? describeNextMove(selectNextMove(plan, now), members, now) : null), [plan, members, now])
  const driverPigment = score?.lanes.find((lane) => lane.member.id === nextMove?.driverId)?.pigmentIndex ?? null
  const weather = weatherLine(currentWeather, plan, now)
  // With a Next Move and its actions (and no TOMORROW note, which has its own row), the pill sits on the actions' line.
  const pillInHeader = Boolean(nextMove && moveActions && !tomorrow)

  return (
    // With a list to get ready, the evening face's layout (Jake: "why can't it have the same layout as the night /
    // tomorrow mode?"): a shorter header that keeps the Next Move, compact lanes, decisions and get & pack beneath,
    // and the week strip.
    // One header height whether or not there's a list, so the screen never jumps when the list is done (polish, Oct 1).
    <div className="flex h-full w-full flex-col gap-[22px] bg-wall-ground p-[44px] font-body text-wall-ink">
      <header className="flex h-[184px] shrink-0 items-stretch gap-[48px]">
        <div className="flex w-[520px] shrink-0 flex-col gap-[6px]">
          <div className="flex items-center gap-[10px]">
            <MenuButton onOpen={onOpenMenu ?? (() => {})} />
            {onAsk && <MicButton onAsk={calling ? calling.onOpen : onAsk} calling={Boolean(calling)} small className="ml-[4px]" />}
            {onAdd && <AddButton onAdd={onAdd} />}
            {calling ? (
              // The one thing Casa has to say takes the row (it is among the decisions, so the count waits).
              <CasaCalling topic={calling.topic} onOpen={calling.onOpen} className="ml-[10px]" />
            ) : (
              <>
                {/* The row fits the name or the email count, not both beside TO DECIDE: the count ran into the ring (2026-09-30). */}
                {!(onOpenEmail && emailCount > 0) && <span className="whitespace-nowrap text-wall-label font-semibold tracking-[0.18em] text-wall-brass-ink">MAISON TABOR</span>}
                {onOpenDecisions && <DecisionCount count={decisionCount} onOpen={onOpenDecisions} className="ml-[6px]" />}
                {onOpenEmail && <EmailCount count={emailCount} onOpen={onOpenEmail} />}
              </>
            )}
          </div>
          <div className="mt-[2px] flex items-baseline gap-[10px]">
            <span className="font-display text-wall-clock font-medium lining-nums">{clock.time}</span>
            <span className="text-wall-heading font-semibold text-wall-ink-2">{clock.meridiem}</span>
          </div>
          <div className="truncate font-display text-wall-date font-semibold">
            {formatWallDate(now)}
            {weather && <span className="font-body text-wall-detail font-normal text-wall-ink-2"> · {weather}</span>}
          </div>
        </div>

        <div className="w-px shrink-0 bg-wall-rule" />

        <NextMovePanel
          view={nextMove}
          pigmentIndex={driverPigment}
          actions={moveActions}
          // "Hide routines" on the Next Move's button line, not floating above the hours (polish, Oct 1).
          trailing={pillInHeader && interaction?.routines ? <HideRoutinesPill hidden={interaction.routines.hidden} onToggle={interaction.routines.onToggle} /> : null}
        />
      </header>

      {tomorrow && interaction?.routines ? (
        // The TOMORROW note takes the room above the hours, so the Hide tap ends its row.
        <div className="flex shrink-0 items-center gap-[16px]">
          <div className="min-w-0 flex-1"><WallTomorrowNote note={tomorrow} /></div>
          <HideRoutinesPill hidden={interaction.routines.hidden} onToggle={interaction.routines.onToggle} />
        </div>
      ) : tomorrow && <WallTomorrowNote note={tomorrow} />}
      <WallScore score={score} now={now} compact={prepping} interaction={(tomorrow || pillInHeader) && interaction?.routines ? { ...interaction, routines: { ...interaction.routines, elsewhere: true } } : interaction} />
      {prep && prepping && (
        <PrepRail
          decisions={prep.decisions}
          decisionLabel="Needs a decision today"
          now={now}
          onAnswer={prep.onAnswer}
          packing={prep.packing}
          packLabel="Get & pack today"
          departure={null}
          onToggleItem={prep.onToggleItem}
          onOpenEvent={prep.onOpenEvent}
          onSeeAll={prep.onSeeAll}
        />
      )}
      {week}
    </div>
  )
}
