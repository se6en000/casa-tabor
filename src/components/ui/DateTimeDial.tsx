import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addDays, format, isToday, isTomorrow, startOfDay } from 'date-fns'
import { Clock } from 'lucide-react'
import { cn } from '../../utils/cn'
import { Button } from './Button'
import { FormSummaryCard } from './FormSummaryCard'

type WheelParts = { dayTs: number; hour12: number; minute: number; ampm: 'AM' | 'PM' }
type WheelItem = { value: number | string; label: string }

export interface DateTimeDialProps {
  startValue: string
  endValue: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  startChangeEndOffsetMinutes?: number
  defaultExpanded?: boolean
  onInteraction?: () => void
}

const ITEM_HEIGHT = 46
const VISIBLE_ITEMS = 5
const WHEEL_PADDING = ((VISIBLE_ITEMS - 1) / 2) * ITEM_HEIGHT
const HOURS = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: String(index + 1) }))
const MINUTES = Array.from({ length: 12 }, (_, index) => ({ value: index * 5, label: String(index * 5).padStart(2, '0') }))
const DAY_PERIODS: WheelItem[] = [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }]

function parseLocal(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function toLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function wheelParts(value: string): WheelParts {
  const date = parseLocal(value)
  const hour = date.getHours()
  return {
    dayTs: startOfDay(date).getTime(),
    hour12: ((hour + 11) % 12) + 1,
    minute: (Math.round(date.getMinutes() / 5) * 5) % 60,
    ampm: hour >= 12 ? 'PM' : 'AM',
  }
}

function combine(parts: WheelParts) {
  const date = new Date(parts.dayTs)
  date.setHours((parts.hour12 % 12) + (parts.ampm === 'PM' ? 12 : 0), parts.minute, 0, 0)
  return date
}

function durationLabel(startValue: string, endValue: string) {
  const minutes = Math.round((parseLocal(endValue).getTime() - parseLocal(startValue).getTime()) / 60000)
  if (minutes <= 0) return 'Check end time'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return [hours ? `${hours} hr` : '', remainder ? `${remainder} min` : ''].filter(Boolean).join(' ')
}

function dayLabel(date: Date) {
  if (isToday(date)) return 'Today'
  if (isTomorrow(date)) return 'Tomorrow'
  return format(date, 'EEE, MMM d')
}

const WheelColumn = memo(function WheelColumn({ items, value, onChange, onPreview, label, wide = false }: {
  items: WheelItem[]
  value: number | string
  onChange: (value: number | string) => void
  onPreview?: (value: number | string) => void
  label: string
  wide?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<number | undefined>(undefined)
  const userScrolling = useRef(false)
  const pointerActive = useRef(false)
  const selectedIndex = Math.max(0, items.findIndex(item => item.value === value))
  const highlightedIndexRef = useRef(selectedIndex)
  const optionRefs = useRef(new Map<number, HTMLDivElement>())

  const applyOptionAppearance = useCallback((index: number, selected: number) => {
    const option = optionRefs.current.get(index)
    if (!option) return
    const distance = Math.abs(index - selected)
    option.setAttribute('aria-selected', String(distance === 0))
    option.style.opacity = String(distance === 0 ? 1 : distance === 1 ? 0.5 : 0.2)
    option.style.fontWeight = String(distance === 0 ? 700 : 500)
    option.style.transform = distance === 0 ? 'scale(1)' : 'scale(0.9)'
  }, [])

  const updateHighlightedOption = useCallback((nextIndex: number) => {
    const previousIndex = highlightedIndexRef.current
    for (const index of new Set([
      ...Array.from({ length: 5 }, (_, offset) => previousIndex + offset - 2),
      ...Array.from({ length: 5 }, (_, offset) => nextIndex + offset - 2),
    ])) {
      applyOptionAppearance(index, nextIndex)
    }
    highlightedIndexRef.current = nextIndex
  }, [applyOptionAppearance])

  useEffect(() => () => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current)
  }, [])

  useLayoutEffect(() => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current)
    userScrolling.current = false
    updateHighlightedOption(selectedIndex)
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = selectedIndex * ITEM_HEIGHT
  }, [items, selectedIndex, updateHighlightedOption, value])

  const beginUserScroll = () => {
    userScrolling.current = true
    if (settleTimer.current) window.clearTimeout(settleTimer.current)
  }

  const scheduleSelectionCommit = () => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      commitSelection()
    }, 80)
  }

  const commitSelection = () => {
    if (!scrollRef.current || !userScrolling.current) return
    if (settleTimer.current) {
      window.clearTimeout(settleTimer.current)
      settleTimer.current = undefined
    }
    const index = Math.max(0, Math.min(items.length - 1, Math.round(scrollRef.current.scrollTop / ITEM_HEIGHT)))
    const picked = items[index]
    userScrolling.current = false
    updateHighlightedOption(index)
    scrollRef.current.scrollTop = index * ITEM_HEIGHT
    if (picked && picked.value !== value) {
      navigator.vibrate?.(6)
      onChange(picked.value)
    }
  }

  const handlePointerDown = () => {
    pointerActive.current = true
    beginUserScroll()
  }

  const handlePointerUp = () => {
    pointerActive.current = false
    scheduleSelectionCommit()
  }

  const handleScroll = () => {
    if (!userScrolling.current) return
    if (!scrollRef.current) return
    const index = Math.max(0, Math.min(items.length - 1, Math.round(scrollRef.current.scrollTop / ITEM_HEIGHT)))
    if (index !== highlightedIndexRef.current) {
      updateHighlightedOption(index)
      onPreview?.(items[index].value)
    }
    // Touch scrolling can pause for longer than the debounce while the finger is
    // still down. Wait for release so a slow drag cannot commit the prior value.
    if (!pointerActive.current) scheduleSelectionCommit()
  }

  return (
    <div className={cn('relative overflow-hidden', wide ? 'flex-[2.4]' : 'flex-1')} style={{ height: VISIBLE_ITEMS * ITEM_HEIGHT }}>
      <div
        ref={scrollRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={beginUserScroll}
        onBlur={handlePointerUp}
        onKeyDown={beginUserScroll}
        onScroll={handleScroll}
        aria-label={label}
        role="listbox"
        className="h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ height: WHEEL_PADDING }} />
        {items.map((item, index) => {
          const distance = Math.abs(index - selectedIndex)
          return (
            <div
              key={String(item.value)}
              ref={(element) => {
                if (element) optionRefs.current.set(index, element)
                else optionRefs.current.delete(index)
              }}
              role="option"
              aria-selected={distance === 0}
              className="flex snap-center select-none items-center justify-center whitespace-nowrap text-heading transition-[opacity,transform]"
              style={{
                height: ITEM_HEIGHT,
                opacity: distance === 0 ? 1 : distance === 1 ? 0.5 : 0.2,
                fontWeight: distance === 0 ? 700 : 500,
                transform: distance === 0 ? 'scale(1)' : 'scale(0.9)',
              }}
            >
              {item.label}
            </div>
          )
        })}
        <div style={{ height: WHEEL_PADDING }} />
      </div>
      <div className="pointer-events-none absolute inset-x-1 top-1/2 h-[46px] -translate-y-1/2 rounded-button border-y border-casa-gold/40 bg-casa-gold/10" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-casa-bg to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-casa-bg to-transparent" />
    </div>
  )
})

