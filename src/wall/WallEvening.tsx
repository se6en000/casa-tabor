import { useMemo, type ReactNode } from 'react'
import { formatWallDate } from './clock'
import { selectNextMove } from './engine/nextMove'
import type { DayPlan, WallMember } from './engine/types'
import { describeNextMove } from './header'
import { packingGroups, type WallChecklistItem } from './packing'
import { forecastLine } from './posture'
import { DecisionRow, type DatedDecision } from './WallDecisions'
import type { DecisionAction } from './decisions'
import { GetReady } from './WallPrep'
import { pigmentStyleFor } from './lanes'
import { RailClock, RailLabel, RailRule, RailShell } from './WallRail'
import { buildScore } from './score'
import WallScore, { HideRoutinesPill, type ScoreInteraction } from './WallScore'

export interface WallEveningProps {
  now: Date
  members: WallMember[]
  /** The day on show: tomorrow in the evening, or any day tapped in the week strip. */
  plan: DayPlan | null
  /** Under the clock: "Friday evening", or today's date by day. */
  label: string
  /** Above the date: "TOMORROW", "TODAY", or "LOOKING AHEAD · SUNDAY". */
  heading: string
  /** The evening's dark palette (after 7 PM); light by day. */
  dark?: boolean
  checklist?: WallChecklistItem[]
  interaction?: ScoreInteraction
  /** Decisions for the day on show. */
  decisions?: DatedDecision[]
  onAnswer?: (decision: DatedDecision, action: DecisionAction) => Promise<void>
  /** Tick or untick a packing item (a tap on its line). */
  onToggleItem?: (item: WallChecklistItem) => void
  /** Open the event a packing group belongs to (a tap on its heading). */
  onOpenEvent?: (eventId: string) => void
  /** Everything to pack, in a sheet. */
  onSeeAllPacking?: () => void
  /** The week strip, under everything. */
  week?: ReactNode
  /** Shown when a day was tapped (not the day the wall picked by itself). */
  onBack?: () => void
  /** Tonight's nudge (P3.22, board 09a), in the left panel. */
  tonight?: ReactNode
  /** STILL TONIGHT (canvas 28c): what's left of today, in the left panel under the clock. */
  stillTonight?: ReactNode
  /** The counts at the foot of the left panel. */
  counts?: ReactNode
}

/**
 * The day-ahead face (boards 02c and 04b, canvas 56A): the left panel keeps tonight — the clock, what's still due, and
 * tomorrow's first one out — and the stage is the day ahead: what to get ready, what needs deciding, and its Score.
 * In the evening it is tomorrow, dark; by day it is whichever day was tapped in the week strip.
 */
