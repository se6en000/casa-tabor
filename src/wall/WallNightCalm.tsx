import { useMemo, type ReactNode } from 'react'
import type { DayPlan, WallMember } from './engine/types'
import { selectNextMove } from './engine/nextMove'
import { describeNextMove } from './header'
import { forecastLine } from './posture'
import type { PackingGroup, WallChecklistItem } from './packing'
import { GetReady } from './WallPrep'
import { RailClock, RailRule, RailShell } from './WallRail'

// A night Calm (canvas 36a/36b; Jake, Oct 2: "does calm view have a night time version? that it could auto switch after
// some time away? kinda like how the day version works?" → "approved"). In the evening, once nobody has touched the wall
// for a while, the full evening face settles to this: the clock in warm gold, tomorrow's date and weather, the first one
// out, anything still tonight. After midnight it's dimmer still: the clock and the first one out. A touch brings back
// the full evening (WallView). Canvas 56A calm at night: the left panel keeps the gold clock and what's still due
// tonight; the stage is one glance at tomorrow — the date, the first one out, how ready it is.

export default function WallNightCalm({ now, members, plan, today = null, packing = null, onToggleItem }: {
  now: Date
  members: WallMember[]
  /** The day ahead: tomorrow before midnight, the day just begun after it. */
  plan: DayPlan | null
  /** Today's panel (WallTodayPanel): what's still to do tonight. */
  today?: ReactNode
  /** Tomorrow's lists — the same GET READY cards as everywhere (canvas 79R; it was a bar here). */
  packing?: { groups: PackingGroup[]; packed: number; total: number } | null
  onToggleItem?: (item: WallChecklistItem) => void
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
        {!late && today && (
          <>
            <RailRule />
            {today}
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
        {!late && packing && packing.total > 0 && (
          <>
            <div className="my-[40px] h-px bg-wall-rule" />
            <GetReady packing={packing} cards={3} lines={3} onToggleItem={onToggleItem} />
          </>
        )}
      </div>
    </div>
  )
}
