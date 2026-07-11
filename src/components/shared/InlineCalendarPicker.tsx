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
import { Button, IconButton } from '../ui'

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
      <Button
        type="button"
        onClick={() => {
          if (!open) setCursor(startOfMonth(selectedDate))
          setOpen(v => !v)
        }}
        variant="secondary"
        fullWidth
        trailingIcon={<Calendar size={18} className="text-casa-muted" />}
        className="justify-between"
      >
        <span>{format(selectedDate, 'EEE, MMM d, yyyy')}</span>
      </Button>
      {open && (
        <div className="absolute left-0 right-0 z-popover mt-2 rounded-card border border-casa-border bg-casa-surface p-3 shadow-modal">
          <div className="flex items-center justify-between mb-2">
            <IconButton
              icon={<ChevronLeft size={18} />}
              aria-label="Previous month"
              onClick={() => setCursor(prev => subMonths(prev, 1))}
              variant="secondary"
              size="sm"
            />
            <p className="text-body-sm font-semibold text-casa-text">{format(cursor, 'MMMM yyyy')}</p>
            <IconButton
              icon={<ChevronRight size={18} />}
              aria-label="Next month"
              onClick={() => setCursor(prev => addMonths(prev, 1))}
              variant="secondary"
              size="sm"
            />
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayLabel, index) => (
              <p key={`${dayLabel}-${index}`} className="text-caption font-semibold text-casa-muted text-center uppercase">{dayLabel}</p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map(day => {
              const inMonth = isSameMonth(day, cursor)
              const selected = isSameDay(day, selectedDate)
              const today = isSameDay(day, new Date())
              return (
                <Button
                  variant="ghost"
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    onChange(format(day, 'yyyy-MM-dd'))
                    setOpen(false)
                  }}
                  className={cn(
                    'min-h-control-sm rounded-button text-body-sm transition-colors',
                    selected
                      ? 'casa-action-primary bg-casa-gold font-semibold'
                      : inMonth
                      ? 'text-casa-text hover:bg-casa-bg'
                      : 'text-casa-muted/45 hover:bg-casa-bg',
                    today && !selected && 'border border-casa-gold/60',
                  )}
                >
                  {format(day, 'd')}
                </Button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
