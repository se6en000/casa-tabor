import { useMemo, type ReactNode } from 'react'
import type { DayPlan, WallMember } from './engine/types'
import { selectNextMove } from './engine/nextMove'
import { formatWallClock } from './clock'
import { describeNextMove } from './header'
import { forecastLine } from './posture'

// A night Calm (canvas 36a/36b; Jake, Oct 2: "does calm view have a night time version? that it could auto switch after
// some time away? kinda like how the day version works?" → "approved"). In the evening, once nobody has touched the wall
// for a while, the full evening face settles to this: the clock in warm gold, tomorrow's date and weather, the first one
// out, anything still tonight. After midnight it's dimmer still: the clock and the first one out. A touch brings back
// the full evening (WallView).

export default function WallNightCalm({ now, members, plan, stillTonight = null }: {
  now: Date
  members: WallMember[]
  /** The day ahead: tomorrow before midnight, the day just begun after it. */
  plan: DayPlan | null
  stillTonight?: ReactNode
}) {
  const late = now.getHours() < 6
  // A day that hasn't started reads from its start ("Leave 11:56").
  const asOf = useMemo(() => {
    if (!plan || plan.date.toDateString() === now.toDateString()) return now
    const start = new Date(plan.date)
    start.setHours(0, 0, 0, 0)
    return start
  }, [now, plan])
  const first = useMemo(() => (plan ? describeNextMove(selectNextMove(plan, asOf), members, asOf) : null), [plan, members, asOf])
  const forecast = forecastLine(plan)
  const clock = formatWallClock(now)
  const weekday = (late ? new Date(now.getTime() - 6 * 3_600_000) : now).toLocaleDateString('en-US', { weekday: 'long' })
  const when = late ? `Late ${weekday} night` : now.getHours() >= 21 ? `${weekday} night` : `${weekday} evening`
  const day = plan?.date ?? now
  const firstLine = first ? `${first.leaveTime ? `${first.leaveTime} · ` : ''}${first.title}` : null

  return (
    <div aria-label="Night" className={`wall-evening relative h-full w-full bg-wall-ground font-body text-wall-ink ${late ? 'opacity-70' : ''}`}>
      <div className="absolute left-[96px] top-[96px] flex flex-col gap-[44px]">
        <div className="flex items-baseline gap-[18px]">
          <span className="font-display text-wall-clock-calm font-medium lining-nums text-wall-brass">{clock.time}</span>
          <span className="text-wall-date font-semibold text-wall-ink-2">{clock.meridiem}</span>
        </div>
        <span className="font-display text-wall-quote italic text-wall-ink-2">{when}</span>
      </div>
      <div className="absolute left-[1000px] top-[150px] flex w-[820px] flex-col">
        {late ? (
          <>
            <span className="text-wall-detail font-bold tracking-[0.2em] text-wall-brass">TOMORROW · {day.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}</span>
            <span className="mt-[16px] font-display text-wall-quote font-semibold lining-nums">{first?.leaveTime ? `First out ${first.leaveTime}` : 'Nothing on the road'}</span>
            {first && <span className="mt-[10px] text-wall-heading text-wall-ink-2">{[first.title, forecast].filter(Boolean).join(' · ')}</span>}
          </>
        ) : (
          <>
            <span className="text-wall-detail font-bold tracking-[0.2em] text-wall-brass">TOMORROW</span>
            <span className="mt-[12px] font-display text-wall-countdown-long font-semibold lining-nums">{day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            {forecast && <span className="mt-[12px] text-wall-heading text-wall-ink-2">{forecast}</span>}
            <div className="my-[22px] h-px bg-wall-rule" />
            <span className="text-wall-detail font-bold tracking-[0.2em] text-wall-ink-2">FIRST OUT</span>
            <span className="mt-[14px] font-display text-wall-move font-semibold lining-nums">{firstLine ?? 'Nothing on the road'}</span>
            {first && <span className="mt-[8px] text-wall-body text-wall-ink-2">{first.timing}</span>}
            {stillTonight && (
              <>
                <div className="my-[22px] h-px bg-wall-rule" />
                {stillTonight}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