const WheelRow = memo(function WheelRow({ value, onChange, onPreview, days }: {
  value: string
  onChange: (value: string) => void
  onPreview: (value: string) => void
  days: WheelItem[]
}) {
  const { dayTs, hour12, minute, ampm } = wheelParts(value)
  const parts = { dayTs, hour12, minute, ampm }
  const patch = useCallback((next: Partial<WheelParts>) => onChange(toLocalValue(combine({ dayTs, hour12, minute, ampm, ...next }))), [ampm, dayTs, hour12, minute, onChange])
  const preview = useCallback((next: Partial<WheelParts>) => onPreview(toLocalValue(combine({ dayTs, hour12, minute, ampm, ...next }))), [ampm, dayTs, hour12, minute, onPreview])
  const handleDayChange = useCallback((next: number | string) => patch({ dayTs: next as number }), [patch])
  const handleHourChange = useCallback((next: number | string) => patch({ hour12: next as number }), [patch])
  const handleMinuteChange = useCallback((next: number | string) => patch({ minute: next as number }), [patch])
  const handlePeriodChange = useCallback((next: number | string) => patch({ ampm: next as 'AM' | 'PM' }), [patch])
  const handleDayPreview = useCallback((next: number | string) => preview({ dayTs: next as number }), [preview])
  const handleHourPreview = useCallback((next: number | string) => preview({ hour12: next as number }), [preview])
  const handleMinutePreview = useCallback((next: number | string) => preview({ minute: next as number }), [preview])
  const handlePeriodPreview = useCallback((next: number | string) => preview({ ampm: next as 'AM' | 'PM' }), [preview])
  return (
    <div className="relative flex gap-1 rounded-card border border-casa-border bg-casa-bg px-2 text-content-heading">
      <WheelColumn wide label="Date" items={days} value={parts.dayTs} onChange={handleDayChange} onPreview={handleDayPreview} />
      <WheelColumn label="Hour" items={HOURS} value={parts.hour12} onChange={handleHourChange} onPreview={handleHourPreview} />
      <WheelColumn label="Minute" items={MINUTES} value={parts.minute} onChange={handleMinuteChange} onPreview={handleMinutePreview} />
      <WheelColumn label="AM or PM" items={DAY_PERIODS} value={parts.ampm} onChange={handlePeriodChange} onPreview={handlePeriodPreview} />
    </div>
  )
})

