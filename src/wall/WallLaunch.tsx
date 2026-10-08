import { useMemo, type ReactNode } from 'react'
import { formatWallDate } from './clock'
import { weatherLine } from './header'
import { buildScore } from './score'
import type { DayPlan, WallMember } from './engine/types'
import WallScore, { type ScoreInteraction } from './WallScore'
import WallTomorrowNote, { type TomorrowNote } from './WallTomorrowNote'
import type { DatedDecision } from './WallDecisions'
import type { DecisionAction } from './decisions'
import type { PackingGroup, WallChecklistItem } from './packing'
import { PrepRail } from './WallPrep'
import { RailClock, RailRule, RailShell } from './WallRail'

export interface WallLaunchProps {
  now: Date
  members: WallMember[]
  /** null while today's data is loading. */
  plan: DayPlan | null
  currentWeather?: { temp: number; condition: string } | null
  interaction?: ScoreInteraction
  /** The left panel under the clock — today's NEXT, TAKE WITH YOU, THEN, TO DO (WallTodayPanel, the same on every face). */
  today?: ReactNode
  /** The counts at the foot of the left panel (to decide, from email, to plan, to do). */
  counts?: ReactNode
  /** The week strip, drawn under the Score. */
  week?: ReactNode
  /** Tomorrow speaking up in the afternoon. */
  tomorrow?: TomorrowNote | null
  /**
   * Today's get & pack (row 18; Jake, 2026-10-01: "the home page/today should show the get and pack section so I can
   * check off … Owen's pink shirt before I leave for school"): the events still ahead and their lists (not what goes
   * with the next move — that's TAKE WITH YOU in the panel), and today's decisions; while any is left, the lanes go
   * compact and these sit under them, as on the evening face. Today's to-dos are the panel's TO DO (canvas 79S).
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

/**
 * The full day (canvas 56A, "the stage"): the left panel holds now — the clock, the Next Move with what to take, and
 * THEN — and the whole stage beside it goes to the day: the Score, today's lists, the week strip.
 */
export default function WallLaunch({ now, members, plan, currentWeather, interaction, today = null, counts, week, tomorrow: tomorrowNote = null, prep = null }: WallLaunchProps) {
  const hideRoutines = interaction?.routines?.hidden === true
  const score = useMemo(() => (plan ? buildScore(plan, members, now, { hideRoutines }) : null), [plan, members, now, hideRoutines])
  const weather = weatherLine(currentWeather, plan, now)
  const packing = (prep?.packing.total ?? 0) > 0
  const prepping = packing || (prep?.decisions.length ?? 0) > 0
  // Today's list takes the room the TOMORROW note would use; tomorrow's own list is on the evening face.
  const tomorrow = packing ? null : tomorrowNote

  return (
    <div className="relative h-full w-full bg-wall-ground font-body text-wall-ink">
      <RailShell foot={counts}>
        <RailClock now={now}>
          <div className="flex flex-wrap items-baseline gap-x-[12px]">
            <span className="font-display text-wall-date font-semibold">{formatWallDate(now)}</span>
            {weather && <span className="text-wall-detail text-wall-ink-2">{weather}</span>}
          </div>
        </RailClock>
        <RailRule />
        {today}
      </RailShell>

      <div className="absolute inset-y-0 left-[560px] right-0 flex flex-col gap-[22px] px-[56px] py-[44px]">
        {tomorrow && <WallTomorrowNote note={tomorrow} />}
        <WallScore score={score} now={now} fill compact={prepping} interaction={interaction} />
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
            fixed
          />
        )}
        {week}
      </div>
    </div>
  )
}
