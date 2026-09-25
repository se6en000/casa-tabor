import { useMemo } from 'react'
import { formatWallClock, formatWallDate } from './clock'
import { selectNextMove } from './engine/nextMove'
import type { DayPlan, WallMember } from './engine/types'
import { describeNextMove } from './header'
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
}

/** The evening posture (board 02c): dark, and about the day ahead. */
export default function WallEvening({ now, members, plan, label, focusDay }: WallEveningProps) {
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
