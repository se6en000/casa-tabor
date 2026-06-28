import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  addMonths,
} from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../utils/cn'

interface Props {
  value: string
  onChange: (nextDate: string) => void
  className?: string
}

function parseDate(value: string): Date {
  return new Date(`${value}T12:00:00`)
}

export default function InlineCalendarPicker({ value, onChange, className }: Props) {
  const selectedDate = useMemo(() => {
    const parsed = parseDate(value)
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed
  }, [value])
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(startOfMonth(selectedDate))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setCursor(startOfMonth(selectedDate))
  }, [open, selectedDate])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 })
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 })
  const days: Date[] = []
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d)

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full h-11 rounded-xl border border-casa-border bg-casa-bg px-3 text-left text-body-sm text-casa-navy hover:border-casa-gold transition-colors inline-flex items-center justify-between"
      >
        <span>{format(selectedDate, 'EEE, MMM d, yyyy')}</span>
        <Calendar size={16} className="text-casa-muted" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-2 rounded-xl border border-casa-border bg-casa-surface shadow-modal z-[120] p-3">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setCursor(prev => subMonths(prev, 1))}
              className="h-8 w-8 rounded-lg border border-casa-border text-casa-muted hover:text-casa-navy hover:border-casa-navy inline-flex items-center justify-center"
            >
              <ChevronLeft size={14} />
            </button>
            <p className="text-body-sm font-semibold text-casa-text">{format(cursor, 'MMMM yyyy')}</p>
            <button
              type="button"
              onClick={() => setCursor(prev => addMonths(prev, 1))}
              className="h-8 w-8 rounded-lg border border-casa-border text-casa-muted hover:text-casa-navy hover:border-casa-navy inline-flex items-center justify-center"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
              <p key={d} className="text-[10px] font-semibold text-casa-muted text-center uppercase">{d}</p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map(day => {
              const inMonth = isSameMonth(day, cursor)
              const selected = isSameDay(day, selectedDate)
              const today = isSameDay(day, new Date())
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    onChange(format(day, 'yyyy-MM-dd'))
                    setOpen(false)
                  }}
                  className={cn(
                    'h-8 rounded-md text-body-sm transition-colors',
                    selected
                      ? 'bg-casa-gold text-white font-semibold'
                      : inMonth
                      ? 'text-casa-text hover:bg-casa-bg'
                      : 'text-casa-muted/45 hover:bg-casa-bg',
                    today && !selected && 'border border-casa-gold/60',
                  )}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
