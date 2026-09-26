import { useMemo, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { formatWallClock, formatWallDate } from './clock'
import { selectNextMove } from './engine/nextMove'
import type { DayPlan, WallMember } from './engine/types'
import { describeNextMove } from './header'
import { fitPackingColumns, packingGroups, type FittedPackingGroup, type WallChecklistItem } from './packing'
import { forecastLine } from './posture'
import { DecisionRow, type DatedDecision } from './WallDecisions'
import type { DecisionAction } from './decisions'
import { PackingItem } from './WallPackingSheet'
import { buildScore } from './score'
import WallScore, { type ScoreInteraction } from './WallScore'

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
}

/** Rows per packing column, and columns, that fit beside the decision and the first departure. */
const PACKING_LINES = 4
const PACKING_COLUMNS = 2

function PackingGroupView({ group, onToggleItem, onOpenEvent }: { group: FittedPackingGroup; onToggleItem?: (item: WallChecklistItem) => void; onOpenEvent?: (eventId: string) => void }) {
  return (
    <div className="flex min-w-0 flex-col">
      <button
        type="button"
        disabled={!onOpenEvent}
        onClick={(event) => {
          event.stopPropagation()
          onOpenEvent?.(group.eventId)
        }}
        className="h-[44px] w-full truncate whitespace-nowrap border-0 border-t border-solid border-wall-rule bg-transparent p-0 pt-[6px] text-left font-display text-wall-heading font-bold text-wall-ink"
      >
        {group.heading}
      </button>
      {group.items.map((item) => <PackingItem key={item.id} item={item} onToggle={onToggleItem} />)}
      {group.showPacked && (
        <div className="flex h-[44px] items-center gap-[10px] pl-[4px] text-wall-detail text-wall-ink-2">
          <Check size={18} strokeWidth={2.5} aria-hidden="true" />
          {group.packed} packed
        </div>
      )}
    </div>
  )
}

/**
 * The day-ahead face (boards 02c and 04b): a day's Score from its start, what needs
 * deciding, what to get and pack, and the first departure. In the evening it is
 * tomorrow, dark; by day it is whichever day was tapped in the week strip.
 */
export default function WallEvening({ now, members, plan, label, heading, dark = false, checklist = [], interaction, decisions = [], onAnswer, onToggleItem, onOpenEvent, onSeeAllPacking, week, onBack }: WallEveningProps) {
  // A day that hasn't started reads as plans ("Leaves at 11:56"): its Score is drawn from its start.
  const asOf = useMemo(() => {
    if (!plan || plan.date.toDateString() === now.toDateString()) return now
    const start = new Date(plan.date)
    start.setHours(0, 0, 0, 0)
    return start
  }, [now, plan])
  const score = useMemo(() => (plan ? buildScore(plan, members, asOf) : null), [plan, members, asOf])
  const first = useMemo(() => (plan ? describeNextMove(selectNextMove(plan, asOf), members, asOf) : null), [plan, members, asOf])
  const packing = useMemo(() => (plan ? packingGroups(plan, checklist) : { groups: [], packed: 0, total: 0 }), [plan, checklist])
  // Packed things fold into one line; an event moves whole to the next column; the rest is counted.
  const { columns, hidden } = useMemo(() => fitPackingColumns(packing.groups, PACKING_LINES, PACKING_COLUMNS), [packing.groups])
  const forecast = forecastLine(plan)
  const clock = formatWallClock(now)
  const weekday = asOf.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()

  return (
    <div className={`${dark ? 'wall-evening ' : ''}flex h-full w-full flex-col gap-[22px] bg-wall-ground p-[44px] font-body text-wall-ink`}>
      <header className="flex h-[170px] shrink-0 items-stretch gap-[48px]">
        <div className="flex w-[420px] shrink-0 flex-col justify-center gap-[6px]">
          <div className="flex items-baseline gap-[10px]">
            <span className="font-display text-wall-clock font-medium lining-nums">{clock.time}</span>
            <span className="text-wall-heading font-semibold text-wall-ink-2">{clock.meridiem}</span>
          </div>
          <div className="font-display text-wall-date italic text-wall-ink-2">{label}</div>
        </div>
        <div className="w-px shrink-0 bg-wall-rule" />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-[32px]">
          <div className="flex min-w-0 flex-col gap-[8px]">
            <div className="text-wall-label font-bold tracking-[0.25em] text-wall-brass-ink">{heading}</div>
            <div className="font-display text-wall-move font-semibold">{plan ? formatWallDate(plan.date) : ''}</div>
            {forecast && <div className="truncate text-wall-body text-wall-ink-2">{forecast}</div>}
          </div>
          {onBack && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onBack()
              }}
              className="h-[52px] shrink-0 rounded-full border border-solid border-wall-ink-2 bg-transparent px-[24px] text-wall-detail font-semibold text-wall-ink"
            >
              Back to today
            </button>
          )}
        </div>
      </header>

      <WallScore score={score} now={asOf} heading={`${weekday} · WHO'S WHERE`} compact interaction={interaction} />

      <div className="flex min-h-0 flex-1 gap-[40px]">
        <section aria-label="Needs a decision" className="flex w-[520px] shrink-0 flex-col">
          <div className="mb-[8px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">
            {decisions.length > 0 ? `NEEDS A DECISION · ${decisions.length}` : 'NOTHING TO DECIDE'}
          </div>
          {decisions.slice(0, 1).map((d) =>
            onAnswer ? (
              <DecisionRow key={d.key} decision={d} now={now} onAnswer={onAnswer} compact />
            ) : (
              <div key={d.key} className="border-t border-wall-rule py-[12px] font-display text-wall-heading font-semibold">{d.text}</div>
            ),
          )}
          {decisions.length > 1 && <div className="text-wall-detail text-wall-ink-2">and {decisions.length - 1} more under “to decide”</div>}
        </section>

        {packing.total > 0 && (
          <section aria-label="Pack tonight" className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-[44px] shrink-0 items-center justify-between gap-[16px]">
              <span className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">GET &amp; PACK · {packing.packed} OF {packing.total} DONE</span>
              {onSeeAllPacking && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onSeeAllPacking()
                  }}
                  className="h-[44px] shrink-0 rounded-full border border-solid border-wall-ink-2 bg-transparent px-[18px] text-wall-detail font-semibold text-wall-ink"
                >
                  {hidden > 0 ? `See all · ${hidden} more` : 'See all'}
                </button>
              )}
            </div>
            <div className="grid min-h-0 grid-cols-2 gap-x-[32px]">
              {columns.map((col, i) => (
                <div key={i} className="flex min-w-0 flex-col">
                  {col.map((group) => <PackingGroupView key={group.eventId} group={group} onToggleItem={onToggleItem} onOpenEvent={onOpenEvent} />)}
                </div>
              ))}
            </div>
          </section>
        )}

        <section aria-label="First departure" className="flex w-[440px] shrink-0 flex-col gap-[8px] self-start rounded-[18px] border border-wall-rule px-[26px] py-[22px]">
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">FIRST DEPARTURE</div>
          {first ? (
            <>
              <div className="truncate font-display text-wall-date font-semibold">{first.title}</div>
              <div className="text-wall-body">{first.leaveTime ? `Leave ${first.leaveTime} · ${first.timing}` : first.timing}</div>
            </>
          ) : (
            <div className="font-display text-wall-date font-semibold italic">No departures.</div>
          )}
        </section>
      </div>

      {week}
    </div>
  )
}
