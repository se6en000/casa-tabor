import { useState, useRef, useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCalendarStore } from '../stores/calendarStore'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, subDays, addMonths, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import WeekView from '../components/calendar/WeekView'
import StackedView from '../components/calendar/StackedView'
import DayView from '../components/calendar/DayView'
import MonthView from '../components/calendar/MonthView'
import PalmBeachFolioCard from '../components/calendar/PalmBeachFolioCard'
import { Button, IconButton, SegmentedControl } from '../components/ui'
import RecurringDeleteUndoHost from '../components/calendar/RecurringDeleteUndoHost'

const CALENDAR_VIEW_OPTIONS = [
  { value: 'today', label: 'Day' },
  { value: 'stacked', label: 'Stacked' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const

export default function CalendarPage() {
  const { activeView, setActiveView, selectedDate, setSelectedDate } = useCalendarStore()
  const [folioOpen, setFolioOpen] = useState(false)


  // Track slide direction: 1 = forward (next), -1 = backward (prev), 0 = today jump
  const [direction, setDirection] = useState(1)

  const isDay = activeView === 'today'
  const isMonth = activeView === 'month'
  const isStacked = activeView === 'stacked'

  // Stacked view's 8-day window is anchored to selectedDate (same state driving swipe/prev/
  // next), not always "today" — so the header label and navigation move together.
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 })
  const stackedEnd = addDays(selectedDate, 7)

  const goToToday = () => { setDirection(0); setSelectedDate(new Date()) }
  const goPrev = useCallback(() => {
    setDirection(-1)
    if (isDay) setSelectedDate(subDays(selectedDate, 1))
    else if (isMonth) setSelectedDate(subMonths(selectedDate, 1))
    else if (isStacked) setSelectedDate(subDays(selectedDate, 8))
    else setSelectedDate(subWeeks(selectedDate, 1))
  }, [isDay, isMonth, isStacked, selectedDate, setSelectedDate])
  const goNext = useCallback(() => {
    setDirection(1)
    if (isDay) setSelectedDate(addDays(selectedDate, 1))
    else if (isMonth) setSelectedDate(addMonths(selectedDate, 1))
    else if (isStacked) setSelectedDate(addDays(selectedDate, 8))
    else setSelectedDate(addWeeks(selectedDate, 1))
  }, [isDay, isMonth, isStacked, selectedDate, setSelectedDate])

  const headerLabel = isDay
    ? format(selectedDate, 'EEEE, MMMM d, yyyy')
    : isMonth
    ? format(selectedDate, 'MMMM yyyy')
    : isStacked
    ? `${format(selectedDate, 'MMM d')} – ${format(stackedEnd, stackedEnd.getMonth() === selectedDate.getMonth() ? 'd, yyyy' : 'MMM d, yyyy')}`
    : `${format(weekStart, 'MMMM d')} – ${format(endOfWeek(selectedDate, { weekStartsOn: 0 }), 'd, yyyy')}`

  // Touch swipe detection — skip if a modal/panel is open, or if in stacked view (which has its own 8-day horizontal ribbon)
  const touchStartX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    if (isStacked) return
    if ((e.target as HTMLElement).closest('[data-panel-overlay]')) return
    touchStartX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (isStacked) return
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
      if (isStacked) return
      const dir = (e as CustomEvent<{ dir: 'next' | 'prev' }>).detail?.dir
      if (dir === 'next') goNext()
      else if (dir === 'prev') goPrev()
    }
    el.addEventListener('casa:swipe', handler)
    return () => el.removeEventListener('casa:swipe', handler)
  }, [goNext, goPrev, isStacked])

  // Slide animation variants
  const variants = {
    enter: (d: number) => ({ x: d === 0 ? 0 : d > 0 ? '100%' : '-100%', opacity: d === 0 ? 0 : 1 }),
    center: { x: 0, opacity: 1 },
    exit:  (d: number) => ({ x: d === 0 ? 0 : d > 0 ? '-100%' : '100%', opacity: d === 0 ? 0 : 1 }),
  }

  const animKey = `${activeView}-${format(selectedDate, 'yyyy-MM-dd')}`

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Top toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-2.5 sm:py-3 gap-2 bg-casa-bg border-b border-casa-border/40 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button
            onClick={goToToday}
            variant="secondary"
            size="sm"
          >
            Today
          </Button>
          {!isStacked && (
            <>
              <IconButton onClick={goPrev} aria-label="Previous calendar period" icon={<ChevronLeft size={18} />} />
              <IconButton onClick={goNext} aria-label="Next calendar period" icon={<ChevronRight size={18} />} />
            </>
          )}
          <h2 className="font-display text-body-lg sm:text-heading text-casa-text ml-1 truncate">
            {headerLabel}
          </h2>
        </div>

        <div className="relative flex items-center gap-2 w-full sm:w-auto shrink-0">
          {/* Circle '+' button styled like the switches on the LEFT side */}
          <IconButton
            icon={<Plus size={18} strokeWidth={2.4} />}
            aria-label="Add new event or reminder"
            onClick={() => setFolioOpen((prev) => !prev)}
            variant="secondary"
            size="sm"
            className="w-10 h-10 rounded-full shadow-card bg-casa-surface hover:bg-casa-surface border border-casa-border hover:border-casa-gold/60 text-casa-text hover:text-casa-gold shrink-0 transition-all active:scale-95"
          />

          <SegmentedControl
            aria-label="Calendar view"
            value={activeView}
            options={CALENDAR_VIEW_OPTIONS}
            onChange={setActiveView}
          />

          {/* Anchored Popover for PalmBeachFolioCard */}
          <AnimatePresence>
            {folioOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-black/20 backdrop-blur-2xs"
                  onClick={() => setFolioOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 z-50">
                  <PalmBeachFolioCard
                    contextDate={selectedDate}
                    initialStart={selectedDate}
                    mode="popover"
                    onClose={() => setFolioOpen(false)}
                  />
                </div>
              </>
            )}
          </AnimatePresence>
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

      <RecurringDeleteUndoHost />
    </div>
  )
}