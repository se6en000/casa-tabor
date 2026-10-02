import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { WallEvent, WallMember } from '../wall/engine/types'
import { pigmentStyleFor } from '../wall/lanes'
import { dayLine, monthCells, monthDots } from './month'
import { useSheetSwipe } from './phoneShell'

// Any day (canvas 30b; Jake, Oct 2: "a way to tap to open any date. Not just the 7 day window"): the month, a dot for
// each person with something on the calendar that day, today ringed; a tap picks a day and shows its first line,
// "Open" opens it; ‹ › or a swipe across the grid changes the month; Today comes back.

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

export default function PhoneMonth({ now, members, pigments, useMonth, onOpen, onClose }: {
  now: Date
  members: WallMember[]
  pigments: Map<string, number>
  /** The month's events (fetched while this is open). */
  useMonth: (month: Date) => WallEvent[]
  onOpen: (date: Date) => void
  onClose: () => void
}) {
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  const [picked, setPicked] = useState<Date>(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  const events = useMonth(month)
  const dots = useMemo(() => monthDots(events, month, members), [events, month, members])
  const swipe = useSheetSwipe(onClose)
  const across = useRef<{ x: number; y: number } | null>(null)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const step = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))
  const pickedHere = picked.getMonth() === month.getMonth() && picked.getFullYear() === month.getFullYear()
  const label = (d: Date) => (sameDay(d, today) ? 'Today' : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`)

  return (
    <div className="phone-scrim absolute inset-0 z-40 flex items-end bg-wall-ink/30" onClick={onClose}>
      <section {...swipe} aria-label="Any day" onClick={(e) => e.stopPropagation()} className="phone-sheet flex w-full flex-col gap-[12px] rounded-t-[26px] bg-phone-ground px-[20px] pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] pt-[10px]">
        <div aria-hidden="true" className="mx-auto h-[5px] w-[38px] rounded-full bg-wall-stone" />
        <div className="flex items-center justify-between">
          <button type="button" aria-label="The month before" onClick={() => step(-1)} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink-2"><ChevronLeft size={20} /></button>
          <h2 className="m-0 font-display text-phone-title font-bold text-wall-ink">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
          <button type="button" aria-label="The month after" onClick={() => step(1)} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink-2"><ChevronRight size={20} /></button>
        </div>
        <div
          onTouchStart={(e) => { across.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
          onTouchEnd={(e) => {
            const s = across.current
            across.current = null
            if (!s) return
            const dx = e.changedTouches[0].clientX - s.x
            const dy = e.changedTouches[0].clientY - s.y
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1)
          }}
        >
          <div aria-hidden="true" className="grid grid-cols-7 text-center text-phone-label font-bold tracking-[0.12em] text-wall-ink-2">
            {WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div role="grid" aria-label={month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} className="mt-[6px] grid grid-cols-7 gap-y-[2px]">
            {monthCells(month).map((d, i) => {
              if (d == null) return <span key={`b${i}`} />
              const date = new Date(month.getFullYear(), month.getMonth(), d)
              const isToday = sameDay(date, today)
              const isPicked = sameDay(date, picked)
              const before = date < today
              return (
                <button
                  key={d}
                  type="button"
                  aria-label={date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  aria-pressed={isPicked}
                  onClick={() => setPicked(date)}
                  onDoubleClick={() => onOpen(date)}
                  className="flex h-[54px] flex-col items-center gap-[4px] border-0 bg-transparent p-0 pt-[4px]"
                >
                  <span className={`flex h-[36px] w-[36px] items-center justify-center rounded-full text-phone-body tabular-nums ${isPicked ? 'bg-wall-ink font-bold text-wall-on-pigment' : isToday ? 'border-2 border-solid border-wall-ink font-bold text-wall-ink' : before ? 'text-wall-ink-2' : 'text-wall-ink'}`}>{d}</span>
                  <span aria-hidden="true" className={`flex h-[5px] gap-[2px] ${before ? 'opacity-40' : ''}`}>
                    {(dots.get(d) ?? []).slice(0, 4).map((id) => <span key={id} className={`h-[5px] w-[5px] rounded-full ${pigmentStyleFor(pigments.get(id) ?? 0).solid}`} />)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        {pickedHere && (
          <button type="button" onClick={() => onOpen(picked)} className="flex items-center gap-[12px] rounded-[16px] border-0 bg-phone-card px-[14px] py-[12px] text-left text-wall-ink">
            <span className="flex w-[44px] shrink-0 flex-col items-center">
              <span className="text-phone-label font-extrabold tracking-[0.14em] text-wall-brass-ink">{picked.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</span>
              <span className="font-display text-phone-heading font-bold leading-none">{picked.getDate()}</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="truncate text-phone-body font-semibold">{dayLine(events, picked)}</span>
              <span className="text-phone-detail text-wall-ink-2">Open the day ›</span>
            </span>
          </button>
        )}
        <div className="flex justify-between">
          <button type="button" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setPicked(today) }} className="h-[44px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[18px] text-phone-body font-semibold text-wall-ink">Today</button>
          <button type="button" disabled={!pickedHere} onClick={() => onOpen(picked)} className="h-[44px] rounded-full border-0 bg-wall-ink px-[18px] text-phone-body font-semibold text-wall-on-pigment disabled:opacity-40">Open {label(picked)}</button>
        </div>
      </section>
    </div>
  )
}
