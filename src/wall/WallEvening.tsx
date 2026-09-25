import { useMemo } from 'react'
import { formatWallClock, formatWallDate } from './clock'
import { selectNextMove } from './engine/nextMove'
import type { DayPlan, WallMember } from './engine/types'
import { Check } from 'lucide-react'
import { describeNextMove } from './header'
import { fitPacking, packingGroups, type WallChecklistItem } from './packing'
import { PackingItem } from './WallPackingSheet'
import { forecastLine } from './posture'
import { DecisionRow, type DatedDecision } from './WallDecisions'
import type { DecisionAction } from './decisions'
import { buildScore } from './score'
import WallScore, { type ScoreInteraction } from './WallScore'

export interface WallEveningProps {
  now: Date
  members: WallMember[]
  /** The day being prepared for: tomorrow, or today after midnight. */
  plan: DayPlan | null
  /** "Friday evening" */
  label: string
  focusDay: 'today' | 'tomorrow'
  checklist?: WallChecklistItem[]
  interaction?: ScoreInteraction
  /** Decisions for the day being prepared for. */
  decisions?: DatedDecision[]
  onAnswer?: (decision: DatedDecision, action: DecisionAction) => Promise<void>
  /** Tick or untick a packing item (a tap on its line). */
  onToggleItem?: (item: WallChecklistItem) => void
  /** Open the event a packing group belongs to (a tap on its heading). */
  onOpenEvent?: (eventId: string) => void
  /** Everything to pack, in a sheet. */
  onSeeAllPacking?: () => void
}

/** Lines that fit under the Score (group headings count as lines). */
const PACKING_LINES = 7

/** The evening posture (board 02c): dark, and about the day ahead. */
export default function WallEvening({ now, members, plan, label, focusDay, checklist = [], interaction, decisions = [], onAnswer, onToggleItem, onOpenEvent, onSeeAllPacking }: WallEveningProps) {
  // Before the day starts, lane statuses read as plans ("Leaves at 11:56").
  const asOf = useMemo(() => {
    if (focusDay === 'today') return now
    const start = new Date(now)
    start.setDate(start.getDate() + 1)
    start.setHours(0, 0, 0, 0)
    return start
  }, [now, focusDay])
  const score = useMemo(() => (plan ? buildScore(plan, members, asOf) : null), [plan, members, asOf])
  const first = useMemo(() => (plan ? describeNextMove(selectNextMove(plan, asOf), members, asOf) : null), [plan, members, asOf])
  const packing = useMemo(() => (plan ? packingGroups(plan, checklist) : { groups: [], packed: 0, total: 0 }), [plan, checklist])
  // Fill the space in order; packed things fold into one line; the rest is counted, not dropped.
  const { groups: shownGroups, hidden } = useMemo(() => fitPacking(packing.groups, PACKING_LINES), [packing.groups])
  const forecast = forecastLine(plan)
  const clock = formatWallClock(now)
  const weekday = asOf.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()

  return (
    <div className="wall-evening flex h-full w-full flex-col gap-[26px] bg-wall-ground p-[44px] font-body text-wall-ink">
      <header className="flex h-[190px] shrink-0 items-stretch gap-[48px]">
        <div className="flex w-[420px] shrink-0 flex-col justify-center gap-[6px]">
          <div className="flex items-baseline gap-[10px]">
            <span className="font-display text-wall-clock font-medium lining-nums">{clock.time}</span>
            <span className="text-wall-heading font-semibold text-wall-ink-2">{clock.meridiem}</span>
          </div>
          <div className="font-display text-wall-date italic text-wall-ink-2">{label}</div>
        </div>
        <div className="w-px shrink-0 bg-wall-rule" />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-[8px]">
          <div className="text-wall-label font-bold tracking-[0.25em] text-wall-brass-ink">{focusDay === 'tomorrow' ? 'TOMORROW' : 'TODAY'}</div>
          <div className="font-display text-wall-move font-semibold">{formatWallDate(asOf)}</div>
          {forecast && <div className="truncate text-wall-body text-wall-ink-2">{forecast}</div>}
        </div>
      </header>

      <WallScore score={score} now={asOf} heading={`${weekday} · WHO'S WHERE`} compact interaction={interaction} />

      <div className="flex min-h-0 flex-1 gap-[48px]">
        <section aria-label="Needs a decision" className="flex min-w-0 flex-1 flex-col">
          <div className="mb-[10px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">
            {decisions.length > 0 ? `NEEDS A DECISION · ${decisions.length}` : 'NOTHING TO DECIDE'}
          </div>
          {decisions.slice(0, 2).map((d) =>
            onAnswer ? (
              <DecisionRow key={d.key} decision={d} now={now} onAnswer={onAnswer} compact />
            ) : (
              <div key={d.key} className="border-t border-wall-rule py-[12px] font-display text-wall-heading font-semibold">{d.text}</div>
            ),
          )}
        </section>

        {packing.total > 0 && (
          <section aria-label="Pack tonight" className="flex min-w-0 flex-1 flex-col">
            <div className="mb-[4px] flex h-[44px] items-center justify-between gap-[16px]">
              <span className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">PACK TONIGHT · {packing.packed} OF {packing.total} PACKED</span>
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
            {shownGroups.map((group) => (
              <div key={group.eventId} className="flex flex-col">
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
                  <div className="flex h-[40px] items-center gap-[10px] pl-[4px] text-wall-detail text-wall-ink-2">
                    <Check size={18} strokeWidth={2.5} aria-hidden="true" />
                    {group.packed} packed
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        <section aria-label="First departure" className="flex w-[520px] shrink-0 flex-col gap-[10px] self-start rounded-[18px] border border-wall-rule px-[28px] py-[26px]">
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">FIRST DEPARTURE</div>
          {first ? (
            <>
              <div className="truncate font-display text-wall-date-calm font-semibold">{first.title}</div>
              <div className="text-wall-body">{first.leaveTime ? `Leave ${first.leaveTime} · ${first.timing}` : first.timing}</div>
              <div className="text-wall-detail text-wall-ink-2">{first.summary}</div>
            </>
          ) : (
            <div className="font-display text-wall-date-calm font-semibold italic">No departures.</div>
          )}
        </section>
      </div>
    </div>
  )
}