export default function WallEvening({ now, members, plan, label, heading, dark = false, checklist = [], interaction, decisions = [], onAnswer, onToggleItem, onOpenEvent, onSeeAllPacking, week, onBack, tonight = null, stillTonight = null, counts }: WallEveningProps) {
  // A day that hasn't started reads as plans ("Leaves at 11:56"): its Score is drawn from its start.
  const asOf = useMemo(() => {
    if (!plan || plan.date.toDateString() === now.toDateString()) return now
    const start = new Date(plan.date)
    start.setHours(0, 0, 0, 0)
    return start
  }, [now, plan])
  const hideRoutines = interaction?.routines?.hidden === true
  const score = useMemo(() => (plan ? buildScore(plan, members, asOf, { hideRoutines }) : null), [plan, members, asOf, hideRoutines])
  const first = useMemo(() => (plan ? describeNextMove(selectNextMove(plan, asOf), members, asOf) : null), [plan, members, asOf])
  const packing = useMemo(() => (plan ? packingGroups(plan, checklist) : { groups: [], packed: 0, total: 0 }), [plan, checklist])
  const forecast = forecastLine(plan)
  const driverPigment = score?.lanes.find((lane) => lane.member.id === first?.driverId)?.pigmentIndex ?? null

  return (
    <div className={`${dark ? 'wall-evening ' : ''}relative h-full w-full bg-wall-ground font-body text-wall-ink`}>
      <RailShell night={dark} foot={counts}>
        <RailClock now={now}>
          <div className="font-display text-wall-date italic text-wall-ink-2">{label}</div>
        </RailClock>
        <RailRule />
        {stillTonight ?? tonight}
        <section aria-label="First departure" className={`flex shrink-0 flex-col ${stillTonight || tonight ? 'mt-[34px]' : ''}`}>
          <RailLabel>FIRST OUT{heading === 'TOMORROW' ? ' TOMORROW' : ''}</RailLabel>
          {first ? (
            <>
              {first.leaveTime && (
                <div className="mt-[12px] flex items-baseline gap-[14px]">
                  <span className="font-display text-wall-move font-semibold lining-nums">{first.leaveTime}</span>
                  <span className="text-wall-detail text-wall-ink-2">leave</span>
                </div>
              )}
              <div className="mt-[10px] flex min-w-0 items-center gap-[12px]">
                <span
                  aria-hidden="true"
                  className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full font-display text-wall-label font-bold ${driverPigment == null ? 'border-2 border-dashed border-wall-ink-2 text-wall-ink-2' : `text-wall-on-pigment ${pigmentStyleFor(driverPigment).solid}`}`}
                >
                  {first.initial}
                </span>
                <span className="truncate font-display text-wall-date font-semibold">{first.title}</span>
              </div>
              <div className="mt-[8px] text-wall-detail text-wall-ink-2">{first.timing}</div>
            </>
          ) : (
            <div className="mt-[12px] font-display text-wall-date italic text-wall-ink-2">No departures.</div>
          )}
          {forecast && <div className="mt-[18px] text-wall-detail text-wall-ink-2">{forecast}</div>}
        </section>
      </RailShell>

      <div className="absolute inset-y-0 left-[560px] right-0 flex flex-col gap-[20px] px-[56px] pb-[44px] pt-[36px]">
        <header className="flex h-[64px] shrink-0 items-center justify-between gap-[24px]">
          <div className="flex min-w-0 items-baseline gap-[24px]">
            <span className="shrink-0 text-wall-label font-bold tracking-[0.25em] text-wall-brass-ink">{heading}</span>
            <span className="truncate font-display text-wall-move font-semibold">{plan ? formatWallDate(plan.date) : ''}</span>
          </div>
          {interaction?.routines && !onBack && <HideRoutinesPill hidden={interaction.routines.hidden} onToggle={interaction.routines.onToggle} />}
          {onBack && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onBack()
              }}
              className="h-[52px] shrink-0 rounded-full border border-solid border-wall-ink-2 bg-wall-paper px-[24px] text-wall-detail font-semibold text-wall-ink"
            >
              Back to today
            </button>
          )}
        </header>

        {/* Two lines a card when a decision needs the room too, so the lanes keep theirs. */}
        {packing.total > 0 && <GetReady packing={packing} lines={decisions.length > 0 ? 2 : 3} onToggleItem={onToggleItem} onOpenEvent={onOpenEvent} onSeeAll={onSeeAllPacking} />}

        {decisions.length > 0 && (
          <section aria-label="Needs a decision" className="flex shrink-0 items-center gap-[24px] rounded-[16px] border border-solid border-wall-brass px-[24px] py-[12px]">
            <span className="shrink-0 text-wall-label font-bold tracking-[0.22em] text-wall-brass-ink">TO DECIDE{decisions.length > 1 ? ` · ${decisions.length}` : ''}</span>
            {onAnswer
              ? <DecisionRow decision={decisions[0]} now={now} onAnswer={onAnswer} inline showDay={false} />
              : <span className="min-w-0 flex-1 truncate font-display text-wall-date font-bold">{decisions[0].text}</span>}
          </section>
        )}

        <WallScore score={score} now={asOf} heading={`${asOf.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()} · WHO'S WHERE`} shownHeading="WHO'S WHERE" fill compact={packing.total > 0 || decisions.length > 0} routinesElsewhere interaction={interaction} />

        {week}
      </div>
    </div>
  )
}
