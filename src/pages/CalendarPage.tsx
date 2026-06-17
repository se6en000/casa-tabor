import { useState, useRef, useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCalendarStore } from '../stores/calendarStore'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, subDays, addMonths, subMonths, isValid } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import WeekView from '../components/calendar/WeekView'
import StackedView from '../components/calendar/StackedView'
import DayView from '../components/calendar/DayView'
import MonthView from '../components/calendar/MonthView'
import type { CalendarView } from '../types'

const views: { key: CalendarView; label: string }[] = [
  { key: 'today', label: 'Day' },
  { key: 'stacked', label: 'Stacked' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
]

export default function CalendarPage() {
  const { activeView, setActiveView, selectedDate, setSelectedDate } = useCalendarStore()
  const safeSelectedDate = isValid(selectedDate) ? selectedDate : new Date()


  // Track slide direction: 1 = forward (next), -1 = backward (prev), 0 = today jump
  const [direction, setDirection] = useState(1)

  const isDay = activeView === 'today'
  const isMonth = activeView === 'month'
  const isStacked = activeView === 'stacked'

  const headerBase = safeSelectedDate
  const weekStart = startOfWeek(headerBase, { weekStartsOn: 0 })
  const stackedEnd = addDays(headerBase, 7)

  const goToToday = () => { setDirection(0); setSelectedDate(new Date()) }
  const goPrev = useCallback(() => {
    setDirection(-1)
    if (isDay || isStacked) setSelectedDate(subDays(safeSelectedDate, 1))
    else if (isMonth) setSelectedDate(subMonths(safeSelectedDate, 1))
    else setSelectedDate(subWeeks(safeSelectedDate, 1))
  }, [isDay, isMonth, isStacked, safeSelectedDate, setSelectedDate])
  const goNext = useCallback(() => {
    setDirection(1)
    if (isDay || isStacked) setSelectedDate(addDays(safeSelectedDate, 1))
    else if (isMonth) setSelectedDate(addMonths(safeSelectedDate, 1))
    else setSelectedDate(addWeeks(safeSelectedDate, 1))
  }, [isDay, isMonth, isStacked, safeSelectedDate, setSelectedDate])

  const headerLabel = isDay
    ? format(safeSelectedDate, 'EEEE, MMMM d, yyyy')
    : isMonth
    ? format(safeSelectedDate, 'MMMM yyyy')
    : isStacked
    ? `${format(headerBase, 'MMM d')} – ${format(stackedEnd, stackedEnd.getMonth() === headerBase.getMonth() ? 'd, yyyy' : 'MMM d, yyyy')}`
    : `${format(weekStart, 'MMMM d')} – ${format(endOfWeek(safeSelectedDate, { weekStartsOn: 0 }), 'd, yyyy')}`

  // Touch swipe detection — skip if a modal/panel is open (z-index overlay)
  const touchStartX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-panel-overlay]')) return
    touchStartX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(delta) < 50) return
    if (delta < 0) goNext()  // swipe left → next
    else goPrev()             // swipe right → prev
  }

  // Mouse/pointer-drag swipe (kiosk touchscreens that deliver touch as mouse).
  // The global pointer-gesture fallback dispatches `casa:swipe` on the
  // [data-swipe-nav] container; translate it into calendar navigation.
  const swipeRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = swipeRef.current
    if (!el) return
    const handler = (e: Event) => {
      const dir = (e as CustomEvent<{ dir: 'next' | 'prev' }>).detail?.dir
      if (dir === 'next') goNext()
      else if (dir === 'prev') goPrev()
    }
    el.addEventListener('casa:swipe', handler)
    return () => el.removeEventListener('casa:swipe', handler)
  }, [goNext, goPrev])

  // Slide animation variants
  const variants = {
    enter: (d: number) => ({ x: d === 0 ? 0 : d > 0 ? '100%' : '-100%', opacity: d === 0 ? 0 : 1 }),
    center: { x: 0, opacity: 1 },
    exit:  (d: number) => ({ x: d === 0 ? 0 : d > 0 ? '-100%' : '100%', opacity: d === 0 ? 0 : 1 }),
  }

  const animKey = `${activeView}-${format(safeSelectedDate, 'yyyy-MM-dd')}`

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-casa-border bg-casa-bg">
        <div className="flex items-center gap-3">
          <button
            onClick={goToToday}
            className="px-3 py-1.5 rounded-button border border-casa-border text-body-sm font-semibold text-casa-text hover:bg-casa-surface transition-colors"
          >
            Today
          </button>
          <>
            <button onClick={goPrev} className="p-2.5 rounded-button hover:bg-casa-divider transition-colors text-casa-muted min-w-[44px] min-h-[44px] flex items-center justify-center">
              <ChevronLeft size={20} />
            </button>
            <button onClick={goNext} className="p-2.5 rounded-button hover:bg-casa-divider transition-colors text-casa-muted min-w-[44px] min-h-[44px] flex items-center justify-center">
              <ChevronRight size={20} />
            </button>
          </>
          <h2 className="font-display text-heading text-casa-text ml-2">
            {headerLabel}
          </h2>
        </div>

        <div className="hidden md:flex gap-1 bg-casa-surface border border-casa-border rounded-button p-1">
          {views.map((v) => (
            <button
              key={v.key}
              onClick={() => setActiveView(v.key)}
              className={`px-4 py-1.5 rounded-button text-body-sm font-medium transition-colors ${
                activeView === v.key
                  ? 'bg-casa-navy text-white shadow-card'
                  : 'text-casa-text hover:bg-casa-bg'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* View content — animated slide + swipe */}
      <div
        ref={swipeRef}
        data-swipe-nav
        className="flex-1 overflow-hidden relative touch-pan-y"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={animKey}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'tween', duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex flex-col"
          >
            {activeView === 'week' && <WeekView />}
            {activeView === 'stacked' && <StackedView />}
            {activeView === 'today' && <DayView />}
            {activeView === 'month' && <MonthView />}
          </motion.div>
        </AnimatePresence>
      </div>

    </div>
  )
}