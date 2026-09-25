import { useMemo } from 'react'
import { formatWallClock, formatWallDate } from './clock'
import { buildScore } from './score'
import { useMinuteClock } from './useMinuteClock'
import { useWallDay } from './useWallDay'
import WallScore from './WallScore'

export default function WallFrame() {
  const now = useMinuteClock()
  const { members, plan } = useWallDay(now)
  const score = useMemo(() => (plan ? buildScore(plan, members, now) : null), [plan, members, now])
  const clock = formatWallClock(now)

  return (
    <div className="flex h-full w-full flex-col gap-[28px] bg-wall-ground p-[44px] font-body text-wall-ink">
      <header className="flex h-[220px] shrink-0 items-stretch gap-[48px]">
        <div className="flex w-[520px] shrink-0 flex-col gap-[6px]">
          <div className="flex items-center gap-[12px]">
            <span
              aria-hidden="true"
              className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-wall-brass font-display text-wall-detail font-bold text-wall-brass-ink"
            >
              MT
            </span>
            <span className="text-wall-label font-semibold tracking-[0.25em] text-wall-brass-ink">MAISON TABOR</span>
          </div>
          <div className="mt-[2px] flex items-baseline gap-[10px]">
            <span className="font-display text-wall-clock font-medium lining-nums">{clock.time}</span>
            <span className="text-wall-heading font-semibold text-wall-ink-2">{clock.meridiem}</span>
          </div>
          <div className="font-display text-wall-date font-semibold">{formatWallDate(now)}</div>
        </div>

        <div className="w-px shrink-0 bg-wall-rule" />

        <section aria-label="Next move" className="flex min-w-0 flex-1 flex-col justify-center gap-[10px]">
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">NEXT MOVE</div>
          <p className="m-0 font-display text-wall-date italic text-wall-ink-2">
            Being built — the next departure will appear here.
          </p>
        </section>
      </header>

      <WallScore score={score} now={now} />
    </div>
  )
}
