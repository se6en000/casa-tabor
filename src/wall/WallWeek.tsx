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
}

export default function WallWeek({ days, members, pigmentOf, shownKey, onSelect }: WallWeekProps) {
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? ''
  return (
    <section aria-label="Next seven days" className="flex shrink-0 flex-col">
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
              className={`flex h-[124px] min-w-0 flex-1 flex-col justify-between rounded-[18px] bg-transparent text-left text-wall-ink ${selected ? 'border-[3px] border-solid border-wall-ink px-[18px] py-[12px]' : 'border border-solid border-wall-rule px-[20px] py-[14px]'}`}
            >
              <div className="flex items-baseline justify-between gap-[8px]">
                <div className="flex items-baseline gap-[10px]">
                  <span className={`text-wall-label font-bold tracking-[0.15em] ${selected ? 'text-wall-brass-ink' : 'text-wall-ink-2'}`}>{day.weekday.toUpperCase()}</span>
                  <span className="font-display text-wall-heading font-bold lining-nums">{day.dayNumber}</span>
                </div>
                {day.decisionCount > 0 && (
                  <span aria-hidden="true" className="flex h-[28px] min-w-[28px] items-center justify-center rounded-full border-2 border-solid border-wall-brass px-[6px] text-wall-label font-bold text-wall-brass-ink">
                    ?
                  </span>
                )}
              </div>
              <div aria-hidden="true" className="flex h-[18px] gap-[6px]">
                {day.memberIds.map((id) => (
                  <span key={id} className={`h-[18px] w-[18px] rounded-full ${pigmentStyleFor(pigmentOf(id) ?? 0).solid}`} />
                ))}
              </div>
              <div className="flex items-baseline justify-between gap-[8px]">
                <span className={`truncate text-wall-detail ${selected ? 'font-semibold text-wall-ink' : 'text-wall-ink-2'}`}>{day.firstOut}</span>
                {day.toDo > 0 && <span className="shrink-0 text-wall-label font-bold text-wall-brass-ink">{day.toDo} to do</span>}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
