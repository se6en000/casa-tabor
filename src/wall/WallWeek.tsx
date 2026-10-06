import { Car, Plane } from 'lucide-react'
import type { WallMember } from './engine/types'
import { pigmentStyleFor } from './lanes'
import type { WeekDay } from './week'

// The week strip under the Score (P3.9): seven quiet cells, today first. A cell
// shows who has something, how early the day starts, and a "?" when a question
// is waiting there. Tapping one shows that day's Score.

export interface WallWeekProps {
  days: WeekDay[]
  members: WallMember[]
  pigmentOf: (memberId: string) => number | null
  /** The day on show (today unless one was tapped). */
  shownKey: string
  onSelect: (date: Date) => void
  /** The eighth tile (board 07a): what needs planning; opens Coming up. */
  comingUp?: { count: number; startNow: number; open: boolean; onOpen: () => void } | null
  /** The To do tile (board 09a/09b): how many are ready now; opens the list. */
  todo?: { ready: number; line: string; open: boolean; onOpen: () => void } | null
}

export default function WallWeek({ days, members, pigmentOf, shownKey, onSelect, comingUp = null, todo = null }: WallWeekProps) {
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? ''
  return (
    // Pinned to the bottom of every face, so it never moves as the days are swiped (Jake, 2026-10-01: "like the strip
    // to be in the same place across all dates").
    <section aria-label="Next seven days" className="mt-auto flex shrink-0 flex-col">
      <div className="flex gap-[12px]">
        {days.map((day) => {
          const selected = day.key === shownKey
          return (
            <button
              key={day.key}
              type="button"
              aria-label={`${day.isToday ? 'Today' : day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}: ${day.memberIds.map(nameOf).join(', ') || 'nothing planned'}${day.decisionCount ? `, ${day.decisionCount} to decide` : ''}`}
              aria-pressed={selected}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(day.date)
              }}
              className={`flex h-[124px] min-w-0 flex-1 flex-col justify-between rounded-[18px] bg-wall-paper shadow-[0_1px_0_rgba(38,34,29,0.06),0_6px_18px_rgba(38,34,29,0.06)] text-left text-wall-ink ${selected ? 'border-[3px] border-solid border-wall-ink px-[18px] py-[12px]' : 'border border-solid border-wall-rule px-[20px] py-[14px]'}`}
            >
              <div className="flex items-baseline gap-[10px]">
                <span className={`text-wall-label font-bold tracking-[0.15em] ${selected ? 'text-wall-brass-ink' : 'text-wall-ink-2'}`}>{day.weekday.toUpperCase()}</span>
                <span className="font-display text-wall-heading font-bold lining-nums">{day.dayNumber}</span>
              </div>
              {/* The "?" sits with the dots: with nine tiles, "TOMORROW 26" leaves no room beside it. */}
              {/* Six people and the "?" have to fit inside the tile's own border (on the wall, Oct 1, the "?" ran into
                  it): 16 px dots, 4 px apart, a 24 px "?". */}
              <div aria-hidden="true" className="flex h-[28px] items-center justify-between gap-[4px]">
                <span className="flex gap-[4px]">
                  {day.memberIds.map((id) => (day.awayIds.includes(id)
                    // Away on a trip: their dot becomes a tiny plane in their colour (Jake, canvas 19a).
                    ? (day.drivingIds.includes(id)
                      ? <Car key={id} data-away={id} size={17} strokeWidth={2.6} className={pigmentStyleFor(pigmentOf(id) ?? 0).text} />
                      : <Plane key={id} data-away={id} size={17} strokeWidth={2.6} className={pigmentStyleFor(pigmentOf(id) ?? 0).text} />)
                    : <span key={id} className={`h-[16px] w-[16px] rounded-full ${pigmentStyleFor(pigmentOf(id) ?? 0).solid}`} />))}
                </span>
                {day.decisionCount > 0 && (
                  <span className="flex h-[24px] min-w-[24px] shrink-0 items-center justify-center rounded-full border-2 border-solid border-wall-brass px-[4px] text-wall-label font-bold text-wall-brass-ink">
                    ?
                  </span>
                )}
              </div>
              <div className="flex items-baseline justify-between gap-[8px]">
                {/* With "2 to do" beside it, "First out 7:25" became "First ou…": "Out 7:25" fits whole. */}
                {day.leftTonight
                  ? <span className="truncate text-wall-detail font-bold text-wall-brass-ink">{day.leftTonight} left tonight</span>
                  : <span className={`truncate text-wall-detail ${selected ? 'font-semibold text-wall-ink' : 'text-wall-ink-2'}`}>{day.toDo > 0 ? day.firstOut.replace(/^First out /, 'Out ') : day.firstOut}</span>}
                {day.toDo > 0 && <span className="shrink-0 text-wall-label font-bold text-wall-brass-ink">{day.toDo} to do</span>}
              </div>
            </button>
          )
        })}
        {comingUp && (
          <button
            type="button"
            aria-label={`Coming up: ${comingUp.count} to plan${comingUp.startNow ? `, ${comingUp.startNow} to start now` : ''}`}
            aria-pressed={comingUp.open}
            onClick={(event) => {
              event.stopPropagation()
              comingUp.onOpen()
            }}
            className={`flex h-[124px] min-w-0 flex-[1.2] flex-col justify-between rounded-[18px] bg-wall-paper shadow-[0_1px_0_rgba(38,34,29,0.06),0_6px_18px_rgba(38,34,29,0.06)] text-left text-wall-ink ${comingUp.open ? 'border-[3px] border-solid border-wall-ink px-[18px] py-[12px]' : 'border border-solid border-wall-brass px-[20px] py-[14px]'}`}
          >
            <span className="text-wall-label font-bold tracking-[0.15em] text-wall-brass-ink">COMING UP</span>
            <span className="font-display text-wall-heading font-bold leading-none">{comingUp.count} to plan</span>
            <span className={`truncate text-wall-label font-bold ${comingUp.startNow ? 'text-wall-rust' : 'text-wall-ink-2'}`}>
              {comingUp.startNow ? `${comingUp.startNow} to start now` : 'Nothing to start yet'}
            </span>
          </button>
        )}
        {todo && (
          <button
            type="button"
            aria-label={`To do: ${todo.ready} ready now`}
            aria-pressed={todo.open}
            onClick={(event) => {
              event.stopPropagation()
              todo.onOpen()
            }}
            className={`flex h-[124px] min-w-0 flex-[1.2] flex-col justify-between rounded-[18px] bg-wall-paper shadow-[0_1px_0_rgba(38,34,29,0.06),0_6px_18px_rgba(38,34,29,0.06)] text-left text-wall-ink ${todo.open ? 'border-[3px] border-solid border-wall-ink px-[18px] py-[12px]' : 'border border-solid border-wall-brass px-[20px] py-[14px]'}`}
          >
            <span className="text-wall-label font-bold tracking-[0.15em] text-wall-brass-ink">TO DO</span>
            <span className="font-display text-wall-heading font-bold leading-none">{todo.ready ? `${todo.ready} ready` : 'All clear'}</span>
            <span className="truncate text-wall-label font-bold text-wall-ink-2">{todo.line}</span>
          </button>
        )}
      </div>
    </section>
  )
}
