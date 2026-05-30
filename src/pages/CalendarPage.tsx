import { useState, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCalendarStore } from '../stores/calendarStore'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, subDays, addMonths, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import WeekView from '../components/calendar/WeekView'
import StackedView from '../components/calendar/StackedView'
import DayView from '../components/calendar/DayView'
import MonthView from '../components/calendar/MonthView'
import AIAssistantFab from '../components/shared/AIAssistantFab'
import { useWeekEvents } from '../hooks/useCalendarEvents'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useHomeWeather } from '../hooks/useHomeWeather'
import type { CalendarView } from '../types'

const views: { key: CalendarView; label: string }[] = [
  { key: 'today', label: 'Day' },
  { key: 'stacked', label: 'Stacked' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
]

export default function CalendarPage() {
  const { activeView, setActiveView, selectedDate, setSelectedDate } = useCalendarStore()
  const { data: weekEvents } = useWeekEvents(selectedDate)
  const { data: family } = useFamilyMembers()
  const { data: weather } = useHomeWeather()

  // Track slide direction: 1 = forward (next), -1 = backward (prev), 0 = today jump
  const [direction, setDirection] = useState(1)

  const isDay = activeView === 'today'
  const isMonth = activeView === 'month'
  const isStacked = activeView === 'stacked'

  // Stacked view always anchors to today — use today as header base so the
  // label matches what StackedView actually renders (rolling 8-day window).
  const headerBase = isStacked ? new Date() : selectedDate
  const weekStart = startOfWeek(headerBase, { weekStartsOn: 0 })
  const stackedEnd = addDays(new Date(), 7)

  const goToToday = () => { setDirection(0); setSelectedDate(new Date()) }
  const goPrev = useCallback(() => {
    setDirection(-1)
    if (isDay) setSelectedDate(subDays(selectedDate, 1))
    else if (isMonth) setSelectedDate(subMonths(selectedDate, 1))
    else setSelectedDate(subWeeks(selectedDate, 1))
  }, [isDay, isMonth, selectedDate, setSelectedDate])
  const goNext = useCallback(() => {
    setDirection(1)
    if (isDay) setSelectedDate(addDays(selectedDate, 1))
    else if (isMonth) setSelectedDate(addMonths(selectedDate, 1))
    else setSelectedDate(addWeeks(selectedDate, 1))
  }, [isDay, isMonth, selectedDate, setSelectedDate])

  const headerLabel = isDay
    ? format(selectedDate, 'EEEE, MMMM d, yyyy')
    : isMonth
    ? format(selectedDate, 'MMMM yyyy')
    : isStacked
    ? `${format(new Date(), 'MMM d')} – ${format(stackedEnd, stackedEnd.getMonth() === new Date().getMonth() ? 'd, yyyy' : 'MMM d, yyyy')}`
    : `${format(weekStart, 'MMMM d')} – ${format(endOfWeek(selectedDate, { weekStartsOn: 0 }), 'd, yyyy')}`

  // Touch swipe detection
  const touchStartX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(delta) < 50) return
    if (delta < 0) goNext()  // swipe left → next
    else goPrev()             // swipe right → prev
  }

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
      <div className="flex items-center justify-between px-6 py-3 border-b border-casa-border bg-casa-bg">
        <div className="flex items-center gap-3">
          <button
            onClick={goToToday}
            className="px-3 py-1.5 rounded-button border border-casa-border text-body-sm font-semibold text-casa-navy hover:bg-casa-surface transition-colors"
          >
            Today
          </button>
          {!isStacked && (
            <>
              <button onClick={goPrev} className="p-1.5 rounded-button hover:bg-casa-divider transition-colors text-casa-muted">
                <ChevronLeft size={18} />
              </button>
              <button onClick={goNext} className="p-1.5 rounded-button hover:bg-casa-divider transition-colors text-casa-muted">
                <ChevronRight size={18} />
              </button>
            </>
          )}
          <h2 className="font-display text-heading text-casa-navy ml-2">
            {headerLabel}
          </h2>
        </div>

        <div className="hidden md:flex gap-1 bg-casa-divider rounded-button p-1">
          {views.map((v) => (
            <button
              key={v.key}
              onClick={() => setActiveView(v.key)}
              className={`px-4 py-1.5 rounded-button text-body-sm font-medium transition-colors ${
                activeView === v.key
                  ? 'bg-casa-surface text-casa-navy shadow-card'
                  : 'text-casa-muted hover:text-casa-text'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* View content — animated slide + swipe */}
      <div
        className="flex-1 overflow-hidden relative"
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

      <AIAssistantFab
        page="calendar"
        events={weekEvents ?? []}
        family={family ?? []}
        homeCity={weather?.city}
      />
    </div>
  )
}