export function DateTimeDial({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  startChangeEndOffsetMinutes,
  defaultExpanded = false,
  onInteraction,
}: DateTimeDialProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [previewStart, setPreviewStart] = useState<string | null>(null)
  const [previewEnd, setPreviewEnd] = useState<string | null>(null)
  const startDayKey = startValue.slice(0, 10)
  const days = useMemo(() => {
    const anchor = startOfDay(addDays(parseLocal(`${startDayKey}T00:00`), -30))
    return Array.from({ length: 400 }, (_, index) => {
      const date = addDays(anchor, index)
      return { value: startOfDay(date).getTime(), label: dayLabel(date) }
    })
  }, [startDayKey])

  const durationMs = startChangeEndOffsetMinutes === undefined
    ? Math.max(5 * 60_000, parseLocal(endValue).getTime() - parseLocal(startValue).getTime())
    : startChangeEndOffsetMinutes * 60_000
  const updateStart = useCallback((value: string) => {
    onStartChange(value)
    onEndChange(toLocalValue(new Date(parseLocal(value).getTime() + durationMs)))
    setPreviewStart(null)
    setPreviewEnd(null)
    onInteraction?.()
  }, [durationMs, onEndChange, onInteraction, onStartChange])
  const updateEnd = useCallback((value: string) => {
    onEndChange(value)
    setPreviewEnd(null)
    onInteraction?.()
  }, [onEndChange, onInteraction])
  const previewStartChange = useCallback((value: string) => {
    setPreviewStart(value)
    setPreviewEnd(toLocalValue(new Date(parseLocal(value).getTime() + durationMs)))
  }, [durationMs])
  const previewStartValue = previewStart ?? startValue
  const previewEndValue = previewEnd ?? endValue
  const start = parseLocal(previewStartValue)
  const end = parseLocal(previewEndValue)
  const sameDay = start.toDateString() === end.toDateString()

  return (
    <div className="space-y-3">
      <FormSummaryCard
        icon={<Clock size={20} />}
        title={`${format(start, 'EEE, MMM d · h:mm a')}–${format(end, sameDay ? 'h:mm a' : 'EEE, MMM d · h:mm a')}`}
        detail={durationLabel(previewStartValue, previewEndValue)}
        action={<Button variant="secondary" size="sm" onClick={() => setExpanded(value => !value)}>{expanded ? 'Done' : 'Change'}</Button>}
      />
      {expanded && (
        <div className="grid gap-4">
          <div>
            <p className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-casa-muted">Start</p>
            <WheelRow
              value={startValue}
              onChange={updateStart}
              onPreview={previewStartChange}
              days={days}
            />
          </div>
          <div>
            <p className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-casa-muted">End</p>
            <WheelRow value={endValue} onChange={updateEnd} onPreview={setPreviewEnd} days={days} />
          </div>
        </div>
      )}
    </div>
  )
}
