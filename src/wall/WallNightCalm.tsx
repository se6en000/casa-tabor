import { useMemo, type ReactNode } from 'react'
import type { DayPlan, WallMember } from './engine/types'
import { selectNextMove } from './engine/nextMove'
import { describeNextMove } from './header'
import { forecastLine } from './posture'
import { RailClock, RailRule, RailShell } from './WallRail'

// A night Calm (canvas 36a/36b; Jake, Oct 2: "does calm view have a night time version? that it could auto switch after
// some time away? kinda like how the day version works?" → "approved"). In the evening, once nobody has touched the wall
// for a while, the full evening face settles to this: the clock in warm gold, tomorrow's date and weather, the first one
// out, anything still tonight. After midnight it's dimmer still: the clock and the first one out. A touch brings back
// the full evening (WallView). Canvas 56A calm at night: the left panel keeps the gold clock and what's still due
// tonight; the stage is one glance at tomorrow — the date, the first one out, how ready it is.

export default function WallNightCalm({ now, members, plan, stillTonight = null, ready = null }: {
  now: Date
  members: WallMember[]
  /** The day ahead: tomorrow before midnight, the day just begun after it. */
  plan: DayPlan | null
  stillTonight?: ReactNode
  /** Tomorrow's lists: how many are done, and the events they're for. */
  ready?: { packed: number; total: number; headings: string[] } | null
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
  const weekday = (late ? new Date(now.getTime() - 6 * 3_600_000) : now).toLocaleDateString('en-US', { weekday: 'long' })
  const when = late ? `Late ${weekday} night` : now.getHours() >= 21 ? `${weekday} night` : `${weekday} evening`
  const day = plan?.date ?? now

  return (
    <div aria-label="Night" className={`wall-evening relative h-full w-full bg-wall-ground font-body text-wall-ink ${late ? 'opacity-70' : ''}`}>
      <RailShell night>
        <RailClock now={now} size="calm" gold>
          <div className="font-display text-wall-quote italic text-wall-ink-2">{when}</div>
        </RailClock>
        {!late && stillTonight && (
          <>
            <RailRule />
            {stillTonight}
          </>
        )}
      </RailShell>

      <div className="absolute inset-y-0 left-[560px] right-0 flex flex-col justify-center px-[96px]">
        <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass">TOMORROW{late ? ` · ${day.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}` : ''}</span>
        {!late && (
          <>
            <span className="mt-[18px] font-display text-wall-headline font-semibold lining-nums">{day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            {forecast && <span className="mt-[18px] text-wall-body text-wall-ink-2">{forecast}</span>}
            <div className="my-[40px] h-px bg-wall-rule" />
          </>
        )}
        <span className={`text-wall-label font-bold tracking-[0.22em] text-wall-ink-2 ${late ? 'mt-[24px]' : ''}`}>FIRST OUT</span>
        {first ? (
          <div className="mt-[16px] flex min-w-0 items-center gap-[40px]">
            {first.leaveTime && <span className="shrink-0 font-display text-wall-clock-rail font-medium lining-nums text-wall-brass">{first.leaveTime}</span>}
            <div className="flex min-w-0 flex-col gap-[10px]">
              <span className="line-clamp-2 font-display text-wall-rail-title font-semibold">{first.title}</span>
              <span className="text-wall-body text-wall-ink-2">{first.timing}</span>
            </div>
          </div>
        ) : (
          <span className="mt-[16px] font-display text-wall-move font-semibold italic text-wall-ink-2">Nothing on the road</span>
        )}
        {!late && ready && ready.total > 0 && (
          <>
            <div className="my-[40px] h-px bg-wall-rule" />
            <section aria-label="Get ready" className="flex max-w-[620px] flex-col">
              <span className="text-wall-label font-bold tracking-[0.22em] text-wall-ink-2">GET READY · {ready.packed} OF {ready.total} DONE</span>
              <div aria-hidden="true" className="mt-[18px] h-[8px] overflow-hidden rounded-full bg-wall-rule">
                <div className="h-full rounded-full bg-wall-brass" style={{ width: `${Math.round((ready.packed / ready.total) * 100)}%` }} />
              </div>
              {ready.headings.length > 0 && <span className="mt-[16px] truncate text-wall-body text-wall-ink-2">{ready.headings.join(' · ')}</span>}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
