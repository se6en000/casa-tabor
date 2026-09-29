import { useState } from 'react'

// A date, any month ahead (a project's target date can be months out; a to-do's date too). Shared by
// the to-do sheet and the project screen (P3.22 step 5). "YYYY-MM-DD" in, "YYYY-MM-DD" or null out.

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fromYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export interface WallDatePickerProps {
  value: string | null
  now: Date
  onPick: (date: string | null) => void
  /** "No date" for a to-do, "No target" for a project. */
  clearLabel: string
}

export default function WallDatePicker({ value, now, onPick, clearLabel }: WallDatePickerProps) {
  const start = value ? fromYmd(value) : now
  const [month, setMonth] = useState(new Date(start.getFullYear(), start.getMonth(), 1))
  const first = new Date(month)
  const lead = first.getDay()
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const today = ymd(now)
  const step = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  const cell = 'h-[52px] rounded-[10px] text-wall-detail font-semibold'

  return (
    <div className="flex flex-col gap-[10px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Month before" onClick={() => step(-1)} className="h-[48px] w-[64px] rounded-full border border-solid border-wall-rule bg-transparent text-wall-heading text-wall-ink">‹</button>
        <span className="font-display text-wall-date font-semibold">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <button type="button" aria-label="Month after" onClick={() => step(1)} className="h-[48px] w-[64px] rounded-full border border-solid border-wall-rule bg-transparent text-wall-heading text-wall-ink">›</button>
      </div>
      <div className="grid grid-cols-7 gap-[6px]">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="text-center text-wall-label font-bold text-wall-ink-2">{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const date = ymd(new Date(month.getFullYear(), month.getMonth(), i + 1))
          const on = date === value
          return (
            <button
              key={date}
              type="button"
              aria-pressed={on}
              aria-label={fromYmd(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              onClick={() => onPick(date)}
              className={`${cell} ${on ? 'border-0 bg-wall-ink text-wall-on-pigment' : date === today ? 'border-2 border-solid border-wall-brass bg-transparent text-wall-ink' : 'border border-solid border-wall-rule bg-transparent text-wall-ink'}`}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
      <button type="button" onClick={() => onPick(null)} className={`self-start h-[48px] rounded-full px-[20px] text-wall-detail font-semibold ${value ? 'border border-solid border-wall-ink-2 bg-transparent text-wall-ink' : 'border-0 bg-wall-ink text-wall-on-pigment'}`}>
        {clearLabel}
      </button>
    </div>
  )
}
