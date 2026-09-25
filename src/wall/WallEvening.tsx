import { useMemo } from 'react'
import { formatWallClock, formatWallDate } from './clock'
import { selectNextMove } from './engine/nextMove'
import type { DayPlan, WallMember } from './engine/types'
import { Check } from 'lucide-react'
import { describeNextMove } from './header'
import { packingGroups, type WallChecklistItem } from './packing'
import { decisions, forecastLine } from './posture'
import { buildScore } from './score'
import WallScore from './WallScore'

export interface WallEveningProps {
  now: Date
  members: WallMember[]
  /** The day being prepared for: tomorrow, or today after midnight. */
  plan: DayPlan | null
  /** "Friday evening" */
  label: string
  focusDay: 'today' | 'tomorrow'
  checklist?: WallChecklistItem[]
}

/** Lines that fit under the Score (group headings count as lines). */
const PACKING_LINES = 7

/** The evening posture (board 02c): dark, and about the day ahead. */
export default function WallEvening({ now, members, plan, label, focusDay, checklist = [] }: WallEveningProps) {
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
  const toDecide = decisions(plan, now)
  const packing = useMemo(() => (plan ? packingGroups(plan, checklist) : { groups: [], packed: 0, total: 0 }), [plan, checklist])
  // Fill the space in order; whatever doesn't fit is counted, not dropped silently.
  let linesLeft = PACKING_LINES
  let hidden = 0
  const shownGroups = packing.groups.flatMap((group) => {
    if (linesLeft < 2) {
      hidden += group.items.length
      return []
    }
    const items = group.items.slice(0, linesLeft - 1)
    hidden += group.items.length - items.length
    linesLeft -= 1 + items.length
    return [{ ...group, items }]
  })
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

      <WallScore score={score} now={asOf} heading={`${weekday} · WHO'S WHERE`} compact />

      <div className="flex min-h-0 flex-1 gap-[48px]">
        <section aria-label="Needs a decision" className="flex min-w-0 flex-1 flex-col">
          <div className="mb-[10px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">
            {toDecide.length > 0 ? `NEEDS A DECISION · ${toDecide.length}` : 'NOTHING TO DECIDE'}
          </div>
          {toDecide.map((text) => (
            <div key={text} className="border-t border-wall-rule py-[12px] font-display text-wall-heading font-semibold">
              {text}
            </div>
          ))}
        </section>

        {packing.total > 0 && (
          <section aria-label="Pack tonight" className="flex min-w-0 flex-1 flex-col">
            <div className="mb-[10px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">
              PACK TONIGHT · {packing.packed} OF {packing.total} PACKED
            </div>
            {shownGroups.map((group) => (
              <div key={group.eventId} className="flex flex-col">
                <div className="h-[40px] truncate whitespace-nowrap border-t border-wall-rule pt-[8px] font-display text-wall-heading font-bold">{group.heading}</div>
                {group.items.map((item) => (
                  <div key={item.id} className="flex h-[40px] items-center gap-[14px] pl-[4px]">
                    <span
                      aria-hidden="true"
                      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[4px] border-2 ${item.checked ? 'border-wall-brass bg-wall-brass text-wall-ground' : 'border-wall-ink-2'}`}
                    >
                      {item.checked && <Check size={16} strokeWidth={3} />}
                    </span>
                    <span className={`truncate text-wall-body ${item.checked ? 'text-wall-ink-2 line-through' : ''}`}>{item.label}</span>
                  </div>
                ))}
              </div>
            ))}
            {hidden > 0 && <div className="mt-[4px] text-wall-detail text-wall-ink-2">+{hidden} more</div>}
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
